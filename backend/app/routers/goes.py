"""GOES satellite data endpoints."""

import asyncio
import atexit
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

from fastapi import APIRouter, Body, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import DEFAULT_SATELLITE
from ..db.database import get_db
from ..db.models import Composite, GoesFrame, Job
from ..errors import APIError, validate_uuid
from ..models.goes import (
    CompositeCreateRequest,
    CompositeResponse,
    FetchCompositeRequest,
    GoesBackfillRequest,
    GoesFetchRequest,
    GoesFetchResponse,
)
from ..models.pagination import PaginatedResponse
from ..rate_limit import limiter
from ..services.cache import get_cached, invalidate, make_cache_key
from ..services.gap_detector import get_coverage_stats
from ..services.goes_fetcher import (
    SATELLITE_AVAILABILITY,
    SATELLITE_BUCKETS,
    SECTOR_INTERVALS,
    SECTOR_PRODUCTS,
    VALID_BANDS,
)

router = APIRouter(prefix="/api/goes", tags=["goes"])

# Bug #18: Dedicated thread pool for S3 operations
_s3_executor = ThreadPoolExecutor(max_workers=4)
atexit.register(_s3_executor.shutdown, wait=False)

BAND_DESCRIPTIONS = {
    "C01": "Blue (0.47µm)", "C02": "Red (0.64µm)", "C03": "Veggie (0.86µm)",
    "C04": "Cirrus (1.37µm)", "C05": "Snow/Ice (1.61µm)", "C06": "Cloud Particle (2.24µm)",
    "C07": "Shortwave IR (3.9µm)", "C08": "Upper-level WV (6.2µm)",
    "C09": "Mid-level WV (6.9µm)", "C10": "Lower-level WV (7.3µm)",
    "C11": "Cloud-top Phase (8.4µm)", "C12": "Ozone (9.6µm)",
    "C13": "Clean IR (10.3µm)", "C14": "IR (11.2µm)",
    "C15": "Dirty IR (12.3µm)", "C16": "CO2 (13.3µm)",
    "GEOCOLOR": "GeoColor (True Color Day, IR Night)",
}

# Enhanced band metadata
BAND_METADATA = {
    "C01": {"wavelength_um": 0.47, "common_name": "Blue", "category": "visible", "use_case": "Daytime aerosol & smoke detection"},
    "C02": {"wavelength_um": 0.64, "common_name": "Red", "category": "visible", "use_case": "Primary visible — clouds & surface features"},
    "C03": {"wavelength_um": 0.86, "common_name": "Veggie", "category": "near_ir", "use_case": "Vegetation health, burn scars"},
    "C04": {"wavelength_um": 1.37, "common_name": "Cirrus", "category": "near_ir", "use_case": "Cirrus cloud detection"},
    "C05": {"wavelength_um": 1.61, "common_name": "Snow/Ice", "category": "near_ir", "use_case": "Snow/ice discrimination, cloud phase"},
    "C06": {"wavelength_um": 2.24, "common_name": "Cloud Particle", "category": "near_ir", "use_case": "Cloud particle size, snow detection"},
    "C07": {"wavelength_um": 3.9, "common_name": "Shortwave IR", "category": "infrared", "use_case": "Fire/hotspot detection, nighttime fog"},
    "C08": {"wavelength_um": 6.2, "common_name": "Upper Tropo WV", "category": "infrared", "use_case": "Upper-level water vapor, jet streams"},
    "C09": {"wavelength_um": 6.9, "common_name": "Mid Tropo WV", "category": "infrared", "use_case": "Mid-level water vapor tracking"},
    "C10": {"wavelength_um": 7.3, "common_name": "Lower Tropo WV", "category": "infrared", "use_case": "Lower-level water vapor, SO₂ detection"},
    "C11": {"wavelength_um": 8.4, "common_name": "Cloud-Top Phase", "category": "infrared", "use_case": "Cloud-top phase, dust detection"},
    "C12": {"wavelength_um": 9.6, "common_name": "Ozone", "category": "infrared", "use_case": "Total column ozone, turbulence"},
    "C13": {"wavelength_um": 10.3, "common_name": "Clean IR", "category": "infrared", "use_case": "Clean IR window — clouds & SST"},
    "C14": {"wavelength_um": 11.2, "common_name": "IR Longwave", "category": "infrared", "use_case": "Cloud-top temperature, general IR"},
    "C15": {"wavelength_um": 12.3, "common_name": "Dirty IR", "category": "infrared", "use_case": "Dirty IR window — volcanic ash"},
    "C16": {"wavelength_um": 13.3, "common_name": "CO₂ Longwave", "category": "infrared", "use_case": "Cloud-top height estimation"},
    "GEOCOLOR": {"wavelength_um": None, "common_name": "GeoColor", "category": "composite", "use_case": "True color daytime, multispectral IR nighttime"},
}

SECTOR_DISPLAY_NAMES = {
    "FullDisk": "Full Disk",
    "CONUS": "CONUS",
    "Mesoscale1": "Mesoscale 1",
    "Mesoscale2": "Mesoscale 2",
}

SECTOR_FILE_SIZES_KB = {
    "FullDisk": 12000,
    "CONUS": 4000,
    "Mesoscale1": 500,
    "Mesoscale2": 500,
}


@router.get("/products")
async def list_products():
    """List available GOES satellites, sectors, and bands with enhanced metadata."""
    cache_key = make_cache_key("products")

    products = {
        "satellites": list(SATELLITE_BUCKETS),
        "satellite_availability": dict(SATELLITE_AVAILABILITY),
        "sectors": [
            {
                "id": k,
                "name": SECTOR_DISPLAY_NAMES.get(k, k),
                "product": v,
                "cadence_minutes": SECTOR_INTERVALS.get(k, 10),
                "typical_file_size_kb": SECTOR_FILE_SIZES_KB.get(k, 4000),
            }
            for k, v in SECTOR_PRODUCTS.items()
        ],
        "bands": [
            {"id": "GEOCOLOR", "description": BAND_DESCRIPTIONS["GEOCOLOR"], **BAND_METADATA["GEOCOLOR"]},
        ] + [
            {
                "id": band,
                "description": BAND_DESCRIPTIONS.get(band, band),
                **(BAND_METADATA.get(band, {})),
            }
            for band in VALID_BANDS
        ],
        "default_satellite": DEFAULT_SATELLITE,
    }

    def _fetch():
        return products

    return await get_cached(cache_key, ttl=300, fetch_fn=_fetch)


# ── Catalog endpoints ─────────────────────────────────────────────

@router.get("/catalog")
@limiter.limit("20/minute")
async def catalog(
    request: Request,
    satellite: str = Query(DEFAULT_SATELLITE),
    sector: str = Query("CONUS"),
    band: str = Query("C02"),
    date: str | None = Query(None, description="Date in YYYY-MM-DD format, defaults to today"),
):
    """Query NOAA S3 for available GOES captures."""
    from ..services.catalog import catalog_list

    dt = None
    if date:
        try:
            dt = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=UTC)
        except ValueError:
            raise APIError(400, "invalid_date", "Date must be in YYYY-MM-DD format")

    effective_date = date or datetime.now(UTC).strftime("%Y-%m-%d")
    cache_key = make_cache_key(f"catalog:{satellite}:{sector}:{band}:{effective_date}")

    async def _fetch():
        loop = asyncio.get_event_loop()
        items = await loop.run_in_executor(_s3_executor, lambda: catalog_list(satellite, sector, band, dt))
        return {"items": items, "total": len(items)}

    return await get_cached(cache_key, ttl=300, fetch_fn=_fetch)


@router.get("/catalog/latest")
@limiter.limit("30/minute")
async def catalog_latest(
    request: Request,
    satellite: str = Query(DEFAULT_SATELLITE),
    sector: str = Query("CONUS"),
    band: str = Query("C02"),
):
    """Return the most recent available frame on S3 (checks last 2 hours)."""
    from ..services.catalog import catalog_latest as _catalog_latest

    cache_key = make_cache_key(f"catalog-latest:{satellite}:{sector}:{band}")

    async def _fetch():
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_s3_executor, lambda: _catalog_latest(satellite, sector, band))

    result = await get_cached(cache_key, ttl=60, fetch_fn=_fetch)
    if not result:
        raise APIError(404, "not_found", "No recent frames found")
    return result


@router.get("/catalog/available")
@limiter.limit("10/minute")
async def catalog_available(
    request: Request,
    satellite: str = Query(DEFAULT_SATELLITE),
):
    """Check which sectors have recent data (last 2 hours) on S3."""
    from ..services.catalog import catalog_available as _catalog_available

    cache_key = make_cache_key(f"catalog-available:{satellite}")

    async def _fetch():
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_s3_executor, lambda: _catalog_available(satellite))

    return await get_cached(cache_key, ttl=120, fetch_fn=_fetch)


@router.get("/preview/band-samples")
@limiter.limit("10/minute")
async def band_sample_thumbnails(
    request: Request,
    satellite: str = Query(DEFAULT_SATELLITE),
    sector: str = Query("CONUS"),
    db: AsyncSession = Depends(get_db),
):
    """Return thumbnail URLs for the latest frame of each band."""

    cache_key = make_cache_key(f"band-samples:{satellite}:{sector}")

    async def _fetch():
        results = {}
        for band_id in VALID_BANDS:
            result = await db.execute(
                select(GoesFrame.id, GoesFrame.thumbnail_path)
                .where(
                    GoesFrame.satellite == satellite,
                    GoesFrame.sector == sector,
                    GoesFrame.band == band_id,
                )
                .order_by(GoesFrame.capture_time.desc())
                .limit(1)
            )
            row = result.first()
            if row and row.thumbnail_path:
                results[band_id] = f"/api/goes/frames/{row.id}/thumbnail"
            else:
                results[band_id] = None
        return {
            "satellite": satellite,
            "sector": sector,
            "thumbnails": results,
        }

    return await get_cached(cache_key, ttl=300, fetch_fn=_fetch)


# ── Fetch composite endpoint ──────────────────────────────────────

@router.post("/fetch-composite", response_model=GoesFetchResponse)
@limiter.limit("3/minute")
async def fetch_composite(
    request: Request,
    payload: FetchCompositeRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Fetch multiple bands and auto-composite. Max 50 frames per request."""
    recipe_bands = {
        "true_color": ["C01", "C02", "C03"],
        "natural_color": ["C02", "C06", "C07"],
    }
    bands = recipe_bands.get(payload.recipe)
    if not bands:
        raise APIError(400, "bad_request", f"Unknown recipe: {payload.recipe}. Valid: {list(recipe_bands)}")

    # Validate time range against satellite availability
    avail = SATELLITE_AVAILABILITY.get(payload.satellite)
    if avail:
        avail_from = datetime.fromisoformat(avail["available_from"])
        avail_to = datetime.fromisoformat(avail["available_to"]) if avail["available_to"] else None
        if avail_to and payload.start_time.replace(tzinfo=None) > avail_to:
            suggestion = "GOES-19" if payload.satellite == "GOES-16" else "GOES-18"
            raise APIError(
                422, "out_of_range",
                f"{payload.satellite} data is only available through {avail['available_to'][:7]}. "
                f"Use {suggestion} for current data.",
            )
        if payload.end_time.replace(tzinfo=None) < avail_from:
            raise APIError(
                422, "out_of_range",
                f"{payload.satellite} data is only available from {avail['available_from'][:7]}.",
            )

    # Estimate frame count
    interval = SECTOR_INTERVALS.get(payload.sector, 10)
    duration_min = (payload.end_time - payload.start_time).total_seconds() / 60
    estimated_frames = int(duration_min / interval) * len(bands)
    if estimated_frames > 50 * len(bands):
        raise APIError(
            422, "too_many_frames",
            f"Estimated {estimated_frames} frames exceeds limit of {50 * len(bands)}. "
            "Reduce time range.",
        )

    job_id = str(uuid.uuid4())
    hours_diff = max(1, round((payload.end_time - payload.start_time).total_seconds() / 3600))
    time_label = f"{hours_diff}hr" if hours_diff < 24 else f"{hours_diff // 24}d"
    job_name = f"{payload.satellite} {payload.sector} {payload.recipe} ({time_label})"
    job = Job(
        id=job_id,
        name=job_name,
        status="pending",
        job_type="goes_fetch_composite",
        params={
            "satellite": payload.satellite,
            "sector": payload.sector,
            "recipe": payload.recipe,
            "bands": bands,
            "start_time": payload.start_time.isoformat(),
            "end_time": payload.end_time.isoformat(),
        },
    )
    db.add(job)
    await db.commit()

    from ..tasks.goes_tasks import fetch_composite_data
    result = fetch_composite_data.delay(job_id, job.params)
    job.task_id = str(result.id)
    await db.commit()

    await invalidate("cache:dashboard-stats*")

    return GoesFetchResponse(
        job_id=job_id,
        status="pending",
        message=f"Composite fetch job created ({payload.recipe}, {len(bands)} bands)",
    )


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
    sector: str | None = Query(None),
    expected_interval: float = Query(10.0, ge=0.5, le=60.0),
    db: AsyncSession = Depends(get_db),
):
    """Run gap detection and return coverage stats."""
    stats = await get_coverage_stats(
        db,
        satellite=satellite,
        band=band,
        sector=sector,
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
        name=f"{payload.satellite} {payload.sector} {payload.band} Backfill",
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
        _s3_executor, lambda: list_available(satellite, sector, band, start_time, end_time)
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


@router.get("/band-availability")
@limiter.limit("30/minute")
async def band_availability(
    request: Request,
    satellite: str = Query(DEFAULT_SATELLITE),
    sector: str = Query("CONUS"),
    db: AsyncSession = Depends(get_db),
):
    """Return frame count per band for the given satellite/sector."""
    from sqlalchemy import func

    result = await db.execute(
        select(GoesFrame.band, func.count())
        .where(GoesFrame.satellite == satellite, GoesFrame.sector == sector)
        .group_by(GoesFrame.band)
    )
    counts = {row[0]: row[1] for row in result.all()}
    return {"counts": counts}


@router.get("/latest")
async def get_latest_frame(
    satellite: str = Query(DEFAULT_SATELLITE),
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
        "file_size": frame.file_size,
        "width": frame.width,
        "height": frame.height,
        "image_url": f"/api/goes/frames/{frame.id}/image",
        "thumbnail_url": f"/api/goes/frames/{frame.id}/thumbnail",
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

    job = Job(id=job_id, name=f"{satellite} {sector} {recipe} Composite", status="pending", job_type="composite")
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
            file_path=None,
            file_size=c.file_size,
            status=c.status,
            error=c.error,
            created_at=c.created_at.isoformat() if c.created_at else None,
            image_url=f"/api/goes/composites/{c.id}/image" if c.file_path else None,
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
        "file_size": c.file_size,
        "status": c.status,
        "error": c.error,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "image_url": f"/api/goes/composites/{c.id}/image" if c.file_path else None,
    }


# Bug #11: Dedicated composite image endpoint
@router.get("/composites/{composite_id}/image")
async def get_composite_image(composite_id: str, db: AsyncSession = Depends(get_db)):
    """Serve the composite image file."""
    validate_uuid(composite_id, "composite_id")
    result = await db.execute(select(Composite).where(Composite.id == composite_id))
    c = result.scalars().first()
    if not c:
        raise APIError(404, "not_found", "Composite not found")
    if not c.file_path:
        raise APIError(404, "not_found", "Composite image not yet generated")

    from pathlib import Path

    file_path = Path(c.file_path)
    if not file_path.exists():
        raise APIError(404, "not_found", "Composite image file not found on disk")

    import mimetypes

    from starlette.responses import FileResponse

    media_type = mimetypes.guess_type(str(file_path))[0] or "image/png"

    return FileResponse(
        str(file_path),
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
