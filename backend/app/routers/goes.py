"""GOES satellite data endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Body, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db.models import Composite, GoesFrame, Job
from ..errors import APIError, validate_uuid
from ..models.goes import (
    CompositeCreateRequest,
    CompositeResponse,
    GoesBackfillRequest,
    GoesFetchRequest,
    GoesFetchResponse,
    GoesProductsResponse,
)
from ..models.pagination import PaginatedResponse
from ..rate_limit import limiter
from ..services.cache import get_cached, invalidate, make_cache_key
from ..services.gap_detector import get_coverage_stats
from ..services.goes_fetcher import SATELLITE_AVAILABILITY, SATELLITE_BUCKETS, SECTOR_PRODUCTS, VALID_BANDS

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
    cache_key = make_cache_key("products")

    import asyncio

    products = {
        "satellites": list(SATELLITE_BUCKETS.keys()),
        "satellite_availability": dict(SATELLITE_AVAILABILITY),
        "sectors": [
            {"id": k, "name": k, "product": v}
            for k, v in SECTOR_PRODUCTS.items()
        ],
        "bands": [
            {"id": band, "description": BAND_DESCRIPTIONS.get(band, band)}
            for band in VALID_BANDS
        ],
        "default_satellite": "GOES-19",
    }

    async def _fetch():
        await asyncio.sleep(0)
        return products

    return await get_cached(cache_key, ttl=300, fetch_fn=_fetch)


@router.post("/fetch", response_model=GoesFetchResponse)
@limiter.limit("5/minute")
async def fetch_goes(
    request: Request,
    payload: GoesFetchRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Kick off a GOES data fetch job."""
    # Validate time range against satellite availability
    avail = SATELLITE_AVAILABILITY.get(payload.satellite)
    if avail:
        avail_from = datetime.fromisoformat(avail["available_from"])
        avail_to = datetime.fromisoformat(avail["available_to"]) if avail["available_to"] else None
        if avail_to and payload.start_time.replace(tzinfo=None) > avail_to:
            suggestion = "GOES-19" if payload.satellite == "GOES-16" else "GOES-18"
            raise APIError(
                422,
                "out_of_range",
                f"{payload.satellite} data is only available from "
                f"{avail['available_from'][:7]} through "
                f"{avail['available_to'][:7]}. "
                f"Use {suggestion} for current data.",
            )
        if payload.end_time.replace(tzinfo=None) < avail_from:
            raise APIError(
                422,
                "out_of_range",
                f"{payload.satellite} data is only available from "
                f"{avail['available_from'][:7]}. "
                f"Your requested time range is before data availability.",
            )

    job_id = str(uuid.uuid4())
    hours_diff = max(1, round((payload.end_time - payload.start_time).total_seconds() / 3600))
    time_label = f"{hours_diff}hr" if hours_diff < 24 else f"{hours_diff // 24}d"
    job_name = f"{payload.satellite} {payload.sector} {payload.band} ({time_label})"
    job = Job(
        id=job_id,
        name=job_name,
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
    result = fetch_goes_data.delay(job_id, job.params)
    job.task_id = str(result.id)
    await db.commit()

    await invalidate("cache:dashboard-stats*")

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


@router.get("/frame-count")
@limiter.limit("30/minute")
async def estimate_frame_count(
    request: Request,
    satellite: str = Query(...),
    sector: str = Query(...),
    band: str = Query(...),
    start_time: datetime = Query(...),
    end_time: datetime = Query(...),
):
    """Estimate frame count for a time range without downloading."""
    import asyncio

    from ..services.goes_fetcher import list_available, validate_params

    validate_params(satellite, sector, band)
    if start_time >= end_time:
        raise APIError(400, "invalid_range", "start_time must be before end_time")

    loop = asyncio.get_event_loop()
    available = await loop.run_in_executor(
        None, lambda: list_available(satellite, sector, band, start_time, end_time)
    )
    return {"count": len(available)}


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


@router.get("/latest")
async def get_latest_frame(
    satellite: str = Query("GOES-16"),
    sector: str = Query("CONUS"),
    band: str = Query("C02"),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent GoesFrame for the given satellite/sector/band."""
    result = await db.execute(
        select(GoesFrame)
        .where(
            GoesFrame.satellite == satellite,
            GoesFrame.sector == sector,
            GoesFrame.band == band,
        )
        .order_by(GoesFrame.capture_time.desc())
        .limit(1)
    )
    frame = result.scalars().first()
    if not frame:
        raise APIError(404, "not_found", "No frames found for the given parameters")
    return {
        "id": frame.id,
        "satellite": frame.satellite,
        "sector": frame.sector,
        "band": frame.band,
        "capture_time": frame.capture_time.isoformat() if frame.capture_time else None,
        "file_path": frame.file_path,
        "file_size": frame.file_size,
        "width": frame.width,
        "height": frame.height,
        "thumbnail_path": frame.thumbnail_path,
    }


# ── Composites ────────────────────────────────────────────────────

COMPOSITE_RECIPES = {
    "true_color": {"name": "True Color", "bands": ["C02", "C03", "C01"]},
    "natural_color": {"name": "Natural Color", "bands": ["C07", "C06", "C02"]},
    "fire_detection": {"name": "Fire Detection", "bands": ["C07", "C06", "C02"]},
    "dust_ash": {"name": "Dust/Ash", "bands": ["C15", "C14", "C13", "C11"]},
    "day_cloud_phase": {"name": "Day Cloud Phase", "bands": ["C13", "C02", "C05"]},
    "airmass": {"name": "Airmass", "bands": ["C08", "C10", "C12", "C13"]},
}


@router.get("/composite-recipes")
def list_composite_recipes():
    """List available composite recipes."""
    return [
        {"id": k, "name": v["name"], "bands": v["bands"]}
        for k, v in COMPOSITE_RECIPES.items()
    ]


@router.post("/composites")
async def create_composite(
    request: Request,
    payload: CompositeCreateRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Create a band composite image via Celery task."""
    recipe = payload.recipe
    if recipe not in COMPOSITE_RECIPES:
        raise APIError(400, "bad_request", f"Unknown recipe: {recipe}")

    satellite = payload.satellite
    sector = payload.sector
    capture_time = payload.capture_time

    composite_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    job = Job(id=job_id, status="pending", job_type="composite")
    db.add(job)

    composite = Composite(
        id=composite_id,
        name=COMPOSITE_RECIPES[recipe]["name"],
        recipe=recipe,
        satellite=satellite,
        sector=sector,
        capture_time=datetime.fromisoformat(capture_time),
        status="pending",
        job_id=job_id,
    )
    db.add(composite)
    await db.commit()

    from ..tasks.goes_tasks import generate_composite

    generate_composite.delay(composite_id, job_id, {
        "recipe": recipe,
        "satellite": satellite,
        "sector": sector,
        "capture_time": capture_time,
        "bands": COMPOSITE_RECIPES[recipe]["bands"],
    })

    return {
        "id": composite_id,
        "job_id": job_id,
        "status": "pending",
        "message": f"Generating {COMPOSITE_RECIPES[recipe]['name']} composite",
    }


@router.get("/composites", response_model=PaginatedResponse[CompositeResponse])
async def list_composites(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """List generated composites."""
    total = (await db.execute(select(func.count(Composite.id)))).scalar() or 0
    result = await db.execute(
        select(Composite)
        .order_by(Composite.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    composites = result.scalars().all()
    items = [
        CompositeResponse(
            id=c.id,
            name=c.name,
            recipe=c.recipe,
            satellite=c.satellite,
            sector=c.sector,
            capture_time=c.capture_time.isoformat() if c.capture_time else None,
            file_path=c.file_path,
            file_size=c.file_size,
            status=c.status,
            error=c.error,
            created_at=c.created_at.isoformat() if c.created_at else None,
        )
        for c in composites
    ]
    return PaginatedResponse(items=items, total=total, page=page, limit=limit)


@router.get("/composites/{composite_id}")
async def get_composite(composite_id: str, db: AsyncSession = Depends(get_db)):
    """Get composite detail."""
    validate_uuid(composite_id, "composite_id")
    result = await db.execute(select(Composite).where(Composite.id == composite_id))
    c = result.scalars().first()
    if not c:
        raise APIError(404, "not_found", "Composite not found")
    return {
        "id": c.id,
        "name": c.name,
        "recipe": c.recipe,
        "satellite": c.satellite,
        "sector": c.sector,
        "capture_time": c.capture_time.isoformat() if c.capture_time else None,
        "file_path": c.file_path,
        "file_size": c.file_size,
        "status": c.status,
        "error": c.error,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
