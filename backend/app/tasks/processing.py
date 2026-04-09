"""Celery tasks wrapping the core satellite processor"""

import logging
import sys
import time
from pathlib import Path
from typing import Any

import redis.exceptions
from sqlalchemy.exc import SQLAlchemyError

from ..celery_app import celery_app
from ..config import settings
from ..errors import ProcessorError
from ..services.processor import configure_processor
from ..utils import utcnow

# Expected failure modes inside the core processor pipeline. Anything in
# this tuple is logged-and-swallowed into a "Processing failed" status;
# other exceptions (``AttributeError``, ``TypeError``, unexpected
# ``RuntimeError``) are still logged and marked failed, but then
# re-raised so Celery surfaces them and alerting fires — previously a
# bare ``except Exception`` hid those bugs (JTN-393).
_EXPECTED_PROCESSING_ERRORS: tuple[type[BaseException], ...] = (
    ProcessorError,
    ValueError,
    FileNotFoundError,
    PermissionError,
    OSError,
    TimeoutError,
    ConnectionError,
    SQLAlchemyError,
    redis.exceptions.RedisError,
)

# Add parent project to path for core imports (handles both local dev and Docker)
try:
    _project_root = str(Path(__file__).resolve().parents[4])
except IndexError:
    _project_root = str(Path(__file__).resolve().parents[-1])
sys.path.insert(0, _project_root)

from satellite_processor.core.processor import SatelliteImageProcessor  # noqa: E402

from ..services.job_logger import log_job_sync  # noqa: E402
from .helpers import _get_redis, _get_sync_db, _publish_progress, _update_job_db  # noqa: E402

logger = logging.getLogger(__name__)

MSG_PROCESSING_COMPLETE = "Processing complete"
MSG_PROCESSING_FAILED = "Processing failed"
MSG_VIDEO_CREATION_COMPLETE = "Video creation complete"


def _stage_image_paths(input_path: str, image_paths: list[str]) -> None:
    """Create staging directory with symlinks/copies for resolved image paths."""
    staging = Path(input_path)
    if staging.exists():
        return
    staging.mkdir(parents=True, exist_ok=True)
    for p in image_paths:
        src = Path(p)
        if not src.exists():
            continue
        dst = staging / src.name
        if dst.exists():
            continue
        try:
            dst.symlink_to(src)
        except OSError:
            import shutil

            shutil.copy2(str(src), str(dst))


def _record_task_failure(
    job_id: str,
    exc: BaseException,
    *,
    task_label: str,
    status_prefix: str,
    include_type: bool = False,
) -> None:
    """Persist a task failure without letting bookkeeping hide the real error.

    CodeRabbit (PR1): the previous version inlined ``log_job_sync`` +
    ``_update_job_db`` + ``_publish_progress`` inside each task's except
    block with no guard. If any of those raised (broker outage, DB down,
    redis outage), the secondary exception would propagate out of the
    except block and mask the original ``exc`` — defeating JTN-393's
    narrow-except goal.

    This module-level helper wraps each bookkeeping call in its own
    try/except so a secondary failure is logged at exception level and
    swallowed, then the caller re-raises the ORIGINAL ``exc``.

    Extracted to module scope so the task bodies stay under Sonar's
    cognitive-complexity limit.
    """
    err_text = f"{type(exc).__name__}: {exc}" if include_type else str(exc)
    status_message = f"{status_prefix}: {type(exc).__name__}" if include_type else f"{status_prefix}: {exc}"
    log_label = "crashed" if include_type else "failed"

    # Best-effort job-log write; swallow all three possible IO errors.
    session = _get_sync_db()
    try:
        try:
            log_job_sync(
                session,
                job_id,
                f"{task_label} {log_label}: {err_text}",
                "error",
                redis_client=_get_redis(),
            )
        except (SQLAlchemyError, redis.exceptions.RedisError, OSError):
            logger.exception("Failed to write failure log for %s %s", task_label, job_id, extra={"job_id": job_id})
    finally:
        session.close()

    try:
        _update_job_db(
            job_id,
            status="failed",
            error=err_text,
            completed_at=utcnow(),
            status_message=status_message,
        )
    except (SQLAlchemyError, redis.exceptions.RedisError, OSError):
        logger.exception("Failed to mark %s %s as failed in DB", task_label, job_id, extra={"job_id": job_id})

    try:
        _publish_progress(job_id, 0, status_message, "failed")
    except (SQLAlchemyError, redis.exceptions.RedisError, OSError):
        logger.exception("Failed to publish failure progress for %s %s", task_label, job_id, extra={"job_id": job_id})


