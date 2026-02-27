"""Celery tasks for GOES data fetching and gap backfilling."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from pathlib import Path

from ..celery_app import celery_app
from ..config import settings
from ..services.job_logger import log_job_sync
from ..utils import utcnow
from .helpers import _get_redis, _get_sync_db, _publish_progress, _update_job_db

logger = logging.getLogger(__name__)


def _read_max_frames_setting() -> int:
    """Read the max_frames_per_fetch setting from the DB, falling back to default."""
    from ..db.models import AppSetting
    from ..services.goes_fetcher import DEFAULT_MAX_FRAMES

    max_frames_limit = DEFAULT_MAX_FRAMES
    session = _get_sync_db()
    try:
        setting = session.query(AppSetting).filter(
            AppSetting.key == "max_frames_per_fetch"
        ).first()
        if setting and isinstance(setting.value, (int, float)):
            max_frames_limit = max(1, min(int(setting.value), 1000))
    except Exception:
        logger.debug("Could not read max_frames_per_fetch setting, using default")
    finally:
        session.close()
    return max_frames_limit


def _create_fetch_records(
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
        # Bug #21: Reuse existing collection with same name instead of creating duplicates
        collection_name = f"GOES Fetch {results[0]['satellite'] if results else ''} {results[0]['band'] if results else ''} {sector}"
        existing_coll = session.query(Collection).filter(Collection.name == collection_name).first()
        if existing_coll:
            collection_id = existing_coll.id
        else:
            collection_id = str(uuid.uuid4())
            collection = Collection(
                id=collection_id,
                name=collection_name,
                description=f"Auto-created from fetch job {job_id}",
            )
            session.add(collection)

        frame_ids = []
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
                source="goes_fetch",
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


def _no_frames_message(
    satellite: str, sector: str, band: str,
    start_time: datetime, end_time: datetime,
    total_available: int,
) -> tuple[str, str]:
    """Return status message when zero frames were fetched."""
    if total_available > 0:
        return f"All {total_available} frames failed to download", "failed"

    from ..services.goes_fetcher import SATELLITE_AVAILABILITY

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
    return status_msg, "failed"


def _build_status_message(
    satellite: str,
    sector: str,
    band: str,
    start_time: datetime,
    end_time: datetime,
    fetched_count: int,
    total_available: int,
    was_capped: bool,
    failed_downloads: int,
    max_frames_limit: int,
) -> tuple[str, str]:
    """Return ``(status_message, final_status)`` for a fetch job."""
    if fetched_count == 0:
        return _no_frames_message(satellite, sector, band, start_time, end_time, total_available)

    if failed_downloads == 0 and not was_capped:
        return f"Fetched {fetched_count} frames", "completed"

    if failed_downloads == 0 and was_capped:
        return (
            f"Fetched {fetched_count} of {total_available} available frames "
            f"(frame limit: {max_frames_limit}). "
            f"Adjust limit in settings or narrow time range."
        ), "completed_partial"

    beyond_cap = total_available - max_frames_limit if was_capped else 0
    parts = [f"Fetched {fetched_count} frames"]
    if failed_downloads > 0:
        parts.append(f"{failed_downloads} failed to download")
    if beyond_cap > 0:
        parts.append(f"{beyond_cap} beyond frame limit of {max_frames_limit}")
    return f"{parts[0]} ({', '.join(parts[1:])})", "completed_partial"


def _make_job_logger(job_id: str):
    """Return a helper function that writes to the job log."""
    def _log(msg: str, level: str = "info") -> None:
        session = _get_sync_db()
        try:
            log_job_sync(session, job_id, msg, level, redis_client=_get_redis())
        except Exception:
            logger.debug("Failed to write job log: %s", msg)
        finally:
            session.close()
    return _log


def _log_s3_prefixes(satellite: str, sector: str, band: str, start_time: datetime, end_time: datetime) -> None:
    """Log the S3 prefixes that will be searched."""
    from datetime import timedelta as _td

    from ..services.goes_fetcher import SATELLITE_BUCKETS, _build_s3_prefix

    bucket = SATELLITE_BUCKETS[satellite]
    current_hour = start_time.replace(minute=0, second=0, microsecond=0)
    end_ceil = end_time.replace(minute=0, second=0, microsecond=0) + _td(hours=1)
    while current_hour < end_ceil:
        prefix = _build_s3_prefix(satellite, sector, band, current_hour)
        logger.info("Searching S3: s3://%s/%s", bucket, prefix)
        current_hour += _td(hours=1)


def _make_progress_callback(job_id: str, _log):
    """Return an on_progress callback for fetch_frames."""
    def on_progress(current: int, total: int):
        pct = int(current / total * 100) if total > 0 else 0
        msg = f"Downloading frame {current}/{total}"
        _publish_progress(job_id, pct, msg)
        _update_job_db(job_id, progress=pct, status_message=msg)
        _log(msg)
    return on_progress


def _execute_goes_fetch(job_id: str, params: dict, _log, *, defer_final_update: bool = False) -> None:
    """Run the core GOES fetch logic: list, download, store, and report."""
    from ..services.goes_fetcher import fetch_frames, list_available

    satellite, sector, band = params["satellite"], params["sector"], params["band"]
    start_time = datetime.fromisoformat(params["start_time"])
    end_time = datetime.fromisoformat(params["end_time"])
    output_dir = str(Path(settings.output_dir) / f"goes_{job_id}")

    _log_s3_prefixes(satellite, sector, band, start_time, end_time)

    available = list_available(satellite, sector, band, start_time, end_time)
    _log(f"Found {len(available)} available frames on S3")
    logger.info(
        "Found %d available frames for %s %s %s [%s → %s]",
        len(available), satellite, sector, band,
        start_time.isoformat(), end_time.isoformat(),
    )

    max_frames_limit = _read_max_frames_setting()
    fetch_result = fetch_frames(
        satellite=satellite, sector=sector, band=band,
        start_time=start_time, end_time=end_time,
        output_dir=output_dir,
        on_progress=_make_progress_callback(job_id, _log),
        max_frames=max_frames_limit,
    )

    results = fetch_result["frames"]
    if results:
        _create_fetch_records(job_id, sector, output_dir, results)

    status_msg, final_status = _build_status_message(
        satellite, sector, band, start_time, end_time,
        len(results), fetch_result["total_available"],
        fetch_result["capped"], fetch_result["failed_downloads"],
        max_frames_limit,
    )

    _log(status_msg, level="info" if final_status == "completed" else "warning")
    if not defer_final_update:
        error_value = status_msg if final_status == "completed_partial" else None
        _update_job_db(
            job_id, status=final_status, progress=100, output_path=output_dir,
            completed_at=utcnow(), status_message=status_msg,
            **({"error": error_value} if error_value else {}),
        )
        _publish_progress(job_id, 100, status_msg, final_status)


def _handle_fetch_failure(job_id: str, error: Exception, _log) -> None:
    """Handle a failed GOES fetch job."""
    logger.exception("GOES fetch job %s failed", job_id)
    _log(f"GOES fetch failed: {error}", "error")
    _update_job_db(
        job_id, status="failed", error=str(error),
        completed_at=utcnow(), status_message=f"Error: {error}",
    )
    _publish_progress(job_id, 0, f"Error: {error}", "failed")


@celery_app.task(bind=True, name="fetch_goes_data")
def fetch_goes_data(self, job_id: str, params: dict):
    """Download GOES frames for a time range and create Image records."""
    logger.info("Starting GOES fetch job %s", job_id)
    _update_job_db(
        job_id, status="processing", task_id=self.request.id,
        started_at=utcnow(), status_message="Fetching GOES data...",
    )
    _publish_progress(job_id, 0, "Fetching GOES data...", "processing")

    _log = _make_job_logger(job_id)
    _log(f"GOES fetch started — {params.get('satellite')} {params.get('sector')} {params.get('band')}")

    try:
        _execute_goes_fetch(job_id, params, _log)
    except Exception as e:
        _handle_fetch_failure(job_id, e, _log)
        raise


def _detect_gaps(
    satellite: str | None,
    band: str | None,
    sector: str | None,
    expected_interval: float,
) -> list[dict]:
    """Query GoesFrame timestamps and return a list of gap dicts."""
    from ..db.models import GoesFrame

    session = _get_sync_db()
    try:
        from sqlalchemy import select as sa_select

        query = sa_select(GoesFrame.capture_time).where(
            GoesFrame.capture_time.isnot(None)
        ).order_by(GoesFrame.capture_time.asc())
        if satellite:
            query = query.where(GoesFrame.satellite == satellite)
        if band:
            query = query.where(GoesFrame.band == band)
        if sector:
            query = query.where(GoesFrame.sector == sector)
        timestamps = [r[0] for r in session.execute(query).all()]
    finally:
        session.close()

    threshold = expected_interval * 1.5
    gaps: list[dict] = []
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
    return gaps


def _create_backfill_image_records(results: list[dict]) -> None:
    """Create Image and GoesFrame records for backfilled frames."""
    from ..db.models import GoesFrame, Image
    from ..services.thumbnail import generate_thumbnail, get_image_dimensions

    session = _get_sync_db()
    try:
        for frame in results:
            path = Path(frame["path"])
            file_size = path.stat().st_size if path.exists() else 0
            width, height = get_image_dimensions(str(path))
            thumb_path = generate_thumbnail(str(path), str(path.parent))

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

            goes_frame = GoesFrame(
                id=str(uuid.uuid4()),
                satellite=frame["satellite"],
                sector=frame.get("sector", ""),
                band=frame["band"],
                capture_time=frame["scan_time"],
                file_path=str(path),
                file_size=file_size,
                width=width,
                height=height,
                thumbnail_path=thumb_path,
            )
            session.add(goes_frame)
        session.commit()
    finally:
        session.close()


def _fill_single_gap(
    gap: dict,
    gap_index: int,
    satellite: str,
    sector: str,
    band: str,
    output_dir: str,
) -> int:
    """Fetch frames for a single gap. Returns number of frames fetched."""
    from ..services.goes_fetcher import fetch_frames

    start = datetime.fromisoformat(gap["start"])
    end = datetime.fromisoformat(gap["end"])
    fetch_result = fetch_frames(
        satellite=satellite, sector=sector, band=band,
        start_time=start, end_time=end, output_dir=output_dir,
    )
    results = fetch_result["frames"]
    if fetch_result["capped"] or fetch_result["failed_downloads"] > 0:
        logger.warning(
            "Backfill gap %d: %d fetched, %d available, capped=%s, failed=%d",
            gap_index + 1, len(results), fetch_result["total_available"],
            fetch_result["capped"], fetch_result["failed_downloads"],
        )
    _create_backfill_image_records(results)
    return len(results)


@celery_app.task(bind=True, name="backfill_gaps")
def backfill_gaps(self, job_id: str, params: dict):
    """Run gap detection then fetch missing frames."""
    logger.info("Starting backfill job %s", job_id)
    _update_job_db(
        job_id, status="processing", task_id=self.request.id,
        started_at=utcnow(), status_message="Detecting gaps...",
    )
    _publish_progress(job_id, 0, "Detecting gaps...", "processing")

    try:
        satellite = params.get("satellite") or "GOES-16"
        band = params.get("band") or "C02"
        sector = params.get("sector", "FullDisk")
        expected_interval = params.get("expected_interval", 10.0)

        gaps = _detect_gaps(satellite, band, sector, expected_interval)
        if not gaps:
            _update_job_db(
                job_id, status="completed", progress=100,
                completed_at=utcnow(), status_message="No gaps found",
            )
            _publish_progress(job_id, 100, "No gaps found", "completed")
            return

        _publish_progress(job_id, 10, f"Found {len(gaps)} gaps, fetching...", "processing")
        output_dir = str(Path(settings.output_dir) / f"backfill_{job_id}")
        total_fetched = 0

        for i, gap in enumerate(gaps):
            total_fetched += _fill_single_gap(gap, i, satellite, sector, band, output_dir)
            pct = 10 + int((i + 1) / len(gaps) * 90)
            _publish_progress(job_id, pct, f"Filled gap {i + 1}/{len(gaps)}")

        _update_job_db(
            job_id, status="completed", progress=100, output_path=output_dir,
            completed_at=utcnow(),
            status_message=f"Backfilled {total_fetched} frames across {len(gaps)} gaps",
        )
        _publish_progress(job_id, 100, f"Backfilled {total_fetched} frames", "completed")

    except Exception as e:
        logger.exception("Backfill job %s failed", job_id)
        _update_job_db(
            job_id, status="failed", error=str(e),
            completed_at=utcnow(), status_message=f"Error: {e}",
        )
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise


def _load_band_images(
    session,
    bands: list[str],
    satellite: str,
    sector: str,
    capture_time: datetime,
) -> list:
    """Load grayscale band images from the database, returning a list of arrays or None."""
    import numpy as np
    from PIL import Image as PILImage
    from sqlalchemy import func as sa_func
    from sqlalchemy import select as sa_select

    from ..db.models import GoesFrame

    band_images = []
    for band_name in bands[:3]:
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
        frame = session.execute(query).scalars().first()
        if frame and Path(frame.file_path).exists():
            img = PILImage.open(frame.file_path).convert("L")
            band_images.append(np.array(img, dtype=np.float32))
        else:
            band_images.append(None)
    return band_images


def _normalize_band(band_array, ref_shape):
    """Normalize a single band array to uint8, resizing if needed."""
    import numpy as np
    from PIL import Image as PILImage

    if band_array.shape != ref_shape:
        # Resize in float32 space to avoid double-quantization artifacts
        bmin, bmax = band_array.min(), band_array.max()
        if bmax > bmin:
            normalized = (band_array - bmin) / (bmax - bmin) * 255
        else:
            normalized = np.zeros_like(band_array)
        img_resized = PILImage.fromarray(normalized.astype(np.uint8)).resize(
            (ref_shape[1], ref_shape[0]), PILImage.BILINEAR
        )
        band_array = np.array(img_resized, dtype=np.float32)
    bmin, bmax = band_array.min(), band_array.max()
    if bmax > bmin:
        return ((band_array - bmin) / (bmax - bmin) * 255).astype(np.uint8)
    return np.zeros_like(band_array, dtype=np.uint8)


def _compose_rgb(band_images: list):
    """Stack band images into an RGB PIL image."""
    import numpy as np
    from PIL import Image as PILImage

    ref_shape = next(b.shape for b in band_images if b is not None)
    channels = []
    for b in band_images:
        if b is None:
            channels.append(np.zeros(ref_shape, dtype=np.uint8))
        else:
            channels.append(_normalize_band(b, ref_shape))
    rgb = np.stack(channels, axis=-1)
    return PILImage.fromarray(rgb, "RGB")


def _mark_composite_failed(composite_id: str, error: str) -> None:
    """Mark a Composite record as failed in the database."""
    from ..db.models import Composite

    session = _get_sync_db()
    try:
        comp = session.query(Composite).filter(Composite.id == composite_id).first()
        if comp:
            comp.status = "failed"
            comp.error = error
        session.commit()
    finally:
        session.close()


@celery_app.task(bind=True, name="generate_composite")
def generate_composite(self, composite_id: str, job_id: str, params: dict):
    """Generate a band composite image from multiple GOES bands."""
    from ..db.models import Composite

    logger.info("Starting composite generation %s", composite_id)
    _update_job_db(
        job_id,
        status="processing",
        task_id=self.request.id,
        started_at=utcnow(),
        status_message="Generating composite...",
    )
    _publish_progress(job_id, 0, "Generating composite...", "processing")

    try:
        capture_time = datetime.fromisoformat(params["capture_time"])
        session = _get_sync_db()
        try:
            band_images = _load_band_images(
                session, params["bands"], params["satellite"], params["sector"], capture_time,
            )
            if not any(b is not None for b in band_images):
                raise ValueError("No band images found for composite")

            composite_img = _compose_rgb(band_images)

            output_dir = Path(settings.output_dir) / "composites"
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / f"{composite_id}.png"
            composite_img.save(str(output_path), "PNG")

            comp = session.query(Composite).filter(Composite.id == composite_id).first()
            if comp:
                comp.file_path = str(output_path)
                comp.file_size = output_path.stat().st_size
                comp.status = "completed"
            session.commit()
        finally:
            session.close()

        _update_job_db(
            job_id, status="completed", progress=100,
            completed_at=utcnow(), status_message="Composite generated",
        )
        _publish_progress(job_id, 100, "Composite generated", "completed")

    except Exception as e:
        logger.exception("Composite generation %s failed", composite_id)
        _mark_composite_failed(composite_id, str(e))
        _update_job_db(job_id, status="failed", error=str(e), completed_at=utcnow())
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise


@celery_app.task(bind=True, name="fetch_composite_data")
def fetch_composite_data(self, job_id: str, params: dict):
    """Fetch multiple bands sequentially, then auto-queue composite generation."""
    _log = _make_job_logger(job_id)
    _log(f"Starting composite fetch: {params.get('recipe')}")

    _update_job_db(job_id, status="processing", started_at=utcnow())
    _publish_progress(job_id, 0, "Starting composite fetch", "processing")

    try:
        satellite = params["satellite"]
        sector = params["sector"]
        bands = params["bands"]
        recipe = params["recipe"]
        start_time_str = params["start_time"]
        end_time_str = params["end_time"]

        total_bands = len(bands)

        for i, band in enumerate(bands):
            band_progress = int(((i + 1) / total_bands) * 80)
            _publish_progress(job_id, band_progress, f"Fetching band {band} ({i + 1}/{total_bands})", "processing")
            _update_job_db(job_id, progress=band_progress, status_message=f"Fetching band {band}")

            band_params = {
                "satellite": satellite,
                "sector": sector,
                "band": band,
                "start_time": start_time_str,
                "end_time": end_time_str,
            }
            _execute_goes_fetch(job_id, band_params, _log, defer_final_update=True)

        _publish_progress(job_id, 90, "All bands fetched, queuing composites", "processing")
        _update_job_db(job_id, progress=90, status_message="Queuing composite generation")

        # Auto-queue composite for fetched captures — query DB instead of re-listing S3
        from ..db.models import Composite, GoesFrame
        from ..db.models import Job as JobModel
        from ..routers.goes import COMPOSITE_RECIPES

        session = _get_sync_db()
        try:
            from sqlalchemy import select as sa_select

            frames = session.execute(
                sa_select(GoesFrame.capture_time)
                .where(
                    GoesFrame.satellite == satellite,
                    GoesFrame.sector == sector,
                    GoesFrame.band == bands[0],
                    GoesFrame.source_job_id == job_id,
                )
                .order_by(GoesFrame.capture_time.asc())
                .limit(50)
            ).all()
        finally:
            session.close()

        if frames:
            composite_tasks = []
            session = _get_sync_db()
            try:
                for (scan_t,) in frames:
                    capture_time = scan_t.isoformat() if isinstance(scan_t, datetime) else scan_t
                    composite_id = str(uuid.uuid4())
                    comp_job_id = str(uuid.uuid4())

                    comp_job = JobModel(id=comp_job_id, status="pending", job_type="composite")
                    session.add(comp_job)
                    comp = Composite(
                        id=composite_id,
                        name=COMPOSITE_RECIPES.get(recipe, {}).get("name", recipe),
                        recipe=recipe,
                        satellite=satellite,
                        sector=sector,
                        capture_time=scan_t if isinstance(scan_t, datetime) else datetime.fromisoformat(capture_time),
                        status="pending",
                        job_id=comp_job_id,
                    )
                    session.add(comp)
                    composite_tasks.append((composite_id, comp_job_id, capture_time))
                session.commit()
            finally:
                session.close()

            for composite_id, comp_job_id, capture_time in composite_tasks:
                generate_composite.delay(composite_id, comp_job_id, {
                    "recipe": recipe,
                    "satellite": satellite,
                    "sector": sector,
                    "capture_time": capture_time,
                    "bands": bands,
                })

        _update_job_db(
            job_id, status="completed", progress=100,
            completed_at=utcnow(), status_message="Composite fetch completed",
        )
        _publish_progress(job_id, 100, "Composite fetch completed", "completed")

    except Exception as e:
        logger.exception("Composite fetch %s failed", job_id)
        _update_job_db(job_id, status="failed", error=str(e), completed_at=utcnow())
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise
