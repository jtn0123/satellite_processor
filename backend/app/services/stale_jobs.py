"""Detect and mark stale jobs that have been processing too long."""

import logging
from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Job
from ..utils import utcnow

logger = logging.getLogger(__name__)

STALE_PROCESSING_MINUTES = 30
STALE_PENDING_MINUTES = 60


async def mark_stale_jobs(db: AsyncSession) -> int:
    """Mark jobs stuck in 'processing' for >30 min as failed. Returns count."""
    cutoff = utcnow() - timedelta(minutes=STALE_PROCESSING_MINUTES)

    result = await db.execute(
        select(Job).where(
            Job.status == "processing",
            or_(
                Job.updated_at <= cutoff,
                Job.updated_at.is_(None),
                Job.started_at <= cutoff,
            ),
        )
    )
    stale_jobs = result.scalars().all()

    count = 0
    for job in stale_jobs:
        last_activity = job.updated_at or job.started_at or job.created_at
        if last_activity and last_activity <= cutoff:
            job.status = "failed"
            job.status_message = "Job timed out — worker may have crashed"
            job.completed_at = utcnow()
            count += 1
            logger.warning("Marked stale job %s as failed (last activity: %s)", job.id, last_activity)

    if count:
        await db.commit()

    return count


async def mark_stale_pending_jobs(db: AsyncSession) -> int:
    """Mark jobs stuck in 'pending' with no task_id for >1 hour as failed. Returns count."""
    cutoff = utcnow() - timedelta(minutes=STALE_PENDING_MINUTES)

    result = await db.execute(
        select(Job).where(
            Job.status == "pending",
            or_(Job.task_id.is_(None), Job.task_id == ""),
            Job.created_at <= cutoff,
        )
    )
    stale_jobs = result.scalars().all()

    count = 0
    for job in stale_jobs:
        job.status = "failed"
        job.status_message = "Job never picked up by worker — marked as stale"
        job.completed_at = utcnow()
        count += 1
        logger.warning("Marked stale pending job %s as failed (created: %s)", job.id, job.created_at)

    if count:
        await db.commit()

    return count


async def cleanup_all_stale(db: AsyncSession) -> dict:
    """Run both stale job cleanups. Returns counts."""
    processing = await mark_stale_jobs(db)
    pending = await mark_stale_pending_jobs(db)
    return {"stale_processing": processing, "stale_pending": pending, "total": processing + pending}
