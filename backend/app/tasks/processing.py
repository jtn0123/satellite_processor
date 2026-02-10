"""Celery tasks wrapping the core satellite processor"""

import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

from ..celery_app import celery_app
from ..config import settings

# Add parent project to path for core imports
sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from satellite_processor.core.processor import SatelliteImageProcessor

logger = logging.getLogger(__name__)

# --- Bug 7: Lazy Redis initialization ---
_redis = None


def _get_redis():
    global _redis
    if _redis is None:
        import redis
        _redis = redis.Redis.from_url(settings.redis_url)
    return _redis


# --- Bug 2: Shared DB engine (lazy singleton) ---
_sync_engine = None


def _get_sync_db():
    """Get a synchronous DB session for use in Celery tasks"""
    global _sync_engine
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    if _sync_engine is None:
        # Convert async URL to sync
        sync_url = settings.database_url.replace("+aiosqlite", "").replace("+asyncpg", "+psycopg2")
        _sync_engine = create_engine(sync_url)
    return Session(_sync_engine)


def _publish_progress(job_id: str, progress: int, message: str, status: str = "processing"):
    """Publish progress update to Redis pub/sub"""
    payload = json.dumps({
        "job_id": job_id,
        "progress": progress,
        "message": message,
        "status": status,
    })
    _get_redis().publish(f"job:{job_id}", payload)


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


def _configure_processor(processor: SatelliteImageProcessor, params: dict):
    """Configure processor settings from API params — single source of truth.
    
    Does NOT let SettingsManager load from ~/.satellite_processor/.
    All configuration comes from the API params passed to the task.
    """
    sm = processor.settings_manager

    # Prevent loading from disk — override with API params only
    sm._settings = {}

    if params.get("crop"):
        crop = params["crop"]
        sm.set("crop_enabled", True)
        sm.set("crop_x", crop.get("x", 0))
        sm.set("crop_y", crop.get("y", 0))
        sm.set("crop_width", crop.get("w", 1920))
        sm.set("crop_height", crop.get("h", 1080))

    if params.get("false_color"):
        fc = params["false_color"]
        sm.set("false_color_enabled", True)
        sm.set("false_color_method", fc.get("method", "vegetation"))

    if params.get("timestamp"):
        ts = params["timestamp"]
        sm.set("timestamp_enabled", True)
        sm.set("timestamp_position", ts.get("position", "bottom-left"))

    if params.get("scale"):
        sc = params["scale"]
        sm.set("scale_enabled", True)
        sm.set("scale_factor", sc.get("factor", 1.0))


@celery_app.task(bind=True, name="process_images")
def process_images_task(self, job_id: str, params: dict):
    """Batch image processing task"""
    logger.info(f"Starting image processing job {job_id}")

    _update_job_db(
        job_id,
        status="processing",
        started_at=datetime.now(timezone.utc),
        status_message="Initializing processor...",
    )
    _publish_progress(job_id, 0, "Initializing processor...", "processing")

    try:
        processor = SatelliteImageProcessor(options=params)
        _configure_processor(processor, params)

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
        # If image_paths were resolved from image_ids, use them
        image_paths = params.get("image_paths")
        if image_paths:
            # Create staging dir with just these images if not already done
            staging = Path(input_path)
            if not staging.exists():
                staging.mkdir(parents=True, exist_ok=True)
                for p in image_paths:
                    src = Path(p)
                    if src.exists():
                        dst = staging / src.name
                        if not dst.exists():
                            try:
                                dst.symlink_to(src)
                            except OSError:
                                import shutil
                                shutil.copy2(str(src), str(dst))

        processor.set_input_directory(input_path)
        processor.set_output_directory(output_path)

        success = processor.process()

        if success:
            _update_job_db(
                job_id,
                status="completed",
                progress=100,
                output_path=output_path,
                completed_at=datetime.now(timezone.utc),
                status_message="Processing complete",
            )
            _publish_progress(job_id, 100, "Processing complete", "completed")
        else:
            _update_job_db(
                job_id,
                status="failed",
                error="Processing returned False",
                completed_at=datetime.now(timezone.utc),
                status_message="Processing failed",
            )
            _publish_progress(job_id, 0, "Processing failed", "failed")

    except Exception as e:
        logger.exception(f"Job {job_id} failed")
        _update_job_db(
            job_id,
            status="failed",
            error=str(e),
            completed_at=datetime.now(timezone.utc),
            status_message=f"Error: {e}",
        )
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise


@celery_app.task(bind=True, name="create_video")
def create_video_task(self, job_id: str, params: dict):
    """Video creation task"""
    logger.info(f"Starting video creation job {job_id}")

    _update_job_db(
        job_id,
        status="processing",
        started_at=datetime.now(timezone.utc),
        status_message="Initializing video creation...",
    )
    _publish_progress(job_id, 0, "Initializing video creation...", "processing")

    try:
        processor = SatelliteImageProcessor(options=params)
        _configure_processor(processor, params)

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

        # Bug 1: Gather input files and call create_video with correct signature
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
            _update_job_db(
                job_id,
                status="completed",
                progress=100,
                output_path=output_path,
                completed_at=datetime.now(timezone.utc),
                status_message="Video creation complete",
            )
            _publish_progress(job_id, 100, "Video creation complete", "completed")
        else:
            _update_job_db(
                job_id,
                status="failed",
                error="Video creation returned False",
                completed_at=datetime.now(timezone.utc),
            )
            _publish_progress(job_id, 0, "Video creation failed", "failed")

    except Exception as e:
        logger.exception(f"Video job {job_id} failed")
        _update_job_db(
            job_id,
            status="failed",
            error=str(e),
            completed_at=datetime.now(timezone.utc),
            status_message=f"Error: {e}",
        )
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise
