"""Job logging helpers — async for FastAPI, sync for Celery tasks."""
from __future__ import annotations

import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from ..db.models import JobLog
from ..utils import utcnow

logger = logging.getLogger(__name__)


async def log_job(
    db: AsyncSession,
    job_id: str,
    message: str,
    level: str = "info",
) -> None:
    """Write a log entry (async) and return."""
    entry = JobLog(job_id=job_id, message=message, level=level, timestamp=utcnow())
    db.add(entry)
    await db.commit()


def log_job_sync(
    session: Session,
    job_id: str,
    message: str,
    level: str = "info",
    *,
    redis_client=None,
) -> None:
    """Write a log entry (sync, for Celery) and optionally broadcast via Redis."""
    ts = utcnow()
    entry = JobLog(job_id=job_id, message=message, level=level, timestamp=ts)
    session.add(entry)
    session.commit()

    # Broadcast to WebSocket listeners
    if redis_client is not None:
        try:
            payload = json.dumps({
                "type": "log",
                "job_id": job_id,
                "level": level,
                "message": message,
                "timestamp": ts.isoformat(),
            })
            redis_client.publish(f"job:{job_id}", payload)
        except Exception:
            logger.debug("Redis unavailable, skipping log broadcast for job %s", job_id)
