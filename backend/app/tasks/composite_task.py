"""Celery tasks for GOES composite generation and multi-band fetching."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from pathlib import Path

from botocore.exceptions import ClientError

from ..celery_app import celery_app
from ..config import settings
from ..utils import utcnow
from .fetch_task import _execute_goes_fetch, _make_job_logger
from .helpers import _get_sync_db, _publish_progress, _update_job_db

logger = logging.getLogger(__name__)


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
                sa_func.abs(sa_func.extract("epoch", GoesFrame.capture_time) - sa_func.extract("epoch", capture_time))
            )
            .limit(1)
        )
        frame = session.execute(query).scalars().first()
        if frame and Path(frame.file_path).exists():
            with PILImage.open(frame.file_path) as img:
                band_images.append(np.array(img.convert("L"), dtype=np.float32))
        else:
            band_images.append(None)
    return band_images


def _normalize_band(band_array, ref_shape):
    """Normalize a single band array to uint8, resizing if needed."""
    import numpy as np
    from PIL import Image as PILImage

    if band_array.shape != ref_shape:
        bmin, bmax = band_array.min(), band_array.max()
        normalized = (band_array - bmin) / (bmax - bmin) * 255 if bmax > bmin else np.zeros_like(band_array)
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


@celery_app.task(
    bind=True,
    name="generate_composite",
    autoretry_for=(ConnectionError, TimeoutError, ClientError),
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
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
                session,
                params["bands"],
                params["satellite"],
                params["sector"],
                capture_time,
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
            job_id,
            status="completed",
            progress=100,
            completed_at=utcnow(),
            status_message="Composite generated",
        )
        _publish_progress(job_id, 100, "Composite generated", "completed")

    except Exception as e:  # Task boundary: log + update status, re-raise for retry
        logger.exception("Composite generation %s failed", composite_id)
        _mark_composite_failed(composite_id, str(e))
        _update_job_db(job_id, status="failed", error=str(e), completed_at=utcnow())
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise


@celery_app.task(
    bind=True,
    name="fetch_composite_data",
    autoretry_for=(ConnectionError, TimeoutError, ClientError),
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
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

        from ..db.models import Composite, GoesFrame
        from ..db.models import Job as JobModel
        from ..routers._goes_shared import COMPOSITE_RECIPES

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
                generate_composite.delay(
                    composite_id,
                    comp_job_id,
                    {
                        "recipe": recipe,
                        "satellite": satellite,
                        "sector": sector,
                        "capture_time": capture_time,
                        "bands": bands,
                    },
                )

        _update_job_db(
            job_id,
            status="completed",
            progress=100,
            completed_at=utcnow(),
            status_message="Composite fetch completed",
        )
        _publish_progress(job_id, 100, "Composite fetch completed", "completed")

    except Exception as e:  # Task boundary: log + update status, re-raise for retry
        logger.exception("Composite fetch %s failed", job_id)
        _update_job_db(job_id, status="failed", error=str(e), completed_at=utcnow())
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise
