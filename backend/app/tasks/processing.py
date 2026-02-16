"""Celery tasks wrapping the core satellite processor"""

import logging
import sys
from pathlib import Path

from ..celery_app import celery_app
from ..config import settings
from ..services.processor import configure_processor
from ..utils import utcnow

# Add parent project to path for core imports (handles both local dev and Docker)
try:
    _project_root = str(Path(__file__).resolve().parents[4])
except IndexError:
    _project_root = str(Path(__file__).resolve().parents[-1])
sys.path.insert(0, _project_root)

from satellite_processor.core.processor import SatelliteImageProcessor

from ..services.job_logger import log_job_sync
from .helpers import _get_redis, _get_sync_db, _publish_progress, _update_job_db

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


def _finalize_job(job_id: str, success: bool, output_path: str) -> None:
    """Update job DB and publish final status."""
    if success:
        _update_job_db(job_id, status="completed", progress=100, output_path=output_path,
                       completed_at=utcnow(), status_message=MSG_PROCESSING_COMPLETE)
        _publish_progress(job_id, 100, MSG_PROCESSING_COMPLETE, "completed")
    else:
        _update_job_db(job_id, status="failed", error="Processing returned False",
                       completed_at=utcnow(), status_message=MSG_PROCESSING_FAILED)
        _publish_progress(job_id, 0, MSG_PROCESSING_FAILED, "failed")


@celery_app.task(bind=True, name="process_images")
def process_images_task(self, job_id: str, params: dict):
    """Batch image processing task"""
    logger.info("Starting image processing job %s", job_id, extra={"job_id": job_id})

    def _log(msg: str, level: str = "info") -> None:
        session = _get_sync_db()
        try:
            log_job_sync(session, job_id, msg, level, redis_client=_get_redis())
        except Exception:
            logger.debug("Failed to write job log: %s", msg)
        finally:
            session.close()

    _update_job_db(job_id, status="processing", started_at=utcnow(),
                   status_message="Initializing processor...")
    _publish_progress(job_id, 0, "Initializing processor...", "processing")
    _log("Image processing started")

    try:
        processor = SatelliteImageProcessor(options=params)
        configure_processor(processor, params)

        input_path = params.get("input_path", "")
        output_path = params.get("output_path", str(Path(settings.output_dir) / job_id))
        Path(output_path).mkdir(parents=True, exist_ok=True)

        def on_progress(operation: str, pct: int):
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
        _log(MSG_PROCESSING_COMPLETE if result else MSG_PROCESSING_FAILED, "info" if result else "error")

    except Exception as e:
        logger.exception("Job %s failed", job_id, extra={"job_id": job_id})
        _log(f"Processing failed: {e}", "error")
        _update_job_db(job_id, status="failed", error=str(e),
                       completed_at=utcnow(), status_message=f"Error: {e}")
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise
    finally:
        input_path = params.get("input_path", "")
        if input_path and "job_staging_" in input_path:
            import shutil
            shutil.rmtree(input_path, ignore_errors=True)


@celery_app.task(bind=True, name="create_video")
def create_video_task(self, job_id: str, params: dict):
    """Video creation task"""
    logger.info("Starting video creation job %s", job_id, extra={"job_id": job_id})

    def _log(msg: str, level: str = "info") -> None:
        session = _get_sync_db()
        try:
            log_job_sync(session, job_id, msg, level, redis_client=_get_redis())
        except Exception:
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

        def on_progress(operation: str, pct: int):
            msg = f"{operation}: {pct}%"
            _publish_progress(job_id, pct, msg)
            _update_job_db(job_id, progress=pct, status_message=msg)

        def on_status(msg: str):
            _publish_progress(job_id, -1, msg)
            _update_job_db(job_id, status_message=msg)

        processor.on_progress = on_progress
        processor.on_status_update = on_status
        processor.set_input_directory(input_path)
        processor.set_output_directory(output_path)

        # Gather input files and call create_video
        input_files = sorted(Path(input_path).glob("*"))
        input_files = [str(f) for f in input_files if f.is_file() and f.suffix.lower() in ('.png', '.jpg', '.jpeg', '.tif', '.tiff')]
        video_options = {
            "fps": params.get("video", {}).get("fps", 24),
            "codec": params.get("video", {}).get("codec", "h264"),
            "quality": params.get("video", {}).get("quality", 23),
            "encoder": params.get("video", {}).get("codec", "H.264"),
        }
        success = processor.create_video(input_files, output_path, video_options)

        if success:
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

    except Exception as e:
        logger.exception("Video job %s failed", job_id, extra={"job_id": job_id})
        _log(f"Video creation failed: {e}", "error")
        _update_job_db(
            job_id,
            status="failed",
            error=str(e),
            completed_at=utcnow(),
            status_message=f"Error: {e}",
        )
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise
    finally:
        # Clean up staging directory
        input_path = params.get("input_path", "")
        if input_path and "job_staging_" in input_path:
            import shutil
            shutil.rmtree(input_path, ignore_errors=True)
