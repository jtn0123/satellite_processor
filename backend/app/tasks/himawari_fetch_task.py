"""Celery task for fetching Himawari-9 AHI data from NOAA S3.

Downloads HSD segments (bz2-compressed), assembles them into full-disk
images via the lightweight HSD parser, and creates GoesFrame + Image DB
records identical to the GOES pipeline.
"""
from __future__ import annotations

import logging
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path

from botocore.exceptions import ClientError

from ..celery_app import celery_app
from ..config import settings
from ..services.goes_fetcher import _get_s3_client, _retry_s3_operation
from ..services.himawari_catalog import (
    _build_himawari_prefix,
    _matches_himawari_band,
    _parse_himawari_filename,
    list_himawari_timestamps,
)
from ..services.himawari_reader import hsd_to_png
from ..services.satellite_registry import SATELLITE_REGISTRY
from ..utils import utcnow
from .helpers import _get_redis, _get_sync_db, _publish_progress, _update_job_db

logger = logging.getLogger(__name__)

# Number of parallel S3 segment downloads
_SEGMENT_WORKERS = 4

# Expected segments per full-disk band observation
_EXPECTED_SEGMENTS = 10


# ---------------------------------------------------------------------------
# S3 segment download helpers
# ---------------------------------------------------------------------------


def _list_segments_for_timestamp(
    bucket: str,
    sector: str,
    band: str,
    scan_time: datetime,
) -> list[str]:
    """List all S3 keys for a specific band/sector/timestamp.

    Returns keys sorted by segment number (S01 → S10).
    """
    prefix = _build_himawari_prefix(sector, scan_time)
    s3 = _get_s3_client()
    paginator = s3.get_paginator("list_objects_v2")

    def _do_list():
        keys: list[str] = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if _matches_himawari_band(key, band):
                    keys.append(key)
        return keys

    keys = _retry_s3_operation(_do_list, operation="himawari_list_segments")
    # Sort by segment number
    keys.sort(key=lambda k: (_parse_himawari_filename(k) or {}).get("segment", 0))
    return keys


def _download_segment(bucket: str, key: str) -> bytes:
    """Download a single HSD segment (bz2-compressed) from S3.

    Returns the raw bz2 bytes.
    """
    s3 = _get_s3_client()

    def _do_download():
        resp = s3.get_object(Bucket=bucket, Key=key)
        return resp["Body"].read()

    return _retry_s3_operation(_do_download, operation="himawari_download_segment")


def _download_segments_parallel(
    bucket: str,
    keys: list[str],
) -> list[bytes]:
    """Download segments in parallel, returning ordered list of bz2 bytes.

    Failed downloads produce empty bytes (``b""``) so the assembler can
    fill those strips with NaN.
    """
    results: dict[int, bytes] = {}

    with ThreadPoolExecutor(max_workers=_SEGMENT_WORKERS) as pool:
        future_to_idx = {
            pool.submit(_download_segment, bucket, key): idx
            for idx, key in enumerate(keys)
        }
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                results[idx] = future.result()
            except Exception:
                logger.warning("Failed to download segment %d: %s", idx + 1, keys[idx], exc_info=True)
                results[idx] = b""

    return [results.get(i, b"") for i in range(len(keys))]


# ---------------------------------------------------------------------------
# DB record creation (mirrors _create_fetch_records in fetch_task.py)
# ---------------------------------------------------------------------------


def _create_himawari_fetch_records(
    job_id: str,
    sector: str,
    output_dir: str,
    results: list[dict],
) -> None:
    """Create Image, GoesFrame, Collection, and CollectionFrame DB records."""
    from ..db.models import Collection, CollectionFrame, GoesFrame, Image
    from ..services.thumbnail import generate_thumbnail, get_image_dimensions

    session = _get_sync_db()
    try:
        sat = results[0]["satellite"] if results else "Himawari-9"
        band = results[0]["band"] if results else ""
        collection_name = f"Himawari Fetch {sat} {sector} {band}"
        existing_coll = (
            session.query(Collection)
            .filter(Collection.name == collection_name)
            .first()
        )
        if existing_coll:
            collection_id = existing_coll.id
        else:
            collection_id = str(uuid.uuid4())
            collection = Collection(
                id=collection_id,
                name=collection_name,
                description=f"Auto-created from Himawari fetch job {job_id}",
            )
            session.add(collection)

        frame_ids: list[str] = []
        for frame in results:
            path = Path(frame["path"])
            file_size = path.stat().st_size if path.exists() else 0
            width, height = get_image_dimensions(str(path))
            thumb_path = generate_thumbnail(str(path), output_dir)

            img_record = Image(
                id=str(uuid.uuid4()),
                filename=path.name,
                original_name=path.name,
                file_path=str(path),
                file_size=file_size,
                satellite=frame["satellite"],
                channel=frame["band"],
                captured_at=frame["scan_time"],
                source="himawari_fetch",
                width=width,
                height=height,
            )
            session.add(img_record)

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
            frame_ids.append(gf_id)

        session.flush()
        for gf_id in frame_ids:
            session.add(CollectionFrame(collection_id=collection_id, frame_id=gf_id))

        session.commit()
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Core fetch logic
# ---------------------------------------------------------------------------


def _read_max_frames_setting() -> int:
    """Read the max_frames_per_fetch setting from the DB, falling back to default."""
    from sqlalchemy.exc import SQLAlchemyError

    from ..db.models import AppSetting
    from ..services.goes_fetcher import DEFAULT_MAX_FRAMES

    max_frames_limit = DEFAULT_MAX_FRAMES
    session = _get_sync_db()
    try:
        setting = (
            session.query(AppSetting)
            .filter(AppSetting.key == "max_frames_per_fetch")
            .first()
        )
        if setting and isinstance(setting.value, (int, float)):
            max_frames_limit = max(1, min(int(setting.value), 1000))
    except (SQLAlchemyError, ValueError, TypeError):
        logger.debug("Could not read max_frames_per_fetch setting, using default")
    finally:
        session.close()
    return max_frames_limit


def _execute_himawari_fetch(job_id: str, params: dict, _log) -> None:
    """Run the core Himawari fetch logic: list timestamps, download segments, process, store."""
    satellite = params["satellite"]
    sector = params["sector"]
    band = params["band"]
    start_time = datetime.fromisoformat(params["start_time"])
    end_time = datetime.fromisoformat(params["end_time"])
    output_dir = str(Path(settings.output_dir) / f"himawari_{job_id}")
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    bucket = SATELLITE_REGISTRY["Himawari-9"].bucket

    # Collect timestamps across all days in the time range
    all_timestamps: list[dict] = []
    current_date = start_time.replace(hour=0, minute=0, second=0, microsecond=0)
    end_date = end_time.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    while current_date < end_date:
        day_timestamps = list_himawari_timestamps(sector, band, current_date)
        for ts in day_timestamps:
            scan_dt = datetime.fromisoformat(ts["scan_time"])
            if start_time <= scan_dt <= end_time:
                all_timestamps.append(ts)
        current_date += timedelta(days=1)

    _log(f"Found {len(all_timestamps)} available timestamps on S3")
    logger.info(
        "Found %d Himawari timestamps for %s %s %s [%s → %s]",
        len(all_timestamps), satellite, sector, band,
        start_time.isoformat(), end_time.isoformat(),
    )

    if not all_timestamps:
        msg = (
            f"No frames found on S3 for {satellite} {sector} {band} "
            f"between {start_time.strftime('%Y-%m-%d %H:%M')} and "
            f"{end_time.strftime('%Y-%m-%d %H:%M')}."
        )
        _log(msg, "warning")
        _update_job_db(
            job_id, status="failed", progress=100,
            completed_at=utcnow(), status_message=msg,
        )
        _publish_progress(job_id, 100, msg, "failed")
        return

    max_frames_limit = _read_max_frames_setting()
    was_capped = len(all_timestamps) > max_frames_limit
    timestamps_to_fetch = all_timestamps[:max_frames_limit]

    results: list[dict] = []
    failed_downloads = 0

    for i, ts in enumerate(timestamps_to_fetch):
        scan_time = datetime.fromisoformat(ts["scan_time"])

        # Progress
        pct = int((i / len(timestamps_to_fetch)) * 100)
        msg = f"Processing frame {i + 1}/{len(timestamps_to_fetch)}"
        _publish_progress(job_id, pct, msg)
        _update_job_db(job_id, progress=pct, status_message=msg)
        _log(msg)

        try:
            # List segment keys for this timestamp
            segment_keys = _list_segments_for_timestamp(bucket, sector, band, scan_time)
            if not segment_keys:
                logger.warning("No segments found for %s %s %s at %s", satellite, sector, band, scan_time)
                failed_downloads += 1
                continue

            # Download all segments in parallel
            segment_data = _download_segments_parallel(bucket, segment_keys)

            # Check if we got any actual data
            valid_segments = sum(1 for s in segment_data if s)
            if valid_segments == 0:
                logger.warning("All segment downloads failed for %s at %s", band, scan_time)
                failed_downloads += 1
                continue

            logger.info("Downloaded %d/%d segments for %s at %s", valid_segments, len(segment_keys), band, scan_time)

            # Process segments → PNG
            time_str = scan_time.strftime("%Y%m%d_%H%M")
            output_path = Path(output_dir) / f"{satellite}_{sector}_{band}_{time_str}.png"
            hsd_to_png(segment_data, output_path)

            results.append({
                "satellite": satellite,
                "sector": sector,
                "band": band,
                "scan_time": scan_time,
                "path": str(output_path),
            })

        except Exception:
            logger.exception("Failed to process frame at %s", scan_time)
            failed_downloads += 1

    # Create DB records
    if results:
        _create_himawari_fetch_records(job_id, sector, output_dir, results)

    # Build status message
    fetched_count = len(results)
    total_available = len(all_timestamps)

    if fetched_count == 0:
        if total_available > 0:
            status_msg = f"All {total_available} frames failed to download"
        else:
            status_msg = f"No frames found for {satellite} {sector} {band}"
        final_status = "failed"
    elif failed_downloads == 0 and not was_capped:
        status_msg = f"Fetched {fetched_count} frames"
        final_status = "completed"
    else:
        parts = [f"Fetched {fetched_count} frames"]
        if failed_downloads > 0:
            parts.append(f"{failed_downloads} failed to download")
        if was_capped:
            beyond = total_available - max_frames_limit
            parts.append(f"{beyond} beyond frame limit of {max_frames_limit}")
        status_msg = f"{parts[0]} ({', '.join(parts[1:])})"
        final_status = "completed_partial"

    _log(status_msg, level="info" if final_status == "completed" else "warning")
    _update_job_db(
        job_id, status=final_status, progress=100, output_path=output_dir,
        completed_at=utcnow(), status_message=status_msg,
        **({"error": status_msg} if final_status == "completed_partial" else {}),
    )
    _publish_progress(job_id, 100, status_msg, final_status)


def _make_job_logger(job_id: str):
    """Return a helper function that writes to the job log."""
    import redis.exceptions
    from sqlalchemy.exc import SQLAlchemyError

    from ..services.job_logger import log_job_sync

    def _log(msg: str, level: str = "info") -> None:
        session = _get_sync_db()
        try:
            log_job_sync(session, job_id, msg, level, redis_client=_get_redis())
        except (SQLAlchemyError, redis.exceptions.RedisError, OSError):
            logger.debug("Failed to write job log: %s", msg)
        finally:
            session.close()

    return _log


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------


@celery_app.task(
    bind=True,
    name="fetch_himawari_data",
    autoretry_for=(ConnectionError, TimeoutError, ClientError),
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def fetch_himawari_data(self, job_id: str, params: dict):
    """Download Himawari HSD segments for a time range, assemble, and create records."""
    logger.info("Starting Himawari fetch job %s", job_id)
    _update_job_db(
        job_id,
        status="processing",
        task_id=self.request.id,
        started_at=utcnow(),
        status_message="Fetching Himawari data...",
    )
    _publish_progress(job_id, 0, "Fetching Himawari data...", "processing")

    _log = _make_job_logger(job_id)
    _log(f"Himawari fetch started — {params.get('satellite')} {params.get('sector')} {params.get('band')}")

    try:
        _execute_himawari_fetch(job_id, params, _log)
    except Exception as e:
        logger.exception("Himawari fetch job %s failed", job_id)
        _log(f"Himawari fetch failed: {e}", "error")
        _update_job_db(
            job_id,
            status="failed",
            error=str(e),
            completed_at=utcnow(),
            status_message=f"Error: {e}",
        )
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise
