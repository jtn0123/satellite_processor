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

import numpy as np
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



def _collect_timestamps_in_range(
    sector: str, band: str, start_time: datetime, end_time: datetime,
) -> list[dict]:
    """Collect available timestamps across all days in the time range."""
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
    return all_timestamps


def _handle_no_timestamps(
    job_id: str, satellite: str, sector: str, band: str,
    start_time: datetime, end_time: datetime, _log,
) -> None:
    """Handle the case when no timestamps are found — update job as failed."""
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


def _build_final_status(
    fetched_count: int, total_available: int, failed_downloads: int,
    was_capped: bool, max_frames_limit: int, label: str = "frames",
    satellite: str = "", sector: str = "", band: str = "",
) -> tuple[str, str]:
    """Build (status_msg, final_status) from fetch result counts."""
    if fetched_count == 0:
        if total_available > 0:
            return f"All {total_available} {label} failed to download", "failed"
        return f"No frames found for {satellite} {sector} {band}", "failed"

    if failed_downloads == 0 and not was_capped:
        return f"Fetched {fetched_count} {label}", "completed"

    parts = [f"Fetched {fetched_count} {label}"]
    if failed_downloads > 0:
        parts.append(f"{failed_downloads} failed to download")
    if was_capped:
        beyond = total_available - max_frames_limit
        parts.append(f"{beyond} beyond frame limit of {max_frames_limit}")
    return f"{parts[0]} ({', '.join(parts[1:])})", "completed_partial"


def _finalize_job(
    job_id: str, output_dir: str, status_msg: str, final_status: str, _log,
) -> None:
    """Write the final job status to DB and publish progress."""
    _log(status_msg, level="info" if final_status == "completed" else "warning")
    _update_job_db(
        job_id, status=final_status, progress=100, output_path=output_dir,
        completed_at=utcnow(), status_message=status_msg,
        **({"error": status_msg} if final_status == "completed_partial" else {}),
    )
    _publish_progress(job_id, 100, status_msg, final_status)


def _process_single_band_frame(
    bucket: str, satellite: str, sector: str, band: str,
    scan_time: datetime, output_dir: str,
) -> dict | None:
    """Download segments for one timestamp, assemble to PNG. Returns result dict or None."""
    segment_keys = _list_segments_for_timestamp(bucket, sector, band, scan_time)
    if not segment_keys:
        logger.warning("No segments found for %s %s %s at %s", satellite, sector, band, scan_time)
        return None

    segment_data = _download_segments_parallel(bucket, segment_keys)
    valid_segments = sum(1 for s in segment_data if s)
    if valid_segments == 0:
        logger.warning("All segment downloads failed for %s at %s", band, scan_time)
        return None

    logger.info("Downloaded %d/%d segments for %s at %s", valid_segments, len(segment_keys), band, scan_time)

    time_str = scan_time.strftime("%Y%m%d_%H%M")
    output_path = Path(output_dir) / f"{satellite}_{sector}_{band}_{time_str}.png"
    hsd_to_png(segment_data, output_path)

    return {
        "satellite": satellite,
        "sector": sector,
        "band": band,
        "scan_time": scan_time,
        "path": str(output_path),
    }


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
    all_timestamps = _collect_timestamps_in_range(sector, band, start_time, end_time)

    _log(f"Found {len(all_timestamps)} available timestamps on S3")
    logger.info(
        "Found %d Himawari timestamps for %s %s %s [%s → %s]",
        len(all_timestamps), satellite, sector, band,
        start_time.isoformat(), end_time.isoformat(),
    )

    if not all_timestamps:
        _handle_no_timestamps(job_id, satellite, sector, band, start_time, end_time, _log)
        return

    max_frames_limit = _read_max_frames_setting()
    was_capped = len(all_timestamps) > max_frames_limit
    timestamps_to_fetch = all_timestamps[:max_frames_limit]

    results: list[dict] = []
    failed_downloads = 0

    for i, ts in enumerate(timestamps_to_fetch):
        scan_time = datetime.fromisoformat(ts["scan_time"])

        pct = int((i / len(timestamps_to_fetch)) * 100)
        msg = f"Processing frame {i + 1}/{len(timestamps_to_fetch)}"
        _publish_progress(job_id, pct, msg)
        _update_job_db(job_id, progress=pct, status_message=msg)
        _log(msg)

        try:
            result = _process_single_band_frame(bucket, satellite, sector, band, scan_time, output_dir)
            if result is None:
                failed_downloads += 1
            else:
                results.append(result)
        except Exception:
            logger.exception("Failed to process frame at %s", scan_time)
            failed_downloads += 1

    if results:
        _create_himawari_fetch_records(job_id, sector, output_dir, results)

    status_msg, final_status = _build_final_status(
        len(results), len(all_timestamps), failed_downloads,
        was_capped, max_frames_limit, label="frames",
        satellite=satellite, sector=sector, band=band,
    )
    _finalize_job(job_id, output_dir, status_msg, final_status, _log)


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


# ---------------------------------------------------------------------------
# True Color composite helpers
# ---------------------------------------------------------------------------

# Himawari True Color band mapping: R=B03 (0.64µm), G=B02 (0.51µm), B=B01 (0.47µm)
_TRUE_COLOR_BANDS = ["B03", "B02", "B01"]


def _fetch_and_assemble_band(
    bucket: str,
    sector: str,
    band: str,
    scan_time: datetime,
) -> np.ndarray | None:
    """Fetch all segments for a single band and assemble into a full-disk array.

    Returns the raw calibrated float32 array, or None on failure.
    """
    from ..services.himawari_reader import assemble_segments, parse_hsd_data, parse_hsd_header

    segment_keys = _list_segments_for_timestamp(bucket, sector, band, scan_time)
    if not segment_keys:
        logger.warning("No segments found for %s at %s", band, scan_time)
        return None

    segment_data = _download_segments_parallel(bucket, segment_keys)
    valid_count = sum(1 for s in segment_data if s)
    if valid_count == 0:
        logger.warning("All segment downloads failed for %s at %s", band, scan_time)
        return None

    logger.info("Downloaded %d/%d segments for %s at %s", valid_count, len(segment_keys), band, scan_time)

    # Parse each segment
    parsed: list[np.ndarray | None] = []
    expected_cols: int | None = None
    for i, seg_bytes in enumerate(segment_data):
        if not seg_bytes:
            parsed.append(None)
            continue
        try:
            import bz2
            decompressed = bz2.decompress(seg_bytes)
            header = parse_hsd_header(decompressed)
            arr = parse_hsd_data(decompressed, header)
            parsed.append(arr)
            if expected_cols is None:
                expected_cols = header.num_columns
        except Exception:
            logger.warning("Failed to parse segment %d for %s", i + 1, band, exc_info=True)
            parsed.append(None)

    # Pad to 10 if needed
    while len(parsed) < 10:
        parsed.append(None)

    return assemble_segments(parsed, expected_columns=expected_cols)


def _normalize_channel_percentile(
    data: np.ndarray,
    pct_low: float = 2.0,
    pct_high: float = 98.0,
) -> np.ndarray:
    """Normalize a single channel to 0–255 uint8 using percentile stretch."""
    valid = data[np.isfinite(data)]
    if len(valid) == 0:
        return np.zeros(data.shape, dtype=np.uint8)

    vmin, vmax = np.nanpercentile(valid, [pct_low, pct_high])
    if vmax - vmin < 1e-6:
        vmax = vmin + 1.0

    stretched = np.clip(data, vmin, vmax)
    stretched = (stretched - vmin) * (255.0 / (vmax - vmin))
    np.nan_to_num(stretched, nan=0.0, copy=False)
    return stretched.astype(np.uint8)


def _composite_true_color(
    bands: list[np.ndarray],
    output_path: Path,
) -> Path:
    """Composite three band arrays (R, G, B) into an RGB PNG.

    Each channel is independently normalized using 2nd–98th percentile.
    Bands may have different resolutions (VIS=11000 cols, IR=5500 cols);
    all are resized to match the largest.

    Parameters
    ----------
    bands : list[np.ndarray]
        Three float32 arrays [Red, Green, Blue].
    output_path : Path
        Where to write the PNG.

    Returns
    -------
    Path
        The output_path written.
    """
    from PIL import Image as PILImage

    # Find the largest dimensions (B03/B02/B01 are all VIS so same res, but be safe)
    max_h = max(b.shape[0] for b in bands)
    max_w = max(b.shape[1] for b in bands)

    channels = []
    for band_arr in bands:
        normalized = _normalize_channel_percentile(band_arr)
        if normalized.shape[0] != max_h or normalized.shape[1] != max_w:
            img = PILImage.fromarray(normalized).resize((max_w, max_h), PILImage.BILINEAR)
            normalized = np.array(img)
        channels.append(normalized)

    rgb = np.stack(channels, axis=-1)
    img = PILImage.fromarray(rgb, "RGB")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(output_path))
    return output_path


def _process_true_color_frame(
    bucket: str, satellite: str, sector: str,
    scan_time: datetime, output_dir: str,
) -> dict | None:
    """Fetch all 3 bands for one timestamp and composite to True Color PNG.

    Returns result dict or None on failure.
    """
    band_arrays: list[np.ndarray | None] = []
    for band_name in _TRUE_COLOR_BANDS:
        arr = _fetch_and_assemble_band(bucket, sector, band_name, scan_time)
        band_arrays.append(arr)

    if any(b is None for b in band_arrays):
        missing = [n for n, b in zip(_TRUE_COLOR_BANDS, band_arrays, strict=False) if b is None]
        logger.warning("Missing bands %s for TrueColor at %s", missing, scan_time)
        return None

    time_str = scan_time.strftime("%Y%m%d_%H%M")
    output_path = Path(output_dir) / f"{satellite}_{sector}_TrueColor_{time_str}.png"
    _composite_true_color(band_arrays, output_path)

    return {
        "satellite": satellite,
        "sector": sector,
        "band": "TrueColor",
        "scan_time": scan_time,
        "path": str(output_path),
    }


def _execute_himawari_true_color(job_id: str, params: dict, _log) -> None:
    """Fetch B03, B02, B01 for each timestamp and composite into True Color RGB."""
    satellite = params["satellite"]
    sector = params["sector"]
    start_time = datetime.fromisoformat(params["start_time"])
    end_time = datetime.fromisoformat(params["end_time"])
    output_dir = str(Path(settings.output_dir) / f"himawari_tc_{job_id}")
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    bucket = SATELLITE_REGISTRY["Himawari-9"].bucket
    all_timestamps = _collect_timestamps_in_range(sector, "B03", start_time, end_time)

    _log(f"Found {len(all_timestamps)} available timestamps for True Color")
    logger.info(
        "Found %d timestamps for Himawari TrueColor [%s → %s]",
        len(all_timestamps), start_time.isoformat(), end_time.isoformat(),
    )

    if not all_timestamps:
        _handle_no_timestamps(job_id, satellite, sector, "TrueColor", start_time, end_time, _log)
        return

    max_frames_limit = _read_max_frames_setting()
    was_capped = len(all_timestamps) > max_frames_limit
    timestamps_to_fetch = all_timestamps[:max_frames_limit]

    results: list[dict] = []
    failed_downloads = 0

    for i, ts in enumerate(timestamps_to_fetch):
        scan_time = datetime.fromisoformat(ts["scan_time"])

        pct = int((i / len(timestamps_to_fetch)) * 100)
        msg = f"Processing TrueColor frame {i + 1}/{len(timestamps_to_fetch)}"
        _publish_progress(job_id, pct, msg)
        _update_job_db(job_id, progress=pct, status_message=msg)
        _log(msg)

        try:
            result = _process_true_color_frame(bucket, satellite, sector, scan_time, output_dir)
            if result is None:
                failed_downloads += 1
            else:
                results.append(result)
        except Exception:
            logger.exception("Failed to process TrueColor frame at %s", scan_time)
            failed_downloads += 1

    if results:
        _create_himawari_fetch_records(job_id, sector, output_dir, results)

    status_msg, final_status = _build_final_status(
        len(results), len(all_timestamps), failed_downloads,
        was_capped, max_frames_limit, label="TrueColor frames",
        satellite=satellite, sector=sector, band="TrueColor",
    )
    _finalize_job(job_id, output_dir, status_msg, final_status, _log)


@celery_app.task(
    bind=True,
    name="fetch_himawari_true_color",
    autoretry_for=(ConnectionError, TimeoutError, ClientError),
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def fetch_himawari_true_color(self, job_id: str, params: dict):
    """Fetch Himawari True Color composite (B03+B02+B01) for a time range."""
    logger.info("Starting Himawari True Color job %s", job_id)
    _update_job_db(
        job_id,
        status="processing",
        task_id=self.request.id,
        started_at=utcnow(),
        status_message="Fetching Himawari True Color...",
    )
    _publish_progress(job_id, 0, "Fetching Himawari True Color...", "processing")

    _log = _make_job_logger(job_id)
    _log(f"Himawari True Color started — {params.get('satellite')} {params.get('sector')}")

    try:
        _execute_himawari_true_color(job_id, params, _log)
    except Exception as e:
        logger.exception("Himawari True Color job %s failed", job_id)
        _log(f"Himawari True Color failed: {e}", "error")
        _update_job_db(
            job_id,
            status="failed",
            error=str(e),
            completed_at=utcnow(),
            status_message=f"Error: {e}",
        )
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise


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
