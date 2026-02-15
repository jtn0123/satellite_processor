"""Celery tasks for scheduled fetches and auto-cleanup."""
from __future__ import annotations

import logging
import os
import uuid
from datetime import timedelta

from ..celery_app import celery_app
from ..utils import utcnow
from .helpers import _get_sync_db

logger = logging.getLogger(__name__)


def _launch_schedule_job(session, schedule, preset, now):
    """Create and dispatch a fetch job for a due schedule."""
    from ..db.models import Job

    job_id = str(uuid.uuid4())
    start_time = now - timedelta(minutes=schedule.interval_minutes)

    job = Job(
        id=job_id,
        status="pending",
        job_type="goes_fetch",
        params={
            "satellite": preset.satellite,
            "sector": preset.sector,
            "band": preset.band,
            "start_time": start_time.isoformat(),
            "end_time": now.isoformat(),
            "preset_id": preset.id,
            "schedule_id": schedule.id,
        },
    )
    session.add(job)

    schedule.last_run_at = now
    schedule.next_run_at = now + timedelta(minutes=schedule.interval_minutes)

    session.flush()  # ensure job row is visible before dispatching to Celery

    logger.info("Scheduled fetch: job=%s preset=%s schedule=%s", job_id, preset.name, schedule.name)

    from .goes_tasks import fetch_goes_data
    fetch_goes_data.delay(job_id, job.params)


@celery_app.task(bind=True, name="check_schedules")
def check_schedules(self):
    """Check for due schedules and kick off fetch jobs."""
    from ..db.models import FetchPreset, FetchSchedule

    session = _get_sync_db()
    try:
        now = utcnow()
        due = (
            session.query(FetchSchedule)
            .filter(FetchSchedule.is_active == True, FetchSchedule.next_run_at <= now)  # noqa: E712
            .all()
        )

        for schedule in due:
            preset = session.query(FetchPreset).filter(FetchPreset.id == schedule.preset_id).first()
            if not preset:
                logger.warning("Schedule %s references missing preset %s", schedule.id, schedule.preset_id)
                continue
            _launch_schedule_job(session, schedule, preset, now)

        session.commit()
        logger.info("Schedule check complete: %d jobs launched", len(due))

    except Exception:
        session.rollback()
        logger.exception("Error checking schedules")
    finally:
        session.close()


def _get_protected_frame_ids(session, protect_collections: bool) -> set[str]:
    """Return IDs of frames in collections if protection is enabled."""
    from sqlalchemy import select as sa_select

    from ..db.models import CollectionFrame

    if not protect_collections:
        return set()
    rows = session.execute(sa_select(CollectionFrame.frame_id)).all()
    return {r[0] for r in rows}


def _collect_age_based_deletions(session, rule, protected_ids: set[str]) -> list:
    """Find frames older than the rule's max age that are not protected."""
    from ..db.models import GoesFrame

    cutoff = utcnow() - timedelta(days=rule.value)
    frames = session.query(GoesFrame).filter(GoesFrame.created_at < cutoff).all()
    return [f for f in frames if f.id not in protected_ids]


def _collect_storage_based_deletions(session, rule, protected_ids: set[str]) -> list:
    """Find oldest frames to delete to bring storage under the limit."""
    from sqlalchemy import func as sa_func
    from sqlalchemy import select as sa_select

    from ..db.models import GoesFrame

    total_bytes = session.execute(
        sa_select(sa_func.coalesce(sa_func.sum(GoesFrame.file_size), 0))
    ).scalar() or 0
    max_bytes = rule.value * 1024 * 1024 * 1024

    if total_bytes <= max_bytes:
        return []

    frames = session.query(GoesFrame).order_by(GoesFrame.created_at.asc()).all()
    excess = total_bytes - max_bytes
    freed = 0
    result = []
    for f in frames:
        if freed >= excess:
            break
        if f.id not in protected_ids:
            result.append(f)
            freed += f.file_size or 0
    return result


def _delete_frame_files(frame):
    """Remove a frame's files from disk."""
    for path in [frame.file_path, frame.thumbnail_path]:
        if path:
            try:
                os.remove(path)
            except OSError:
                pass


@celery_app.task(bind=True, name="run_cleanup")
def run_cleanup(self):
    """Run cleanup based on active rules."""
    from ..db.models import CleanupRule

    session = _get_sync_db()
    try:
        rules = session.query(CleanupRule).filter(CleanupRule.is_active == True).all()  # noqa: E712
        if not rules:
            logger.info("No active cleanup rules")
            return

        total_deleted = 0
        total_freed = 0

        for rule in rules:
            protected_ids = _get_protected_frame_ids(session, rule.protect_collections)

            if rule.rule_type == "max_age_days":
                frames_to_delete = _collect_age_based_deletions(session, rule, protected_ids)
            elif rule.rule_type == "max_storage_gb":
                frames_to_delete = _collect_storage_based_deletions(session, rule, protected_ids)
            else:
                frames_to_delete = []

            for frame in frames_to_delete:
                _delete_frame_files(frame)
                total_freed += frame.file_size or 0
                session.delete(frame)
                total_deleted += 1

        session.commit()
        logger.info("Cleanup complete: deleted %d frames, freed %d bytes", total_deleted, total_freed)

    except Exception:
        session.rollback()
        logger.exception("Error running cleanup")
    finally:
        session.close()
