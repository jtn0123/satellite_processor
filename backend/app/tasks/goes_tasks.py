"""Celery tasks for GOES data fetching and gap backfilling."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from pathlib import Path

from ..celery_app import celery_app
from ..config import settings
from ..utils import utcnow

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
    """Get a synchronous DB session for use in Celery tasks."""
    global _sync_engine
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    if _sync_engine is None:
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
        _get_redis().publish(f"job:{job_id}", payload)
    except Exception:
        logger.debug("Redis unavailable, skipping progress publish for job %s", job_id)


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
        started_at=utcnow(),
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

        # Log S3 prefixes being searched for debugging
        from ..services.goes_fetcher import (
            SATELLITE_AVAILABILITY,
            SATELLITE_BUCKETS,
            _build_s3_prefix,
            list_available,
        )

        bucket = SATELLITE_BUCKETS[satellite]
        current_hour = start_time.replace(minute=0, second=0, microsecond=0)
        from datetime import timedelta as _td

        end_ceil = end_time.replace(minute=0, second=0, microsecond=0) + _td(hours=1)
        while current_hour < end_ceil:
            prefix = _build_s3_prefix(satellite, sector, band, current_hour)
            logger.info("Searching S3: s3://%s/%s", bucket, prefix)
            current_hour += _td(hours=1)

        # Check available count before downloading
        available = list_available(satellite, sector, band, start_time, end_time)
        available_count = len(available)
        logger.info(
            "Found %d available frames for %s %s %s [%s → %s]",
            available_count, satellite, sector, band,
            start_time.isoformat(), end_time.isoformat(),
        )

        def on_progress(current: int, total: int):
            pct = int(current / total * 100) if total > 0 else 0
            msg = f"Downloading frame {current}/{total}"
            _publish_progress(job_id, pct, msg)
            _update_job_db(job_id, progress=pct, status_message=msg)

        logger.info(
            "Searching S3 for %s %s %s from %s to %s",
            satellite, sector, band, start_time.isoformat(), end_time.isoformat(),
        )

        results = fetch_frames(
            satellite=satellite,
            sector=sector,
            band=band,
            start_time=start_time,
            end_time=end_time,
            output_dir=output_dir,
            on_progress=on_progress,
        )

        # Create Image + GoesFrame records and auto-collection
        from ..db.models import Collection, CollectionFrame, GoesFrame, Image
        from ..services.thumbnail import generate_thumbnail, get_image_dimensions

        session = _get_sync_db()
        try:
            # Auto-create a collection for this fetch job
            collection = Collection(
                id=str(uuid.uuid4()),
                name=f"GOES Fetch {satellite} {band} {sector}",
                description=f"Auto-created from fetch job {job_id}",
            )
            session.add(collection)

            for frame in results:
                path = Path(frame["path"])
                file_size = path.stat().st_size if path.exists() else 0
                width, height = get_image_dimensions(str(path))
                thumb_path = generate_thumbnail(str(path), output_dir)

                # Legacy Image record
                img_record = Image(
                    id=str(uuid.uuid4()),
                    filename=path.name,
                    original_name=path.name,
                    file_path=str(path),
                    file_size=file_size,
                    satellite=frame["satellite"],
                    channel=frame["band"],
                    captured_at=frame["scan_time"],
                    source="goes_fetch",
                    width=width,
                    height=height,
                )
                session.add(img_record)

                # New GoesFrame record
                gf_id = str(uuid.uuid4())
                goes_frame = GoesFrame(
                    id=gf_id,
                    satellite=frame["satellite"],
                    sector=sector,
                    band=frame["band"],
                    capture_time=frame["scan_time"],
                    file_path=str(path),
                    file_size=file_size,
                    width=width,
                    height=height,
                    thumbnail_path=thumb_path,
                    source_job_id=job_id,
                )
                session.add(goes_frame)

                # Add to auto-collection
                session.add(CollectionFrame(collection_id=collection.id, frame_id=gf_id))

            session.commit()
        finally:
            session.close()

        # Build descriptive status message
        fetched_count = len(results)
        if fetched_count == 0 and available_count == 0:
            avail = SATELLITE_AVAILABILITY.get(satellite, {})
            avail_hint = ""
            if avail.get("available_to"):
                avail_hint = (
                    f" {satellite} data is only available from "
                    f"{avail['available_from']} through {avail['available_to']}."
                )
            status_msg = (
                f"No frames found on S3 for {satellite} {sector} {band} "
                f"between {start_time.strftime('%Y-%m-%d %H:%M')} and "
                f"{end_time.strftime('%Y-%m-%d %H:%M')}.{avail_hint}"
            )
        elif fetched_count < available_count:
            failed = available_count - fetched_count
            status_msg = (
                f"Fetched {fetched_count} of {available_count} frames "
                f"({failed} failed to download)"
            )
        else:
            status_msg = f"Fetched {fetched_count} frames"

        _update_job_db(
            job_id,
            status="completed",
            progress=100,
            output_path=output_dir,
            completed_at=utcnow(),
            status_message=status_msg,
        )
        _publish_progress(job_id, 100, status_msg, "completed")

    except Exception as e:
        logger.exception("GOES fetch job %s failed", job_id)
        _update_job_db(
            job_id,
            status="failed",
            error=str(e),
            completed_at=utcnow(),
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
        started_at=utcnow(),
        status_message="Detecting gaps...",
    )
    _publish_progress(job_id, 0, "Detecting gaps...", "processing")

    try:
        # #206: Use sync DB for gap detection instead of asyncio.run() which is fragile
        from ..db.models import Image

        satellite = params.get("satellite")
        band = params.get("band")
        sector = params.get("sector", "FullDisk")
        expected_interval = params.get("expected_interval", 10.0)

        session = _get_sync_db()
        try:
            from sqlalchemy import select as sa_select
            query = sa_select(Image.captured_at).where(
                Image.captured_at.isnot(None)
            ).order_by(Image.captured_at.asc())
            if satellite:
                query = query.where(Image.satellite == satellite)
            if band:
                query = query.where(Image.channel == band)
            timestamps = [r[0] for r in session.execute(query).all()]
        finally:
            session.close()

        # Find gaps
        threshold = expected_interval * 1.5
        gaps = []
        for i in range(1, len(timestamps)):
            delta_minutes = (timestamps[i] - timestamps[i - 1]).total_seconds() / 60.0
            if delta_minutes > threshold:
                expected_frames = max(int(delta_minutes / expected_interval) - 1, 1)
                gaps.append({
                    "start": timestamps[i - 1].isoformat(),
                    "end": timestamps[i].isoformat(),
                    "duration_minutes": round(delta_minutes, 1),
                    "expected_frames": expected_frames,
                })

        if not gaps:
            _update_job_db(
                job_id,
                status="completed",
                progress=100,
                completed_at=utcnow(),
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
            completed_at=utcnow(),
            status_message=f"Backfilled {total_fetched} frames across {len(gaps)} gaps",
        )
        _publish_progress(job_id, 100, f"Backfilled {total_fetched} frames", "completed")

    except Exception as e:
        logger.exception("Backfill job %s failed", job_id)
        _update_job_db(
            job_id,
            status="failed",
            error=str(e),
            completed_at=utcnow(),
            status_message=f"Error: {e}",
        )
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise


@celery_app.task(bind=True, name="generate_composite")
def generate_composite(self, composite_id: str, job_id: str, params: dict):
    """Generate a band composite image from multiple GOES bands."""
    import numpy as np
    from PIL import Image as PILImage

    logger.info("Starting composite generation %s", composite_id)
    _update_job_db(
        job_id,
        status="processing",
        started_at=utcnow(),
        status_message="Generating composite...",
    )
    _publish_progress(job_id, 0, "Generating composite...", "processing")

    try:
        from ..db.models import Composite, GoesFrame

        _recipe = params["recipe"]  # noqa: F841 — kept for logging/future use
        satellite = params["satellite"]
        sector = params["sector"]
        capture_time = datetime.fromisoformat(params["capture_time"])
        bands = params["bands"]

        session = _get_sync_db()
        try:
            from sqlalchemy import func as sa_func
            from sqlalchemy import select as sa_select

            band_images = []
            for band_name in bands[:3]:  # RGB = first 3 bands
                query = (
                    sa_select(GoesFrame)
                    .where(
                        GoesFrame.satellite == satellite,
                        GoesFrame.sector == sector,
                        GoesFrame.band == band_name,
                    )
                    .order_by(
                        sa_func.abs(
                            sa_func.extract("epoch", GoesFrame.capture_time)
                            - sa_func.extract("epoch", capture_time)
                        )
                    )
                    .limit(1)
                )
                result = session.execute(query)
                frame = result.scalars().first()
                if frame and Path(frame.file_path).exists():
                    img = PILImage.open(frame.file_path).convert("L")
                    band_images.append(np.array(img, dtype=np.float32))
                else:
                    band_images.append(None)

            if not any(b is not None for b in band_images):
                raise ValueError("No band images found for composite")

            ref_shape = next(b.shape for b in band_images if b is not None)

            channels = []
            for b in band_images:
                if b is None:
                    channels.append(np.zeros(ref_shape, dtype=np.uint8))
                else:
                    if b.shape != ref_shape:
                        img_resized = PILImage.fromarray(b.astype(np.uint8)).resize(
                            (ref_shape[1], ref_shape[0]), PILImage.BILINEAR
                        )
                        b = np.array(img_resized, dtype=np.float32)
                    bmin, bmax = b.min(), b.max()
                    if bmax > bmin:
                        normalized = ((b - bmin) / (bmax - bmin) * 255).astype(np.uint8)
                    else:
                        normalized = np.zeros_like(b, dtype=np.uint8)
                    channels.append(normalized)

            rgb = np.stack(channels, axis=-1)
            composite_img = PILImage.fromarray(rgb, "RGB")

            output_dir = Path(settings.output_dir) / "composites"
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / f"{composite_id}.png"
            composite_img.save(str(output_path), "PNG")
            file_size = output_path.stat().st_size

            comp = session.query(Composite).filter(Composite.id == composite_id).first()
            if comp:
                comp.file_path = str(output_path)
                comp.file_size = file_size
                comp.status = "completed"
            session.commit()
        finally:
            session.close()

        _update_job_db(
            job_id,
            status="completed",
            progress=100,
            completed_at=utcnow(),
            status_message="Composite generated",
        )
        _publish_progress(job_id, 100, "Composite generated", "completed")

    except Exception as e:
        logger.exception("Composite generation %s failed", composite_id)

        session = _get_sync_db()
        try:
            comp = session.query(Composite).filter(Composite.id == composite_id).first()
            if comp:
                comp.status = "failed"
                comp.error = str(e)
            session.commit()
        finally:
            session.close()

        _update_job_db(
            job_id,
            status="failed",
            error=str(e),
            completed_at=utcnow(),
        )
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise
