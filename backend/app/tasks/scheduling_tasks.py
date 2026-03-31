"""Celery tasks for scheduled fetches and auto-cleanup."""

from __future__ import annotations

import logging
import uuid
from datetime import timedelta

from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy.exc import SQLAlchemyError

from ..celery_app import celery_app
from ..utils import safe_remove, utcnow
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

    # Dispatch to the correct task based on satellite type
    from ..services.satellite_registry import SATELLITE_REGISTRY

    sat_config = SATELLITE_REGISTRY.get(preset.satellite)
    if sat_config and sat_config.format == "hsd":
        if preset.band == "TrueColor":
            from .himawari_fetch_task import fetch_himawari_true_color

            fetch_himawari_true_color.delay(job_id, job.params)
        else:
            from .himawari_fetch_task import fetch_himawari_data

            fetch_himawari_data.delay(job_id, job.params)
    else:
        from .fetch_task import fetch_goes_data

        fetch_goes_data.delay(job_id, job.params)


@celery_app.task(bind=True, name="check_schedules", soft_time_limit=300, time_limit=360)
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

    except SoftTimeLimitExceeded:
        session.rollback()
        logger.warning("check_schedules timed out")
        raise
    except (SQLAlchemyError, ConnectionError):
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
    query = session.query(GoesFrame).filter(GoesFrame.created_at < cutoff)
    if rule.satellite:
        query = query.filter(GoesFrame.satellite == rule.satellite)
    frames = query.all()
    return [f for f in frames if f.id not in protected_ids]


def _collect_storage_based_deletions(session, rule, protected_ids: set[str]) -> list:
    """Find oldest frames to delete to bring storage under the limit."""
    from sqlalchemy import func as sa_func
    from sqlalchemy import select as sa_select

    from ..db.models import GoesFrame

    size_query = sa_select(sa_func.coalesce(sa_func.sum(GoesFrame.file_size), 0))
    if rule.satellite:
        size_query = size_query.where(GoesFrame.satellite == rule.satellite)
    total_bytes = session.execute(size_query).scalar() or 0
    max_bytes = rule.value * 1024 * 1024 * 1024

    if total_bytes <= max_bytes:
        return []

    return _pick_frames_for_deletion(session, rule, protected_ids, total_bytes - max_bytes)


def _pick_frames_for_deletion(session, rule, protected_ids: set[str], excess: int) -> list:
    """Select oldest unprotected frames to free enough storage."""
    from ..db.models import GoesFrame

    freed = 0
    result = []
    batch_size = 500
    offset = 0
    while freed < excess:
        query = session.query(GoesFrame).order_by(GoesFrame.created_at.asc())
        if rule.satellite:
            query = query.filter(GoesFrame.satellite == rule.satellite)
        batch = query.offset(offset).limit(batch_size).all()
        if not batch:
            break
        for f in batch:
            if freed >= excess:
                break
            if f.id not in protected_ids:
                result.append(f)
                freed += f.file_size or 0
        offset += batch_size
    return result


def _delete_frame_files(frame):
    """Remove a frame's files from disk."""
    for path in [frame.file_path, frame.thumbnail_path]:
        if path:
            safe_remove(path)


@celery_app.task(bind=True, name="run_cleanup", soft_time_limit=600, time_limit=660)
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
                logger.warning("Unknown cleanup rule_type: %s", rule.rule_type)
                frames_to_delete = []

            for frame in frames_to_delete:
                _delete_frame_files(frame)
                total_freed += frame.file_size or 0
                session.delete(frame)
                total_deleted += 1

        session.commit()
        logger.info("Cleanup complete: deleted %d frames, freed %d bytes", total_deleted, total_freed)

    except SoftTimeLimitExceeded:
        session.rollback()
        logger.warning("run_cleanup timed out")
        raise
    except (SQLAlchemyError, OSError):
        session.rollback()
        logger.exception("Error running cleanup")
    finally:
        session.close()
