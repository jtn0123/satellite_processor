"""Celery tasks for scheduled fetches and auto-cleanup."""
from __future__ import annotations

import logging
import os
import uuid
from datetime import timedelta

from ..celery_app import celery_app
from ..config import settings
from ..utils import utcnow

logger = logging.getLogger(__name__)

_sync_engine = None


def _get_sync_db():
    global _sync_engine
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    if _sync_engine is None:
        sync_url = settings.database_url.replace("+aiosqlite", "").replace("+asyncpg", "+psycopg2")
        _sync_engine = create_engine(sync_url, pool_size=5, max_overflow=10, pool_recycle=3600)
    return Session(_sync_engine)


@celery_app.task(bind=True, name="check_schedules")
def check_schedules(self):
    """Check for due schedules and kick off fetch jobs. Re-queues itself."""
    from ..db.models import FetchPreset, FetchSchedule, Job

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

            job_id = str(uuid.uuid4())
            end_time = now
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
                    "end_time": end_time.isoformat(),
                    "preset_id": preset.id,
                    "schedule_id": schedule.id,
                },
            )
            session.add(job)

            schedule.last_run_at = now
            schedule.next_run_at = now + timedelta(minutes=schedule.interval_minutes)

            logger.info("Scheduled fetch: job=%s preset=%s schedule=%s", job_id, preset.name, schedule.name)

            # Kick off the actual fetch
            from .goes_tasks import fetch_goes_data
            fetch_goes_data.delay(job_id, job.params)

        session.commit()
        logger.info("Schedule check complete: %d jobs launched", len(due))

    except Exception:
        session.rollback()
        logger.exception("Error checking schedules")
    finally:
        session.close()

    # Re-queue self in 60 seconds
    check_schedules.apply_async(countdown=60)


@celery_app.task(bind=True, name="run_cleanup")
def run_cleanup(self):
    """Run cleanup based on active rules. Re-queues itself hourly."""
    from sqlalchemy import func as sa_func
    from sqlalchemy import select as sa_select

    from ..db.models import CleanupRule, CollectionFrame, GoesFrame

    session = _get_sync_db()
    try:
        rules = session.query(CleanupRule).filter(CleanupRule.is_active == True).all()  # noqa: E712
        if not rules:
            logger.info("No active cleanup rules")
            run_cleanup.apply_async(countdown=3600)
            return

        total_deleted = 0
        total_freed = 0

        for rule in rules:
            protected_ids: set[str] = set()
            if rule.protect_collections:
                rows = session.execute(sa_select(CollectionFrame.frame_id)).all()
                protected_ids = {r[0] for r in rows}

            frames_to_delete = []

            if rule.rule_type == "max_age_days":
                cutoff = utcnow() - timedelta(days=rule.value)
                frames = session.query(GoesFrame).filter(GoesFrame.created_at < cutoff).all()
                frames_to_delete = [f for f in frames if f.id not in protected_ids]

            elif rule.rule_type == "max_storage_gb":
                total_bytes = session.execute(
                    sa_select(sa_func.coalesce(sa_func.sum(GoesFrame.file_size), 0))
                ).scalar() or 0
                max_bytes = rule.value * 1024 * 1024 * 1024

                if total_bytes > max_bytes:
                    frames = session.query(GoesFrame).order_by(GoesFrame.created_at.asc()).all()
                    excess = total_bytes - max_bytes
                    freed = 0
                    for f in frames:
                        if freed >= excess:
                            break
                        if f.id not in protected_ids:
                            frames_to_delete.append(f)
                            freed += f.file_size or 0

            for frame in frames_to_delete:
                for path in [frame.file_path, frame.thumbnail_path]:
                    if path:
                        try:
                            os.remove(path)
                        except OSError:
                            pass
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

    # Re-queue in 1 hour
    run_cleanup.apply_async(countdown=3600)
