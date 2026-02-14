"""Detect and mark stale jobs that have been processing too long."""

import logging
from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Job
from ..utils import utcnow

logger = logging.getLogger(__name__)

STALE_THRESHOLD_MINUTES = 30


async def mark_stale_jobs(db: AsyncSession) -> int:
    """Mark jobs stuck in 'processing' for >30 min as failed. Returns count."""
    cutoff = utcnow() - timedelta(minutes=STALE_THRESHOLD_MINUTES)

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
        # Use updated_at if available, otherwise started_at
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
