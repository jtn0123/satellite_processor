"""Shared Celery task helpers — Redis, sync DB, progress publishing."""

import json
import logging

from ..config import settings

logger = logging.getLogger(__name__)

_redis = None


def _get_redis():
    """Get Redis client with lazy initialization."""
    global _redis
    if _redis is None:
        import redis
        _redis = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=5)
    return _redis


_sync_engine = None
_SessionFactory = None


def _get_sync_db():
    """Get a synchronous DB session for use in Celery tasks.

    Uses a proper sessionmaker bound to a single shared engine.
    """
    global _sync_engine, _SessionFactory
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    if _sync_engine is None:
        sync_url = settings.database_url.replace("+aiosqlite", "").replace("+asyncpg", "+psycopg2")
        _sync_engine = create_engine(sync_url, pool_size=5, max_overflow=10, pool_recycle=3600)
        _SessionFactory = sessionmaker(bind=_sync_engine)
    return _SessionFactory()


def _publish_progress(job_id: str, progress: int, message: str, status: str = "processing"):
    """Publish progress update to Redis pub/sub. Fails silently if Redis is down."""
    try:
        payload = json.dumps({
            "job_id": job_id,
            "progress": progress,
            "message": message,
            "status": status,
        })
        r = _get_redis()
        r.publish(f"job:{job_id}", payload)
        if status in ("completed", "failed"):
            r.publish("sat_processor:events", json.dumps({
                "type": f"job_{status}",
                "job_id": job_id,
                "message": message,
            }))
    except Exception:
        logger.debug("Redis unavailable, skipping progress publish for job %s", job_id)


_last_progress_update: dict[str, int] = {}


def _update_job_db(job_id: str, **kwargs):
    """Update job record in the database (sync). Throttles progress-only updates to every 5%."""
    from ..db.models import Job

    # Throttle: if only progress changed, skip unless 5% delta or 100%
    if set(kwargs.keys()) <= {"progress", "status_message"} and "progress" in kwargs:
        new_progress = kwargs["progress"]
        last = _last_progress_update.get(job_id, 0)
        if new_progress < 100 and (new_progress - last) < 5:
            return
        _last_progress_update[job_id] = new_progress

    session = _get_sync_db()
    try:
        job = session.query(Job).filter(Job.id == job_id).first()
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)
            session.commit()
    finally:
        session.close()
