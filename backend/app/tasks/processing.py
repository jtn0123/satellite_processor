"""Celery tasks wrapping the core satellite processor"""

import json
import sys
import logging
from pathlib import Path
from datetime import datetime

import redis

from ..celery_app import celery_app
from ..config import settings

# Add parent project to path for core imports
sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from satellite_processor.core.processor import SatelliteImageProcessor

logger = logging.getLogger(__name__)

# Synchronous Redis client for use inside Celery workers
_redis = redis.Redis.from_url(settings.redis_url)


def _get_sync_db():
    """Get a synchronous DB session for use in Celery tasks"""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    # Convert async URL to sync
    sync_url = settings.database_url.replace("+aiosqlite", "").replace("+asyncpg", "+psycopg2")
    engine = create_engine(sync_url)
    return Session(engine)


def _publish_progress(job_id: str, progress: int, message: str, status: str = "processing"):
    """Publish progress update to Redis pub/sub"""
    payload = json.dumps({
        "job_id": job_id,
        "progress": progress,
        "message": message,
        "status": status,
    })
    _redis.publish(f"job:{job_id}", payload)


def _update_job_db(job_id: str, **kwargs):
    """Update job record in the database (sync)"""
    from ..db.models import Job
    session = _get_sync_db()
    try:
        job = session.query(Job).filter(Job.id == job_id).first()
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)
            session.commit()
    finally:
        session.close()


@celery_app.task(bind=True, name="process_images")
def process_images_task(self, job_id: str, params: dict):
    """Batch image processing task"""
    logger.info(f"Starting image processing job {job_id}")

    _update_job_db(
        job_id,
        status="processing",
        started_at=datetime.utcnow(),
        status_message="Initializing processor...",
    )
    _publish_progress(job_id, 0, "Initializing processor...", "processing")

    try:
        processor = SatelliteImageProcessor(options=params)

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

        success = processor.process()

        if success:
            _update_job_db(
                job_id,
                status="completed",
                progress=100,
                output_path=output_path,
                completed_at=datetime.utcnow(),
                status_message="Processing complete",
            )
            _publish_progress(job_id, 100, "Processing complete", "completed")
        else:
            _update_job_db(
                job_id,
                status="failed",
                error="Processing returned False",
                completed_at=datetime.utcnow(),
                status_message="Processing failed",
            )
            _publish_progress(job_id, 0, "Processing failed", "failed")

    except Exception as e:
        logger.exception(f"Job {job_id} failed")
        _update_job_db(
            job_id,
            status="failed",
            error=str(e),
            completed_at=datetime.utcnow(),
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
        started_at=datetime.utcnow(),
        status_message="Initializing video creation...",
    )
    _publish_progress(job_id, 0, "Initializing video creation...", "processing")

    try:
        processor = SatelliteImageProcessor(options=params)

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

        success = processor.create_video()

        if success:
            _update_job_db(
                job_id,
                status="completed",
                progress=100,
                output_path=output_path,
                completed_at=datetime.utcnow(),
                status_message="Video creation complete",
            )
            _publish_progress(job_id, 100, "Video creation complete", "completed")
        else:
            _update_job_db(
                job_id,
                status="failed",
                error="Video creation returned False",
                completed_at=datetime.utcnow(),
            )
            _publish_progress(job_id, 0, "Video creation failed", "failed")

    except Exception as e:
        logger.exception(f"Video job {job_id} failed")
        _update_job_db(
            job_id,
            status="failed",
            error=str(e),
            completed_at=datetime.utcnow(),
            status_message=f"Error: {e}",
        )
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise
