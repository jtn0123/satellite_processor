"""Shared Celery task helpers — Redis, sync DB, progress publishing."""

import json
import logging
from contextlib import contextmanager

import redis.exceptions

from ..config import settings

logger = logging.getLogger(__name__)

#: Namespace prefix for distributed task locks (JTN-398).
_TASK_IDEMPOTENCY_NAMESPACE = "task_idem"

#: TTL for the distributed lock. One hour covers the slowest realistic
#: fetch/composite job; anything stuck longer than that is a hung worker
#: and should be retried anyway.
TASK_IDEMPOTENCY_TTL_SECONDS = 3_600

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
        _sync_engine = create_engine(sync_url, pool_size=5, max_overflow=10, pool_recycle=1800, pool_pre_ping=True)
        _SessionFactory = sessionmaker(bind=_sync_engine)
    return _SessionFactory()


def _publish_progress(job_id: str, progress: int, message: str, status: str = "processing"):
    """Publish progress update to Redis pub/sub. Fails silently if Redis is down."""
    try:
        payload = json.dumps(
            {
                "job_id": job_id,
                "progress": progress,
                "message": message,
                "status": status,
            }
        )
        r = _get_redis()
        r.publish(f"job:{job_id}", payload)
        if status in ("completed", "failed"):
            r.publish(
                "sat_processor:events",
                json.dumps(
                    {
                        "type": f"job_{status}",
                        "job_id": job_id,
                        "message": message,
                    }
                ),
            )
    except (redis.exceptions.RedisError, OSError):
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

    # Clean up completed/failed jobs from throttle tracker to prevent memory leak
    is_terminal = kwargs.get("status") in ("completed", "failed", "cancelled")
    if is_terminal:
        _last_progress_update.pop(job_id, None)

    session = _get_sync_db()
    try:
        job = session.query(Job).filter(Job.id == job_id).first()
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)
            session.commit()
    finally:
        session.close()


def _build_task_lock_key(key: str) -> str:
    """Return the Redis key used to lock a distributed task identifier."""
    return f"{_TASK_IDEMPOTENCY_NAMESPACE}:{key}"


@contextmanager
def with_idempotency(key: str, ttl_seconds: int = TASK_IDEMPOTENCY_TTL_SECONDS):
    """Distributed-lock context manager for Celery task idempotency (JTN-398).

    Wraps a block of worker-side work with a Redis ``SET key value NX EX``
    lock. The ``acquired`` boolean yielded by the context manager is
    ``True`` the first time a given ``key`` is seen and ``False`` on
    every subsequent attempt within the TTL window — callers should
    short-circuit with a no-op return when it is ``False``.

    Example::

        lock_key = f"fetch:{sat}:{sector}:{band}:{ts}"
        with with_idempotency(lock_key) as acquired:
            if not acquired:
                return
            ... do the work ...

    The lock is released on successful exit so that an eventually-run
    manual retry can proceed; on failure the lock is left in place until
    it expires, which prevents a flapping upstream error (e.g. S3 503s)
    from hammering the service with duplicate retries.

    When Redis is unreachable the helper fails open: ``acquired`` is
    ``True`` so the task still runs. Losing dedup during an outage is a
    less bad failure mode than dropping work silently.
    """
    redis_key = _build_task_lock_key(key)
    acquired = True
    try:
        client = _get_redis()
        # ``nx=True`` guarantees only one caller wins the race.
        result = client.set(redis_key, "1", nx=True, ex=ttl_seconds)
        acquired = bool(result)
    except (redis.exceptions.RedisError, OSError):
        logger.debug("Idempotency lock acquire failed for %s — proceeding", redis_key, exc_info=True)
        acquired = True

    exc_raised = False
    try:
        yield acquired
    except BaseException:
        exc_raised = True
        raise
    finally:
        if acquired and not exc_raised:
            # Release the lock only on successful exit so repeated
            # failures don't hammer the backend.
            try:
                client = _get_redis()
                client.delete(redis_key)
            except (redis.exceptions.RedisError, OSError):
                logger.debug("Idempotency lock release failed for %s", redis_key, exc_info=True)
