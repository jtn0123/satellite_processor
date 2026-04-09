"""GOES data fetch and download endpoints."""

import asyncio
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Query, Request
from fastapi.responses import JSONResponse, Response

from ..db.database import DbSession
from ..db.models import Job
from ..errors import APIError
from ..idempotency import (
    get_cached_response,
    idempotency_key_dependency,
    store_response,
)
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
from ..services.satellite_registry import validate_band, validate_sector
from ._goes_shared import COMPOSITE_RECIPES, _s3_executor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/satellite", tags=["satellite-fetch"])


# Single source of truth for composite recipe band lists lives in
# ``_goes_shared.COMPOSITE_RECIPES``. The fetch-composite endpoint only exposes
# a subset of those recipes (the ones wired through the fetch pipeline), and
# derives the band list — and unique-band list — from that shared map so the
# two can't drift out of sync again (JTN-475 ISSUE-066).
_FETCH_COMPOSITE_RECIPE_IDS: tuple[str, ...] = (
    "true_color",
    "natural_color",
    "himawari_true_color",
)


def _get_composite_bands(recipe: str) -> list[str] | None:
    """Return the unique ordered band list for a fetch-composite recipe."""
    if recipe not in _FETCH_COMPOSITE_RECIPE_IDS:
        return None
    bands: list[str] = []
    for band in COMPOSITE_RECIPES[recipe]["bands"]:
        if band not in bands:
            bands.append(band)
    return bands


def _validate_satellite_sector_band(satellite: str, sector: str, band: str | None = None) -> None:
    """Validate (satellite, sector[, band]) tuple — raises APIError(422).

    Catches the `KeyError: 'FLDK'` class of leaks where a sector valid for
    Himawari gets submitted with a GOES satellite, etc. (JTN-421 ISSUE-029,
    JTN-426).
    """
    try:
        validate_sector(satellite, sector)
        if band is not None:
            validate_band(satellite, band)
    except ValueError as exc:
        raise APIError(422, "invalid_combination", str(exc))


# Clock-skew grace window: allow fetch/animate time ranges that extend this far
# past "now" so small client/server time-sync mismatches don't 422 the user.
# Anything further out is a real future date (e.g. ``2099-01-01``) — 422.
_FUTURE_GRACE = timedelta(minutes=30)


def _validate_not_future(start_time: datetime, end_time: datetime) -> None:
    """Reject fetch/animate ranges that extend meaningfully into the future.

    JTN-421 ISSUE-030: previously ``end_time=2099-01-01`` was accepted, the
    job spun up, and the worker did a pointless round trip to S3.
    """
    now = datetime.now(UTC)
    cutoff = now + _FUTURE_GRACE
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=UTC)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=UTC)
    if start_time > cutoff:
        raise APIError(
            422,
            "future_start_time",
            f"start_time ({start_time.isoformat()}) is in the future. Satellite data is not yet available.",
        )
    if end_time > cutoff:
        raise APIError(
            422,
            "future_end_time",
            f"end_time ({end_time.isoformat()}) is in the future. Satellite data is not yet available.",
        )


def _validate_satellite_availability(
    satellite: str,
    start_time: datetime,
    end_time: datetime,
) -> None:
    """Raise APIError if the requested time range falls outside satellite availability."""
    _validate_not_future(start_time, end_time)
    avail = SATELLITE_AVAILABILITY.get(satellite)
    if not avail:
        return
    avail_from = datetime.fromisoformat(avail["available_from"])
    avail_to = datetime.fromisoformat(avail["available_to"]) if avail["available_to"] else None
    if avail_to and start_time.replace(tzinfo=None) > avail_to:
        suggestion = "GOES-19" if satellite == "GOES-16" else "GOES-18"
        raise APIError(
            422,
            "out_of_range",
            f"{satellite} data is only available through {avail['available_to'][:7]}. "
            f"Use {suggestion} for current data.",
        )
    if end_time.replace(tzinfo=None) < avail_from:
        raise APIError(
            422,
            "out_of_range",
            f"{satellite} data is only available from {avail['available_from'][:7]}.",
        )


def _validate_frame_count(
    sector: str,
    start_time: datetime,
    end_time: datetime,
    num_bands: int,
) -> None:
    """Raise APIError if the estimated frame count exceeds the limit."""
    interval = SECTOR_INTERVALS.get(sector, 10)
    duration_min = (end_time - start_time).total_seconds() / 60
    estimated_frames = int(duration_min / interval) * num_bands
    if estimated_frames > 50 * num_bands:
        raise APIError(
            422,
            "too_many_frames",
            f"Estimated {estimated_frames} frames exceeds limit of {50 * num_bands}. Reduce time range.",
        )


def _dispatch_composite_task(
    job_id: str, params: dict[str, Any], satellite: str, recipe: str, num_bands: int
) -> tuple[Any, str]:
    """Dispatch to Himawari or GOES composite task. Returns (celery_result, message)."""
    from ..services.satellite_registry import SATELLITE_REGISTRY

    sat_config = SATELLITE_REGISTRY.get(satellite)
    if sat_config and sat_config.format == "hsd" and recipe == "himawari_true_color":
        from ..tasks.himawari_fetch_task import fetch_himawari_true_color

        result = fetch_himawari_true_color.delay(job_id, params)
        return result, f"Himawari True Color fetch job created ({num_bands} bands)"

    from ..tasks.composite_task import fetch_composite_data

    result = fetch_composite_data.delay(job_id, params)
    return result, f"Composite fetch job created ({recipe}, {num_bands} bands)"


def _dispatch_fetch_task(job_id: str, params: dict[str, Any], satellite: str) -> tuple[Any, str]:
    """Dispatch to Himawari or GOES fetch task. Returns (celery_result, message)."""
    from ..services.satellite_registry import SATELLITE_REGISTRY

    sat_config = SATELLITE_REGISTRY.get(satellite)
    if sat_config and sat_config.format == "hsd":
        from ..tasks.himawari_fetch_task import fetch_himawari_data

        result = fetch_himawari_data.delay(job_id, params)
        return result, "Himawari fetch job created"

    from ..tasks.fetch_task import fetch_goes_data

    result = fetch_goes_data.delay(job_id, params)
    return result, "GOES fetch job created"


@router.post("/fetch-composite")
@limiter.limit("3/minute")
async def fetch_composite(
    request: Request,
    payload: Annotated[FetchCompositeRequest, Body()],
    db: DbSession,
) -> GoesFetchResponse:
    """Fetch multiple bands and auto-composite. Max 50 frames per request."""
    logger.info("Composite fetch requested")
    bands = _get_composite_bands(payload.recipe)
    if not bands:
        raise APIError(
            400,
            "bad_request",
            f"Unknown recipe: {payload.recipe}. Valid: {list(_FETCH_COMPOSITE_RECIPE_IDS)}",
        )

    _validate_satellite_sector_band(payload.satellite, payload.sector)
    _validate_satellite_availability(payload.satellite, payload.start_time, payload.end_time)
    _validate_frame_count(payload.sector, payload.start_time, payload.end_time, len(bands))

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
    await db.flush()

    try:
        result, message = _dispatch_composite_task(job_id, job.params, payload.satellite, payload.recipe, len(bands))
        job.task_id = str(result.id)
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("Failed to dispatch composite task for job %s", job_id)
        raise APIError(503, "task_dispatch_failed", "Failed to enqueue task — broker may be unavailable")

    await invalidate("cache:dashboard-stats*")

    return GoesFetchResponse(
        job_id=job_id,
        status="pending",
        message=message,
    )


@router.post("/fetch", response_model=GoesFetchResponse)
@limiter.limit("5/minute")
async def fetch_goes(
    request: Request,
    payload: Annotated[GoesFetchRequest, Body()],
    db: DbSession,
    idempotency_key: Annotated[str | None, Depends(idempotency_key_dependency)] = None,
) -> GoesFetchResponse | JSONResponse:
    """Kick off a GOES data fetch job.

    JTN-391: accepts an optional ``Idempotency-Key`` header — duplicate
    requests with the same key return the cached first response.
    """
    logger.info("GOES fetch requested")
    if idempotency_key is not None:
        cached = await get_cached_response("POST", "/api/satellite/fetch", idempotency_key)
        if cached is not None:
            return JSONResponse(status_code=cached["status_code"], content=cached["body"])

    _validate_satellite_sector_band(payload.satellite, payload.sector, payload.band)
    _validate_satellite_availability(payload.satellite, payload.start_time, payload.end_time)

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
    await db.flush()

    try:
        result, message = _dispatch_fetch_task(job_id, job.params, payload.satellite)
        job.task_id = str(result.id)
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("Failed to dispatch fetch task for job %s", job_id)
        raise APIError(503, "task_dispatch_failed", "Failed to enqueue task — broker may be unavailable")

    await invalidate("cache:dashboard-stats*")

    response = GoesFetchResponse(
        job_id=job_id,
        status="pending",
        message=message,
    )
    if idempotency_key is not None:
        await store_response(
            "POST",
            "/api/satellite/fetch",
            idempotency_key,
            200,
            response.model_dump(mode="json"),
        )
    return response


@router.get("/gaps")
@limiter.limit("10/minute")
async def detect_gaps(
    request: Request,
    db: DbSession,
    satellite: Annotated[str | None, Query()] = None,
    band: Annotated[str | None, Query()] = None,
    sector: Annotated[str | None, Query()] = None,
    expected_interval: Annotated[float, Query(ge=0.5, le=60.0)] = 10.0,
    start_time: Annotated[datetime | None, Query()] = None,
    end_time: Annotated[datetime | None, Query()] = None,
) -> dict[str, Any]:
    """Run gap detection and return coverage stats.

    Optional ``start_time``/``end_time`` restrict the analysis to a time range.
    If ``start_time >= end_time``, an empty result is returned (no error).
    """
    logger.debug("Gap detection requested")
    if start_time is not None and end_time is not None and start_time >= end_time:
        raise APIError(400, "invalid_range", "start_time must be before end_time")

    return await get_coverage_stats(
        db,
        satellite=satellite,
        band=band,
        sector=sector,
        expected_interval=expected_interval,
        start_time=start_time,
        end_time=end_time,
    )


@router.post("/backfill")
@limiter.limit("2/minute")
async def backfill_gaps(
    request: Request,
    payload: Annotated[GoesBackfillRequest, Body()],
    db: DbSession,
) -> GoesFetchResponse:
    """Fill detected gaps (one-shot, not automatic).

    JTN-460: Requires an explicit ``start_time``, ``end_time``, satellite,
    sector, and band. Previously an empty body was silently accepted and the
    task was enqueued with no time range, which was effectively a no-op.
    """
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
            "start_time": payload.start_time.isoformat(),
            "end_time": payload.end_time.isoformat(),
            "expected_interval": payload.expected_interval,
        },
    )
    db.add(job)
    await db.flush()

    from ..tasks.fetch_task import backfill_gaps as backfill_task

    result = backfill_task.delay(job_id, job.params)
    job.task_id = str(result.id)
    await db.commit()

    return GoesFetchResponse(
        job_id=job_id,
        status="pending",
        message="Backfill job created",
    )


@router.get("/frame-count")
@limiter.limit("30/minute")
async def estimate_frame_count(
    request: Request,
    satellite: Annotated[str, Query()],
    sector: Annotated[str, Query()],
    band: Annotated[str, Query()],
    start_time: Annotated[datetime, Query()],
    end_time: Annotated[datetime, Query()],
) -> dict[str, int]:
    """Estimate frame count for a time range without downloading.

    The ``expected_count`` field is the number of frames the satellite should
    produce over the requested window (sector cadence × duration). It is NOT
    a count of what already exists in the local DB — callers that need that
    should hit ``/frames?...``. The legacy ``count`` field is preserved for
    backwards compatibility (JTN-474 ISSUE-062).
    """
    logger.debug("Frame count estimation requested")

    from ..services.goes_fetcher import list_available, validate_params

    try:
        validate_params(satellite, sector, band)
    except (ValueError, KeyError) as exc:
        raise APIError(422, "invalid_params", str(exc))
    if start_time >= end_time:
        raise APIError(400, "invalid_range", "start_time must be before end_time")

    loop = asyncio.get_running_loop()
    available = await loop.run_in_executor(
        _s3_executor, lambda: list_available(satellite, sector, band, start_time, end_time)
    )
    count = len(available)
    return {"count": count, "expected_count": count}


@router.get("/preview")
@limiter.limit("10/minute")
async def preview_frame(
    request: Request,
    satellite: Annotated[str, Query()],
    sector: Annotated[str, Query()],
    band: Annotated[str, Query()],
    time: Annotated[datetime, Query()],
) -> Response:
    """Fetch a single frame preview."""
    logger.debug("Preview frame requested")
    from ..services.goes_fetcher import fetch_single_preview

    # JTN-475 ISSUE-059: invalid satellite/band/sector previously leaked
    # through ``fetch_single_preview -> validate_params -> ValueError`` as a
    # generic 500. Validate up-front and return 422 with the offending field.
    _validate_satellite_sector_band(satellite, sector, band)
    try:
        png_bytes = fetch_single_preview(satellite, sector, band, time)
    except ValueError as exc:
        raise APIError(422, "invalid_params", str(exc))
    except KeyError as exc:
        raise APIError(422, "invalid_params", f"Unknown parameter: {exc.args[0] if exc.args else exc!s}")
    if not png_bytes:
        raise APIError(404, "not_found", "No frame found near the requested time")

    return Response(content=png_bytes, media_type="image/png")
