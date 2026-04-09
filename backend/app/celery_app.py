"""Celery application configuration with reliability improvements."""

import logging
import traceback as traceback_mod

from celery import Celery
from celery.signals import task_failure, task_success
from kombu import Queue
from sqlalchemy.exc import SQLAlchemyError

from .config import settings

logger = logging.getLogger(__name__)

# JTN-399: Queue topology.
#
# We split work into four queues so a backlog on slow tasks (image processing,
# animation rendering) can't starve time-sensitive work like scheduled fetches
# or beat-scheduled cleanup. Each queue maps to its own worker pool in
# docker-compose so concurrency + memory limits can be tuned independently.
#
#   fetch    — network-bound: GOES + Himawari S3 downloads
#   process  — CPU-bound: image compositing, animation, video encoding
#   cleanup  — beat-driven maintenance: stale-job GC, disk cleanup
#   default  — everything else (health pings, scheduling dispatch, unknown)
#
# ``task_routes`` entries are matched against each task's registered
# ``name=...`` string. Glob-style ``*`` wildcards are supported by Celery so
# future tasks slot into the right queue automatically as long as they follow
# the naming convention.
CELERY_QUEUE_FETCH = "fetch"
CELERY_QUEUE_PROCESS = "process"
CELERY_QUEUE_CLEANUP = "cleanup"
CELERY_QUEUE_DEFAULT = "default"

CELERY_TASK_QUEUES: tuple[Queue, ...] = (
    Queue(CELERY_QUEUE_DEFAULT),
    Queue(CELERY_QUEUE_FETCH),
    Queue(CELERY_QUEUE_PROCESS),
    Queue(CELERY_QUEUE_CLEANUP),
)

CELERY_TASK_ROUTES: dict[str, dict[str, str]] = {
    # Fetch queue — network-bound downloads
    "fetch_goes_data": {"queue": CELERY_QUEUE_FETCH},
    "backfill_gaps": {"queue": CELERY_QUEUE_FETCH},
    "fetch_himawari_data": {"queue": CELERY_QUEUE_FETCH},
    "fetch_himawari_true_color": {"queue": CELERY_QUEUE_FETCH},
    "fetch_composite_data": {"queue": CELERY_QUEUE_FETCH},
    # Process queue — CPU-bound image/video work
    "process_images": {"queue": CELERY_QUEUE_PROCESS},
    "create_video": {"queue": CELERY_QUEUE_PROCESS},
    "generate_composite": {"queue": CELERY_QUEUE_PROCESS},
    "generate_animation": {"queue": CELERY_QUEUE_PROCESS},
    # Cleanup queue — beat-scheduled maintenance
    "run_cleanup": {"queue": CELERY_QUEUE_CLEANUP},
    # Default queue — everything else (beat-scheduled dispatch, etc.)
    "check_schedules": {"queue": CELERY_QUEUE_DEFAULT},
}

celery_app = Celery(
    "satellite_processor",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.tasks.processing",
        "app.tasks.fetch_task",
        "app.tasks.composite_task",
        "app.tasks.goes_tasks",
        "app.tasks.scheduling_tasks",
        "app.tasks.animation_tasks",
        "app.tasks.himawari_fetch_task",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Per-task time limits (seconds)
    task_soft_time_limit=1800,  # 30 min soft limit
    task_time_limit=3600,  # 60 min hard kill
    # Memory limits — reject tasks if worker memory too high
    worker_max_memory_per_child=512_000,  # 512 MB, restart worker after
    # Dead letter / retry settings
    task_reject_on_worker_lost=True,
    task_default_queue=CELERY_QUEUE_DEFAULT,
    task_default_retry_delay=60,
    task_max_retries=3,
    # JTN-399: declare all four queues so brokers without auto-create get
    # them on worker startup, then route each task by name.
    task_queues=CELERY_TASK_QUEUES,
    task_routes=CELERY_TASK_ROUTES,
    # Result expiry
    result_expires=86400,  # 24 hours
    # Celery Beat periodic schedules (replaces self-requeueing tasks).
    # JTN-399: pin each beat task to its target queue explicitly so the
    # scheduler doesn't fall back to the default queue if ``task_routes``
    # matching ever drifts.
    beat_schedule={
        "check-schedules": {
            "task": "check_schedules",
            "schedule": 60.0,
            "options": {"queue": CELERY_QUEUE_DEFAULT},
        },
        "run-cleanup": {
            "task": "run_cleanup",
            "schedule": 3600.0,
            "options": {"queue": CELERY_QUEUE_CLEANUP},
        },
    },
)


@task_failure.connect
def on_task_failure(sender=None, task_id=None, exception=None, tb=None, args=None, kwargs=None, **extra):
    """Log task failures with full stack traces and persist to failed_jobs table."""
    import json

    task_name = sender.name if sender else "unknown"
    tb_str = (
        "".join(traceback_mod.format_list(traceback_mod.extract_tb(exception.__traceback__)))
        if exception and hasattr(exception, "__traceback__")
        else str(tb)
    )
    logger.error(
        "Celery task FAILED: task=%s task_id=%s error=%s",
        task_name,
        task_id,
        exception,
        extra={
            "task_name": task_name,
            "task_id": task_id,
            "error": str(exception),
            "traceback": tb_str,
        },
    )

    # Persist to failed_jobs table for dead-letter tracking
    try:
        from .tasks.helpers import _get_sync_db

        session = _get_sync_db()
        try:
            from .models.failed_job import FailedJob

            retried_count = 0
            if sender and hasattr(sender, "request"):
                retried_count = getattr(sender.request, "retries", 0)

            entry = FailedJob(
                task_name=task_name,
                task_id=str(task_id) if task_id else "unknown",
                args=json.dumps(list(args) if args else [], default=str),
                kwargs=json.dumps(dict(kwargs) if kwargs else {}, default=str),
                exception=str(exception),
                traceback=tb_str,
                retried_count=retried_count,
            )
            session.add(entry)
            session.commit()
        except (SQLAlchemyError, OSError):
            logger.debug("Failed to persist failed job record", exc_info=True)
            session.rollback()
        finally:
            session.close()
    except (ImportError, OSError):
        logger.debug("Failed to get DB session for failed job tracking", exc_info=True)

    # Update metrics
    try:
        from .metrics import TASK_FAILURES

        TASK_FAILURES.labels(task_name=task_name).inc()
    except ImportError:
        pass


@task_success.connect
def on_task_success(sender=None, result=None, **kwargs):
    """Track task completions in metrics."""
    task_name = sender.name if sender else "unknown"
    try:
        from .metrics import TASK_COMPLETIONS

        TASK_COMPLETIONS.labels(task_name=task_name).inc()
    except ImportError:
        pass
