"""Celery tasks for GOES data fetching and gap backfilling."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path

from ..celery_app import celery_app
from ..config import settings

logger = logging.getLogger(__name__)

_redis = None


def _get_redis():
    global _redis
    if _redis is None:
        import redis
        _redis = redis.Redis.from_url(settings.redis_url)
    return _redis


_sync_engine = None


def _get_sync_db():
    """Get a synchronous DB session for use in Celery tasks."""
    global _sync_engine
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    if _sync_engine is None:
        sync_url = settings.database_url.replace("+aiosqlite", "").replace("+asyncpg", "+psycopg2")
        _sync_engine = create_engine(sync_url)
    return Session(_sync_engine)


def _publish_progress(job_id: str, progress: int, message: str, status: str = "processing"):
    """Publish progress update to Redis pub/sub."""
    payload = json.dumps({
        "job_id": job_id,
        "progress": progress,
        "message": message,
        "status": status,
    })
    _get_redis().publish(f"job:{job_id}", payload)


def _update_job_db(job_id: str, **kwargs):
    """Update job record in the database (sync)."""
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


@celery_app.task(bind=True, name="fetch_goes_data")
def fetch_goes_data(self, job_id: str, params: dict):
    """Download GOES frames for a time range and create Image records."""
    from ..services.goes_fetcher import fetch_frames

    logger.info("Starting GOES fetch job %s", job_id)
    _update_job_db(
        job_id,
        status="processing",
        started_at=datetime.now(UTC),
        status_message="Fetching GOES data...",
    )
    _publish_progress(job_id, 0, "Fetching GOES data...", "processing")

    try:
        satellite = params["satellite"]
        sector = params["sector"]
        band = params["band"]
        start_time = datetime.fromisoformat(params["start_time"])
        end_time = datetime.fromisoformat(params["end_time"])
        output_dir = str(Path(settings.output_dir) / f"goes_{job_id}")

        def on_progress(current: int, total: int):
            pct = int(current / total * 100) if total > 0 else 0
            msg = f"Downloading frame {current}/{total}"
            _publish_progress(job_id, pct, msg)
            _update_job_db(job_id, progress=pct, status_message=msg)

        results = fetch_frames(
            satellite=satellite,
            sector=sector,
            band=band,
            start_time=start_time,
            end_time=end_time,
            output_dir=output_dir,
            on_progress=on_progress,
        )

        # Create Image records
        from ..db.models import Image
        session = _get_sync_db()
        try:
            for frame in results:
                path = Path(frame["path"])
                img_record = Image(
                    id=str(uuid.uuid4()),
                    filename=path.name,
                    original_name=path.name,
                    file_path=str(path),
                    file_size=path.stat().st_size if path.exists() else 0,
                    satellite=frame["satellite"],
                    channel=frame["band"],
                    captured_at=frame["scan_time"],
                    source="goes_fetch",
                )
                session.add(img_record)
            session.commit()
        finally:
            session.close()

        _update_job_db(
            job_id,
            status="completed",
            progress=100,
            output_path=output_dir,
            completed_at=datetime.now(UTC),
            status_message=f"Fetched {len(results)} frames",
        )
        _publish_progress(job_id, 100, f"Fetched {len(results)} frames", "completed")

    except Exception as e:
        logger.exception("GOES fetch job %s failed", job_id)
        _update_job_db(
            job_id,
            status="failed",
            error=str(e),
            completed_at=datetime.now(UTC),
            status_message=f"Error: {e}",
        )
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise


@celery_app.task(bind=True, name="backfill_gaps")
def backfill_gaps(self, job_id: str, params: dict):
    """Run gap detection then fetch missing frames."""
    logger.info("Starting backfill job %s", job_id)
    _update_job_db(
        job_id,
        status="processing",
        started_at=datetime.now(UTC),
        status_message="Detecting gaps...",
    )
    _publish_progress(job_id, 0, "Detecting gaps...", "processing")

    try:
        # Run gap detection synchronously
        import asyncio
        from ..db.database import async_session
        from ..services.gap_detector import find_gaps

        satellite = params.get("satellite")
        band = params.get("band")
        sector = params.get("sector", "FullDisk")
        expected_interval = params.get("expected_interval", 10.0)

        async def _find():
            async with async_session() as session:
                return await find_gaps(
                    session,
                    satellite=satellite,
                    band=band,
                    expected_interval=expected_interval,
                )

        gaps = asyncio.run(_find())

        if not gaps:
            _update_job_db(
                job_id,
                status="completed",
                progress=100,
                completed_at=datetime.now(UTC),
                status_message="No gaps found",
            )
            _publish_progress(job_id, 100, "No gaps found", "completed")
            return

        _publish_progress(job_id, 10, f"Found {len(gaps)} gaps, fetching...", "processing")

        from ..services.goes_fetcher import fetch_frames

        total_fetched = 0
        output_dir = str(Path(settings.output_dir) / f"backfill_{job_id}")

        for i, gap in enumerate(gaps):
            start = datetime.fromisoformat(gap["start"])
            end = datetime.fromisoformat(gap["end"])
            results = fetch_frames(
                satellite=satellite or "GOES-16",
                sector=sector,
                band=band or "C02",
                start_time=start,
                end_time=end,
                output_dir=output_dir,
            )
            total_fetched += len(results)

            # Create Image records
            from ..db.models import Image
            session = _get_sync_db()
            try:
                for frame in results:
                    path = Path(frame["path"])
                    img_record = Image(
                        id=str(uuid.uuid4()),
                        filename=path.name,
                        original_name=path.name,
                        file_path=str(path),
                        file_size=path.stat().st_size if path.exists() else 0,
                        satellite=frame["satellite"],
                        channel=frame["band"],
                        captured_at=frame["scan_time"],
                        source="goes_fetch",
                    )
                    session.add(img_record)
                session.commit()
            finally:
                session.close()

            pct = 10 + int((i + 1) / len(gaps) * 90)
            _publish_progress(job_id, pct, f"Filled gap {i + 1}/{len(gaps)}")

        _update_job_db(
            job_id,
            status="completed",
            progress=100,
            output_path=output_dir,
            completed_at=datetime.now(UTC),
            status_message=f"Backfilled {total_fetched} frames across {len(gaps)} gaps",
        )
        _publish_progress(job_id, 100, f"Backfilled {total_fetched} frames", "completed")

    except Exception as e:
        logger.exception("Backfill job %s failed", job_id)
        _update_job_db(
            job_id,
            status="failed",
            error=str(e),
            completed_at=datetime.now(UTC),
            status_message=f"Error: {e}",
        )
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise
