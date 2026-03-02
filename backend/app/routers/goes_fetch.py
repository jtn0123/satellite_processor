"""GOES data fetch and download endpoints."""

import asyncio
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Body, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db.models import Job
from ..errors import APIError
from ..models.goes import (
    FetchCompositeRequest,
    GoesBackfillRequest,
    GoesFetchRequest,
    GoesFetchResponse,
)
from ..rate_limit import limiter
from ..services.cache import invalidate
from ..services.gap_detector import get_coverage_stats
from ..services.goes_fetcher import SATELLITE_AVAILABILITY, SECTOR_INTERVALS
from ._goes_shared import _s3_executor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/goes", tags=["goes-fetch"])


@router.post("/fetch-composite", response_model=GoesFetchResponse)
@limiter.limit("3/minute")
async def fetch_composite(
    request: Request,
    payload: FetchCompositeRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Fetch multiple bands and auto-composite. Max 50 frames per request."""
    logger.info("Composite fetch requested")
    recipe_bands = {
        "true_color": ["C01", "C02", "C03"],
        "natural_color": ["C02", "C06", "C07"],
    }
    bands = recipe_bands.get(payload.recipe)
    if not bands:
        raise APIError(400, "bad_request", f"Unknown recipe: {payload.recipe}. Valid: {list(recipe_bands)}")

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

    from ..tasks.composite_task import fetch_composite_data
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
    logger.info("GOES fetch requested")
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

    from ..tasks.fetch_task import fetch_goes_data
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
    logger.debug("Gap detection requested")
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
    logger.info("Backfill gaps requested")
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

    from ..tasks.fetch_task import backfill_gaps as backfill_task
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
    logger.debug("Frame count estimation requested")

    from ..services.goes_fetcher import list_available, validate_params

    validate_params(satellite, sector, band)
    if start_time >= end_time:
        raise APIError(400, "invalid_range", "start_time must be before end_time")

    loop = asyncio.get_running_loop()
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
    logger.debug("Preview frame requested")
    from ..services.goes_fetcher import fetch_single_preview

    png_bytes = fetch_single_preview(satellite, sector, band, time)
    if not png_bytes:
        raise APIError(404, "not_found", "No frame found near the requested time")

    return Response(content=png_bytes, media_type="image/png")
