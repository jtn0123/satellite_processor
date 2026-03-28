"""GOES frame CRUD, stats, and image serving endpoints."""

from __future__ import annotations

import csv
import io
import logging
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Body, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
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
    BulkFrameDeleteRequest,
    BulkTagRequest,
    FrameStatsResponse,
    GoesFrameResponse,
    ProcessFramesRequest,
)
from ..models.pagination import PaginatedResponse
from ..services.cache import get_cached, invalidate, make_cache_key
from ..utils import safe_remove
from ..utils.path_validation import validate_file_path

logger = logging.getLogger(__name__)

_FRAME_NOT_FOUND = "Frame not found"

MAX_EXPORT_LIMIT = 5000

router = APIRouter(prefix="/api/satellite", tags=["satellite-frames"])


# ── Dashboard Stats ───────────────────────────────────────────────────


@router.get("/dashboard-stats")
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    """Aggregated dashboard statistics for the GOES data overview."""
    logger.debug("Dashboard stats requested")
    cache_key = make_cache_key("dashboard-stats")

    async def _fetch():
        total = (await db.execute(select(func.count(GoesFrame.id)))).scalar() or 0

        sat_rows = (
            await db.execute(select(GoesFrame.satellite, func.count(GoesFrame.id)).group_by(GoesFrame.satellite))
        ).all()
        frames_by_satellite = {row[0]: row[1] for row in sat_rows}

        last_job = (
            await db.execute(
                select(Job.completed_at)
                .where(Job.job_type == "goes_fetch", Job.status == "completed")
                .order_by(Job.completed_at.desc())
                .limit(1)
            )
        ).scalar()
        last_fetch_time = last_job.isoformat() if last_job else None

        active_schedules = (
            await db.execute(select(func.count(FetchSchedule.id)).where(FetchSchedule.is_active.is_(True)))
        ).scalar() or 0

        sat_storage_rows = (
            await db.execute(
                select(GoesFrame.satellite, func.coalesce(func.sum(GoesFrame.file_size), 0)).group_by(
                    GoesFrame.satellite
                )
            )
        ).all()
        storage_by_satellite = {row[0]: row[1] for row in sat_storage_rows}

        band_storage_rows = (
            await db.execute(
                select(GoesFrame.band, func.coalesce(func.sum(GoesFrame.file_size), 0)).group_by(GoesFrame.band)
            )
        ).all()
        storage_by_band = {row[0]: row[1] for row in band_storage_rows}

        recent_rows = (
            (await db.execute(select(Job).where(Job.job_type == "goes_fetch").order_by(Job.created_at.desc()).limit(5)))
            .scalars()
            .all()
        )
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
async def quick_fetch_options():
    """Return preset time ranges for quick GOES data fetching."""
    return [
        {"label": "Last Hour", "hours_back": 1},
        {"label": "Last 6 Hours", "hours_back": 6},
        {"label": "Last 12 Hours", "hours_back": 12},
        {"label": "Last 24 Hours", "hours_back": 24},
    ]


# ── Frames ────────────────────────────────────────────────────────────


@router.get("/frames", response_model=PaginatedResponse[GoesFrameResponse])
async def list_frames(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
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
    logger.debug("Listing frames: page=%d, limit=%d", page, limit)
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
        count_query = count_query.join(CollectionFrame, CollectionFrame.frame_id == GoesFrame.id).where(
            CollectionFrame.collection_id == collection_id
        )
    if tag:
        query = (
            query.join(FrameTag, FrameTag.frame_id == GoesFrame.id)
            .join(Tag, Tag.id == FrameTag.tag_id)
            .where(Tag.name == tag)
        )
        count_query = (
            count_query.join(FrameTag, FrameTag.frame_id == GoesFrame.id)
            .join(Tag, Tag.id == FrameTag.tag_id)
            .where(Tag.name == tag)
        )

    _SORT_FIELDS = {
        "capture_time": GoesFrame.capture_time,
        "file_size": GoesFrame.file_size,
        "satellite": GoesFrame.satellite,
        "created_at": GoesFrame.created_at,
    }
    sort_col = _SORT_FIELDS.get(sort, GoesFrame.capture_time)
    query = query.order_by(sort_col.desc()) if order == "desc" else query.order_by(sort_col.asc())

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    frames = result.scalars().unique().all()

    return PaginatedResponse(
        items=[GoesFrameResponse.model_validate(f) for f in frames],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/frames/stats", response_model=FrameStatsResponse)
async def frame_stats(db: AsyncSession = Depends(get_db)):
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


def _frames_to_csv(frames: list[GoesFrame]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "satellite", "sector", "band", "capture_time", "file_size"])
    for f in frames:
        writer.writerow(
            [
                f.id,
                f.satellite,
                f.sector,
                f.band,
                f.capture_time.isoformat() if f.capture_time else "",
                f.file_size,
            ]
        )
    return output.getvalue()


def _frames_to_json_list(frames: list[GoesFrame]) -> list[dict]:
    return [
        {
            "id": f.id,
            "satellite": f.satellite,
            "sector": f.sector,
            "band": f.band,
            "capture_time": f.capture_time.isoformat() if f.capture_time else None,
            "file_size": f.file_size,
        }
        for f in frames
    ]


# Bug #2: /frames/export MUST be registered before /frames/{frame_id}
@router.get("/frames/export")
async def export_frames(
    format: str = Query("json", pattern="^(csv|json)$"),  # noqa: A002
    db: AsyncSession = Depends(get_db),
    limit: int = Query(1000, ge=1),
    offset: int = Query(0, ge=0),
):
    """Export frame metadata as CSV or JSON with pagination."""
    logger.info("Exporting frames")
    if limit > MAX_EXPORT_LIMIT:
        raise APIError(
            400,
            "limit_exceeded",
            f"Export limit must not exceed {MAX_EXPORT_LIMIT}. Requested: {limit}",
        )
    import json as json_mod

    query = select(GoesFrame).order_by(GoesFrame.capture_time.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    frames = result.scalars().all()

    if format == "csv":
        csv_data = _frames_to_csv(frames)
        return StreamingResponse(
            io.BytesIO(csv_data.encode()),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=goes_frames.csv"},
        )

    items = _frames_to_json_list(frames)

    async def _stream_json():
        yield json_mod.dumps(items)

    return StreamingResponse(
        _stream_json(),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=goes_frames.json"},
    )


@router.get("/frames/{frame_id}", response_model=GoesFrameResponse)
async def get_frame(frame_id: str, db: AsyncSession = Depends(get_db)):
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


@router.delete("/frames")
async def bulk_delete_frames(
    payload: BulkFrameDeleteRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Bulk delete frames and their files."""
    logger.info("Bulk delete frames requested")
    result = await db.execute(select(GoesFrame).where(GoesFrame.id.in_(payload.ids)))
    frames = result.scalars().all()

    for frame in frames:
        for path in [frame.file_path, frame.thumbnail_path]:
            if path:
                safe_remove(path)

    # Bug #17: Delete FK references before deleting frames
    await db.execute(delete(CollectionFrame).where(CollectionFrame.frame_id.in_(payload.ids)))
    await db.execute(delete(FrameTag).where(FrameTag.frame_id.in_(payload.ids)))
    await db.execute(delete(GoesFrame).where(GoesFrame.id.in_(payload.ids)))
    await db.commit()
    await invalidate("cache:dashboard-stats*")
    return {"deleted": len(frames)}


@router.post("/frames/tag")
async def bulk_tag_frames(
    payload: BulkTagRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Bulk tag frames using ON CONFLICT DO NOTHING for performance."""
    logger.info("Bulk tagging frames")
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    values = [{"frame_id": frame_id, "tag_id": tag_id} for frame_id in payload.frame_ids for tag_id in payload.tag_ids]
    if values:
        stmt = pg_insert(FrameTag).values(values).on_conflict_do_nothing()
        await db.execute(stmt)
    await db.commit()
    return {"tagged": len(payload.frame_ids)}


@router.post("/frames/process")
async def process_frames(
    payload: ProcessFramesRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Send selected frames to the processing pipeline."""
    logger.info("Processing frames requested")
    result = await db.execute(select(GoesFrame.file_path).where(GoesFrame.id.in_(payload.frame_ids)))
    paths = [r[0] for r in result.all()]
    if not paths:
        raise APIError(404, "not_found", "No frames found")

    job_id = str(uuid.uuid4())
    staging_dir = str(Path(settings.output_dir) / f"job_staging_{job_id}")

    job = Job(
        id=job_id,
        status="pending",
        job_type="image_process",
        params={
            **payload.params,
            "image_paths": paths,
            "input_path": staging_dir,
        },
    )
    db.add(job)
    await db.commit()

    from ..tasks.processing import process_images_task

    process_images_task.delay(job_id, job.params)
    return {"job_id": job_id, "status": "pending", "frame_count": len(paths)}


# ── Frame Image Endpoints ─────────────────────────────────────────────


@router.get("/frames/{frame_id}/image")
async def get_frame_image(frame_id: str, db: AsyncSession = Depends(get_db)):
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
async def get_frame_thumbnail(frame_id: str, db: AsyncSession = Depends(get_db)):
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