def _finalize_job(job_id: str, success: bool, output_path: str) -> None:
    """Update job DB and publish final status."""
    if success:
        _update_job_db(
            job_id,
            status="completed",
            progress=100,
            output_path=output_path,
            completed_at=utcnow(),
            status_message=MSG_PROCESSING_COMPLETE,
        )
        _publish_progress(job_id, 100, MSG_PROCESSING_COMPLETE, "completed")
    else:
        _update_job_db(
            job_id,
            status="failed",
            error="Processing returned False",
            completed_at=utcnow(),
            status_message=MSG_PROCESSING_FAILED,
        )
        _publish_progress(job_id, 0, MSG_PROCESSING_FAILED, "failed")


@celery_app.task(
    bind=True,
    name="process_images",
    autoretry_for=(ConnectionError, TimeoutError),
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def process_images_task(self: Any, job_id: str, params: dict[str, Any]) -> None:
    """Batch image processing task"""
    start_time = time.monotonic()
    logger.info("Starting image processing job %s", job_id, extra={"job_id": job_id})

    def _log(msg: str, level: str = "info") -> None:
        session = _get_sync_db()
        try:
            log_job_sync(session, job_id, msg, level, redis_client=_get_redis())
        except (SQLAlchemyError, redis.exceptions.RedisError, OSError):
            logger.debug("Failed to write job log: %s", msg)
        finally:
            session.close()

    _update_job_db(job_id, status="processing", started_at=utcnow(), status_message="Initializing processor...")
    _publish_progress(job_id, 0, "Initializing processor...", "processing")
    _log("Image processing started")

    try:
        processor = SatelliteImageProcessor(options=params)
        configure_processor(processor, params)

        input_path = params.get("input_path", "")
        output_path = params.get("output_path", str(Path(settings.output_dir) / job_id))
        Path(output_path).mkdir(parents=True, exist_ok=True)

        def on_progress(operation: str, pct: int) -> None:
            msg = f"{operation}: {pct}%"
            _publish_progress(job_id, pct, msg)
            _update_job_db(job_id, progress=pct, status_message=msg)
            if pct == 0 or pct == 100 or pct % 25 == 0:
                _log(msg)

        processor.on_progress = on_progress
        processor.on_status_update = lambda msg: (
            _publish_progress(job_id, -1, msg),
            _update_job_db(job_id, status_message=msg),
            _log(msg),
        )

        image_paths = params.get("image_paths")
        if image_paths:
            _stage_image_paths(input_path, image_paths)

        processor.set_input_directory(input_path)
        processor.set_output_directory(output_path)
        result = processor.process()
        _finalize_job(job_id, result, output_path)
        duration = time.monotonic() - start_time
        logger.info("Job %s completed in %.1fs", job_id, duration, extra={"job_id": job_id})
        _log(MSG_PROCESSING_COMPLETE if result else MSG_PROCESSING_FAILED, "info" if result else "error")

    except _EXPECTED_PROCESSING_ERRORS as e:
        # Task boundary: log failure, update job status, then re-raise
        # for Celery retry. Narrow tuple so unexpected exceptions
        # (e.g. AttributeError from a misconfigured processor) fall
        # through to the wider handler below instead of being masked.
        duration = time.monotonic() - start_time
        logger.exception("Job %s failed after %.1fs", job_id, duration, extra={"job_id": job_id})
        _record_task_failure(job_id, e, task_label="Processing", status_prefix="Error")
        raise
    except Exception as e:
        # JTN-393: Unexpected bug (AttributeError, TypeError, …).
        # Still mark the job failed so the UI doesn't spin forever,
        # but re-raise so Celery surfaces the true traceback and
        # alerting / DLQ pick it up instead of it being hidden
        # behind a generic "Processing failed" status.
        duration = time.monotonic() - start_time
        logger.exception(
            "Job %s hit unexpected %s after %.1fs",
            job_id,
            type(e).__name__,
            duration,
            extra={"job_id": job_id},
        )
        _record_task_failure(job_id, e, task_label="Processing", status_prefix="Crash", include_type=True)
        raise
    finally:
        input_path = params.get("input_path", "")
        if input_path and "job_staging_" in input_path:
            import shutil

            shutil.rmtree(input_path, ignore_errors=True)


@celery_app.task(
    bind=True,
    name="create_video",
    autoretry_for=(ConnectionError, TimeoutError),
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def create_video_task(self: Any, job_id: str, params: dict[str, Any]) -> None:
    """Video creation task"""
    start_time = time.monotonic()
    logger.info("Starting video creation job %s", job_id, extra={"job_id": job_id})

    def _log(msg: str, level: str = "info") -> None:
        session = _get_sync_db()
        try:
            log_job_sync(session, job_id, msg, level, redis_client=_get_redis())
        except (SQLAlchemyError, redis.exceptions.RedisError, OSError):
            logger.debug("Failed to write job log: %s", msg)
        finally:
            session.close()

    _update_job_db(
        job_id,
        status="processing",
        started_at=utcnow(),
        status_message="Initializing video creation...",
    )
    _publish_progress(job_id, 0, "Initializing video creation...", "processing")
    _log("Video creation started")

    try:
        processor = SatelliteImageProcessor(options=params)
        configure_processor(processor, params)

        input_path = params.get("input_path", "")
        output_path = params.get("output_path", str(Path(settings.output_dir) / job_id))
        Path(output_path).mkdir(parents=True, exist_ok=True)

        def on_progress(operation: str, pct: int) -> None:
            msg = f"{operation}: {pct}%"
            _publish_progress(job_id, pct, msg)
            _update_job_db(job_id, progress=pct, status_message=msg)

        def on_status(msg: str) -> None:
            _publish_progress(job_id, -1, msg)
            _update_job_db(job_id, status_message=msg)

        processor.on_progress = on_progress
        processor.on_status_update = on_status
        processor.set_input_directory(input_path)
        processor.set_output_directory(output_path)

        # Gather input files and call create_video
        input_files = sorted(Path(input_path).glob("*"))
        valid_exts = (".png", ".jpg", ".jpeg", ".tif", ".tiff")
        input_files = [str(f) for f in input_files if f.is_file() and f.suffix.lower() in valid_exts]
        video_options = {
            "fps": params.get("video", {}).get("fps", 24),
            "codec": params.get("video", {}).get("codec", "h264"),
            "quality": params.get("video", {}).get("quality", 23),
            "encoder": params.get("video", {}).get("codec", "H.264"),
        }
        success = processor.create_video(input_files, output_path, video_options)

        duration = time.monotonic() - start_time
        if success:
            logger.info("Video job %s completed in %.1fs", job_id, duration, extra={"job_id": job_id})
            _log(MSG_VIDEO_CREATION_COMPLETE)
            _update_job_db(
                job_id,
                status="completed",
                progress=100,
                output_path=output_path,
                completed_at=utcnow(),
                status_message=MSG_VIDEO_CREATION_COMPLETE,
            )
            _publish_progress(job_id, 100, MSG_VIDEO_CREATION_COMPLETE, "completed")
        else:
            _log("Video creation failed", "error")
            _update_job_db(
                job_id,
                status="failed",
                error="Video creation returned False",
                completed_at=utcnow(),
            )
            _publish_progress(job_id, 0, "Video creation failed", "failed")

    except _EXPECTED_PROCESSING_ERRORS as e:
        # Task boundary: log failure, update job status, then re-raise
        # for Celery retry. See :data:`_EXPECTED_PROCESSING_ERRORS`.
        duration = time.monotonic() - start_time
        logger.exception("Video job %s failed after %.1fs", job_id, duration, extra={"job_id": job_id})
        _record_task_failure(job_id, e, task_label="Video creation", status_prefix="Error")
        raise
    except Exception as e:
        # JTN-393: Unexpected bug — see process_images_task for rationale.
        duration = time.monotonic() - start_time
        logger.exception(
            "Video job %s hit unexpected %s after %.1fs",
            job_id,
            type(e).__name__,
            duration,
            extra={"job_id": job_id},
        )
        _record_task_failure(job_id, e, task_label="Video creation", status_prefix="Crash", include_type=True)
        raise
    finally:
        # Clean up staging directory
        input_path = params.get("input_path", "")
        if input_path and "job_staging_" in input_path:
            import shutil

            shutil.rmtree(input_path, ignore_errors=True)
