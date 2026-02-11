"""GOES satellite data endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Body, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db.models import Job
from ..errors import APIError
from ..models.goes import (
    GoesBackfillRequest,
    GoesFetchRequest,
    GoesFetchResponse,
    GoesProductsResponse,
)
from ..rate_limit import limiter
from ..services.gap_detector import get_coverage_stats
from ..services.goes_fetcher import SATELLITE_BUCKETS, SECTOR_PRODUCTS, VALID_BANDS

router = APIRouter(prefix="/api/goes", tags=["goes"])

BAND_DESCRIPTIONS = {
    "C01": "Blue (0.47µm)", "C02": "Red (0.64µm)", "C03": "Veggie (0.86µm)",
    "C04": "Cirrus (1.37µm)", "C05": "Snow/Ice (1.61µm)", "C06": "Cloud Particle (2.24µm)",
    "C07": "Shortwave IR (3.9µm)", "C08": "Upper-level WV (6.2µm)",
    "C09": "Mid-level WV (6.9µm)", "C10": "Lower-level WV (7.3µm)",
    "C11": "Cloud-top Phase (8.4µm)", "C12": "Ozone (9.6µm)",
    "C13": "Clean IR (10.3µm)", "C14": "IR (11.2µm)",
    "C15": "Dirty IR (12.3µm)", "C16": "CO2 (13.3µm)",
}


@router.get("/products", response_model=GoesProductsResponse)
async def list_products():
    """List available GOES satellites, sectors, and bands."""
    return GoesProductsResponse(
        satellites=list(SATELLITE_BUCKETS.keys()),
        sectors=[
            {"id": k, "name": k, "product": v}
            for k, v in SECTOR_PRODUCTS.items()
        ],
        bands=[
            {"id": band, "description": BAND_DESCRIPTIONS.get(band, band)}
            for band in VALID_BANDS
        ],
    )


@router.post("/fetch", response_model=GoesFetchResponse)
@limiter.limit("5/minute")
async def fetch_goes(
    request: Request,
    payload: GoesFetchRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Kick off a GOES data fetch job."""
    job_id = str(uuid.uuid4())
    job = Job(
        id=job_id,
        status="pending",
        job_type="goes_fetch",
        params={
            "satellite": payload.satellite,
            "sector": payload.sector,
            "band": payload.band,
            "start_time": payload.start_time.isoformat(),
            "end_time": payload.end_time.isoformat(),
        },
    )
    db.add(job)
    await db.commit()

    from ..tasks.goes_tasks import fetch_goes_data
    fetch_goes_data.delay(job_id, job.params)

    return GoesFetchResponse(
        job_id=job_id,
        status="pending",
        message="GOES fetch job created",
    )


@router.get("/gaps")
@limiter.limit("10/minute")
async def detect_gaps(
    request: Request,
    satellite: str | None = Query(None),
    band: str | None = Query(None),
    expected_interval: float = Query(10.0, ge=0.5, le=60.0),
    db: AsyncSession = Depends(get_db),
):
    """Run gap detection and return coverage stats."""
    stats = await get_coverage_stats(
        db,
        satellite=satellite,
        band=band,
        expected_interval=expected_interval,
    )
    return stats


@router.post("/backfill", response_model=GoesFetchResponse)
@limiter.limit("2/minute")
async def backfill_gaps(
    request: Request,
    payload: GoesBackfillRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Fill detected gaps (one-shot, not automatic)."""
    job_id = str(uuid.uuid4())
    job = Job(
        id=job_id,
        status="pending",
        job_type="goes_backfill",
        params={
            "satellite": payload.satellite,
            "band": payload.band,
            "sector": payload.sector,
            "expected_interval": payload.expected_interval,
        },
    )
    db.add(job)
    await db.commit()

    from ..tasks.goes_tasks import backfill_gaps as backfill_task
    backfill_task.delay(job_id, job.params)

    return GoesFetchResponse(
        job_id=job_id,
        status="pending",
        message="Backfill job created",
    )


@router.get("/preview")
@limiter.limit("10/minute")
async def preview_frame(
    request: Request,
    satellite: str = Query(...),
    sector: str = Query(...),
    band: str = Query(...),
    time: datetime = Query(...),
):
    """Fetch a single frame preview."""
    from ..services.goes_fetcher import fetch_single_preview

    png_bytes = fetch_single_preview(satellite, sector, band, time)
    if not png_bytes:
        raise APIError(404, "not_found", "No frame found near the requested time")

    return Response(content=png_bytes, media_type="image/png")
