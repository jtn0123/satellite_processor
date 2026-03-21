"""GOES frame listing, filtering, stats, and individual frame operations."""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..config import settings
from ..db.database import get_db
from ..db.models import (
    CollectionFrame,
    FetchSchedule,
    FrameTag,
    GoesFrame,
    Job,
    Tag,
)
from ..errors import APIError, validate_uuid
from ..models.goes_data import (
    FrameStatsResponse,
    GoesFrameResponse,
)
from ..models.pagination import PaginatedResponse, PaginationParams
from ..services.cache import get_cached, make_cache_key
from ..rate_limit import limiter
from ..utils.path_validation import validate_file_path

logger = logging.getLogger(__name__)

_FRAME_NOT_FOUND = "Frame not found"

router = APIRouter(prefix="/api/satellite", tags=["satellite-frames"])


# ── Dashboard Stats ───────────────────────────────────────────────────

@router.get("/dashboard-stats")
@limiter.limit("60/minute")
async def dashboard_stats(request: Request, db: AsyncSession = Depends(get_db)):
    """Aggregated dashboard statistics for the GOES data overview."""
    logger.debug("Dashboard stats requested")
    cache_key = make_cache_key("dashboard-stats")

    async def _fetch():
        total = (await db.execute(select(func.count(GoesFrame.id)))).scalar() or 0

        sat_rows = (await db.execute(
            select(GoesFrame.satellite, func.count(GoesFrame.id))
            .group_by(GoesFrame.satellite)
        )).all()
        frames_by_satellite = {row[0]: row[1] for row in sat_rows}

        last_job = (await db.execute(
            select(Job.completed_at)
            .where(Job.job_type == "goes_fetch", Job.status == "completed")
            .order_by(Job.completed_at.desc())
            .limit(1)
        )).scalar()
        last_fetch_time = last_job.isoformat() if last_job else None

        active_schedules = (await db.execute(
            select(func.count(FetchSchedule.id)).where(FetchSchedule.is_active.is_(True))
        )).scalar() or 0

        sat_storage_rows = (await db.execute(
            select(GoesFrame.satellite, func.coalesce(func.sum(GoesFrame.file_size), 0))
            .group_by(GoesFrame.satellite)
        )).all()
        storage_by_satellite = {row[0]: row[1] for row in sat_storage_rows}

        band_storage_rows = (await db.execute(
            select(GoesFrame.band, func.coalesce(func.sum(GoesFrame.file_size), 0))
            .group_by(GoesFrame.band)
        )).all()
        storage_by_band = {row[0]: row[1] for row in band_storage_rows}

        recent_rows = (await db.execute(
            select(Job)
            .where(Job.job_type == "goes_fetch")
            .order_by(Job.created_at.desc())
            .limit(5)
        )).scalars().all()
        recent_jobs = [
            {
                "id": j.id,
                "status": j.status,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "status_message": j.status_message or "",
            }
            for j in recent_rows
        ]

        return {
            "total_frames": total,
            "frames_by_satellite": frames_by_satellite,
            "last_fetch_time": last_fetch_time,
            "active_schedules": active_schedules,
            "storage_by_satellite": storage_by_satellite,
            "storage_by_band": storage_by_band,
            "recent_jobs": recent_jobs,
        }

    return await get_cached(cache_key, ttl=120, fetch_fn=_fetch)


# ── Quick Fetch Presets ───────────────────────────────────────────────

@router.get("/quick-fetch-options")
@limiter.limit("60/minute")
async def quick_fetch_options(request: Request):
    """Return preset time ranges for quick GOES data fetching."""
    return [
        {"label": "Last Hour", "hours_back": 1},
        {"label": "Last 6 Hours", "hours_back": 6},
        {"label": "Last 12 Hours", "hours_back": 12},
        {"label": "Last 24 Hours", "hours_back": 24},
    ]


# ── Frames ────────────────────────────────────────────────────────────

@router.get("/frames", response_model=PaginatedResponse[GoesFrameResponse])
@limiter.limit("60/minute")
async def list_frames(
    request: Request,
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
    satellite: str | None = None,
    band: str | None = None,
    sector: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    collection_id: str | None = None,
    tag: str | None = None,
    sort: str = Query("capture_time", pattern="^(capture_time|file_size|satellite|created_at)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    """List GOES frames with filtering, sorting, pagination."""
    logger.debug("Listing frames: page=%d, limit=%d", pagination.page, pagination.limit)
    query = select(GoesFrame).options(
        selectinload(GoesFrame.tags),
        selectinload(GoesFrame.collections),
    )
    count_query = select(func.count(GoesFrame.id))

    if satellite:
        query = query.where(GoesFrame.satellite == satellite)
        count_query = count_query.where(GoesFrame.satellite == satellite)
    if band:
        query = query.where(GoesFrame.band == band)
        count_query = count_query.where(GoesFrame.band == band)
    if sector:
        query = query.where(GoesFrame.sector == sector)
        count_query = count_query.where(GoesFrame.sector == sector)
    if start_date:
        query = query.where(GoesFrame.capture_time >= start_date)
        count_query = count_query.where(GoesFrame.capture_time >= start_date)
    if end_date:
        query = query.where(GoesFrame.capture_time <= end_date)
        count_query = count_query.where(GoesFrame.capture_time <= end_date)
    if collection_id:
        query = query.join(CollectionFrame, CollectionFrame.frame_id == GoesFrame.id).where(
            CollectionFrame.collection_id == collection_id
        )
        count_query = count_query.join(
            CollectionFrame, CollectionFrame.frame_id == GoesFrame.id
        ).where(CollectionFrame.collection_id == collection_id)
    if tag:
        query = query.join(FrameTag, FrameTag.frame_id == GoesFrame.id).join(
            Tag, Tag.id == FrameTag.tag_id
        ).where(Tag.name == tag)
        count_query = count_query.join(
            FrameTag, FrameTag.frame_id == GoesFrame.id
        ).join(Tag, Tag.id == FrameTag.tag_id).where(Tag.name == tag)

    sort_col = getattr(GoesFrame, sort, GoesFrame.capture_time)
    if order == "desc":
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())

    total = (await db.execute(count_query)).scalar() or 0
    query = query.offset(pagination.offset).limit(pagination.limit)
    result = await db.execute(query)
    frames = result.scalars().unique().all()

    return PaginatedResponse(
        items=[GoesFrameResponse.model_validate(f) for f in frames],
        total=total,
        page=pagination.page,
        limit=pagination.limit,
    )


@router.get("/frames/stats", response_model=FrameStatsResponse)
@limiter.limit("60/minute")
async def frame_stats(request: Request, db: AsyncSession = Depends(get_db)):
    """Storage stats per satellite/band."""
    logger.debug("Frame stats requested")
    result = await db.execute(
        select(
            GoesFrame.satellite,
            GoesFrame.band,
            func.count(GoesFrame.id).label("count"),
            func.coalesce(func.sum(GoesFrame.file_size), 0).label("size"),
        ).group_by(GoesFrame.satellite, GoesFrame.band)
    )
    rows = result.all()

    total_frames = 0
    total_size = 0
    by_satellite: dict[str, dict[str, int]] = {}
    by_band: dict[str, dict[str, int]] = {}

    for sat, band_val, count, size in rows:
        total_frames += count
        total_size += size
        if sat not in by_satellite:
            by_satellite[sat] = {"count": 0, "size": 0}
        by_satellite[sat]["count"] += count
        by_satellite[sat]["size"] += size
        if band_val not in by_band:
            by_band[band_val] = {"count": 0, "size": 0}
        by_band[band_val]["count"] += count
        by_band[band_val]["size"] += size

    return FrameStatsResponse(
        total_frames=total_frames,
        total_size_bytes=total_size,
        by_satellite=by_satellite,
        by_band=by_band,
    )


@router.get("/frames/{frame_id}", response_model=GoesFrameResponse)
@limiter.limit("60/minute")
async def get_frame(request: Request, frame_id: str, db: AsyncSession = Depends(get_db)):
    """Get single frame detail."""
    logger.debug("Frame requested: frame_id=%s", frame_id)
    validate_uuid(frame_id, "frame_id")
    result = await db.execute(
        select(GoesFrame)
        .options(selectinload(GoesFrame.tags), selectinload(GoesFrame.collections))
        .where(GoesFrame.id == frame_id)
    )
    frame = result.scalars().first()
    if not frame:
        raise APIError(404, "not_found", _FRAME_NOT_FOUND)
    return GoesFrameResponse.model_validate(frame)


# ── Frame Image Endpoints ─────────────────────────────────────────────


@router.get("/frames/{frame_id}/image")
@limiter.limit("60/minute")
async def get_frame_image(request: Request, frame_id: str, db: AsyncSession = Depends(get_db)):
    """Serve the raw image file for a frame."""
    logger.debug("Frame image requested: frame_id=%s", frame_id)
    validate_uuid(frame_id, "frame_id")
    result = await db.execute(select(GoesFrame).where(GoesFrame.id == frame_id))
    frame = result.scalars().first()
    if not frame:
        raise APIError(404, "not_found", _FRAME_NOT_FOUND)

    raw_path = frame.file_path
    if not Path(raw_path).is_absolute():
        raw_path = str(Path(settings.storage_path) / raw_path)
    file_path = validate_file_path(raw_path)

    if not file_path.exists():
        raise APIError(404, "not_found", "Frame image file not found on disk")

    import mimetypes

    media_type = mimetypes.guess_type(str(file_path))[0] or "image/png"

    def _iter():
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        _iter(),
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/frames/{frame_id}/thumbnail")
@limiter.limit("60/minute")
async def get_frame_thumbnail(request: Request, frame_id: str, db: AsyncSession = Depends(get_db)):
    """Serve the thumbnail image for a frame."""
    logger.debug("Frame thumbnail requested: frame_id=%s", frame_id)
    validate_uuid(frame_id, "frame_id")
    result = await db.execute(select(GoesFrame).where(GoesFrame.id == frame_id))
    frame = result.scalars().first()
    if not frame:
        raise APIError(404, "not_found", _FRAME_NOT_FOUND)

    thumb_path = frame.thumbnail_path
    if not thumb_path:
        thumb_path = frame.file_path

    if not Path(thumb_path).is_absolute():
        thumb_path = str(Path(settings.storage_path) / thumb_path)
    file_path = validate_file_path(thumb_path)

    if not file_path.exists():
        raise APIError(404, "not_found", "Thumbnail file not found on disk")

    import mimetypes

    media_type = mimetypes.guess_type(str(file_path))[0] or "image/png"

    def _iter():
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        _iter(),
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
