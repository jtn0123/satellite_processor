"""Celery application configuration with reliability improvements."""

import logging
import traceback as traceback_mod

from celery import Celery
from celery.signals import task_failure, task_success

from .config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "satellite_processor",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.processing", "app.tasks.goes_tasks", "app.tasks.scheduling_tasks", "app.tasks.animation_tasks"],
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
    task_soft_time_limit=1800,   # 30 min soft limit
    task_time_limit=3600,        # 60 min hard kill

    # Memory limits — reject tasks if worker memory too high
    worker_max_memory_per_child=512_000,  # 512 MB, restart worker after

    # Dead letter / retry settings
    task_reject_on_worker_lost=True,
    task_default_queue="default",
    task_default_retry_delay=60,
    task_max_retries=3,

    # Task-specific overrides
    task_routes={
        "fetch_goes_data": {"queue": "default"},
        "process_images": {"queue": "default"},
        "generate_animation": {"queue": "default"},
        "generate_composite": {"queue": "default"},
        "check_schedules": {"queue": "default"},
        "run_cleanup": {"queue": "default"},
    },

    # Result expiry
    result_expires=86400,  # 24 hours

    # Celery Beat periodic schedules (replaces self-requeueing tasks)
    beat_schedule={
        "check-schedules": {"task": "check_schedules", "schedule": 60.0},
        "run-cleanup": {"task": "run_cleanup", "schedule": 3600.0},
    },
)


@task_failure.connect
def on_task_failure(sender=None, task_id=None, exception=None, tb=None, **kwargs):
    """Log task failures with full stack traces for observability."""
    task_name = sender.name if sender else "unknown"
    tb_str = "".join(traceback_mod.format_list(traceback_mod.extract_tb(exception.__traceback__))) if exception and hasattr(exception, "__traceback__") else str(tb)
    logger.error(
        "Celery task FAILED: task=%s task_id=%s error=%s",
        task_name, task_id, exception,
        extra={
            "task_name": task_name,
            "task_id": task_id,
            "error": str(exception),
            "traceback": tb_str,
        },
    )

    # Update metrics
    try:
        from .metrics import TASK_FAILURES
        TASK_FAILURES.labels(task_name=task_name).inc()
    except Exception:
        pass


@task_success.connect
def on_task_success(sender=None, result=None, **kwargs):
    """Track task completions in metrics."""
    task_name = sender.name if sender else "unknown"
    try:
        from .metrics import TASK_COMPLETIONS
        TASK_COMPLETIONS.labels(task_name=task_name).inc()
    except Exception:
        pass
