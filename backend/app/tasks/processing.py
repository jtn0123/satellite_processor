"""Celery tasks wrapping the core satellite processor"""

import json
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


def _get_sync_db():
    """Get a synchronous DB session for use in Celery tasks"""
    global _sync_engine
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    if _sync_engine is None:
        # Convert async URL to sync
        sync_url = settings.database_url.replace("+aiosqlite", "").replace("+asyncpg", "+psycopg2")
        _sync_engine = create_engine(sync_url, pool_size=5, max_overflow=10, pool_recycle=3600)
    return Session(_sync_engine)


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
                       completed_at=utcnow(), status_message="Processing complete")
        _publish_progress(job_id, 100, "Processing complete", "completed")
    else:
        _update_job_db(job_id, status="failed", error="Processing returned False",
                       completed_at=utcnow(), status_message="Processing failed")
        _publish_progress(job_id, 0, "Processing failed", "failed")


@celery_app.task(bind=True, name="process_images")
def process_images_task(self, job_id: str, params: dict):
    """Batch image processing task"""
    logger.info("Starting image processing job %s", job_id, extra={"job_id": job_id})

    _update_job_db(job_id, status="processing", started_at=utcnow(),
                   status_message="Initializing processor...")
    _publish_progress(job_id, 0, "Initializing processor...", "processing")

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

        processor.on_progress = on_progress
        processor.on_status_update = lambda msg: (
            _publish_progress(job_id, -1, msg),
            _update_job_db(job_id, status_message=msg),
        )

        image_paths = params.get("image_paths")
        if image_paths:
            _stage_image_paths(input_path, image_paths)

        processor.set_input_directory(input_path)
        processor.set_output_directory(output_path)
        _finalize_job(job_id, processor.process(), output_path)

    except Exception as e:
        logger.exception("Job %s failed", job_id, extra={"job_id": job_id})
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

    _update_job_db(
        job_id,
        status="processing",
        started_at=utcnow(),
        status_message="Initializing video creation...",
    )
    _publish_progress(job_id, 0, "Initializing video creation...", "processing")

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
            _update_job_db(
                job_id,
                status="completed",
                progress=100,
                output_path=output_path,
                completed_at=utcnow(),
                status_message="Video creation complete",
            )
            _publish_progress(job_id, 100, "Video creation complete", "completed")
        else:
            _update_job_db(
                job_id,
                status="failed",
                error="Video creation returned False",
                completed_at=utcnow(),
            )
            _publish_progress(job_id, 0, "Video creation failed", "failed")

    except Exception as e:
        logger.exception("Video job %s failed", job_id, extra={"job_id": job_id})
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
