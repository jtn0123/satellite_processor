"""GOES data management endpoints — frames, collections, tags."""

from __future__ import annotations

import csv
import io
import os
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
    Collection,
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
    CollectionCreate,
    CollectionFramesRequest,
    CollectionResponse,
    CollectionUpdate,
    FrameStatsResponse,
    GoesFrameResponse,
    ProcessFramesRequest,
    TagCreate,
    TagResponse,
)
from ..models.pagination import PaginatedResponse

_COLLECTION_NOT_FOUND = "Collection not found"

router = APIRouter(prefix="/api/goes", tags=["goes-data"])


# ── Dashboard Stats ───────────────────────────────────────────────────

@router.get("/dashboard-stats")
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    """Aggregated dashboard statistics for the GOES data overview."""
    # Total frames
    total = (await db.execute(select(func.count(GoesFrame.id)))).scalar() or 0

    # Frames by satellite
    sat_rows = (await db.execute(
        select(GoesFrame.satellite, func.count(GoesFrame.id))
        .group_by(GoesFrame.satellite)
    )).all()
    frames_by_satellite = {row[0]: row[1] for row in sat_rows}

    # Last fetch time (most recent goes_fetch job)
    last_job = (await db.execute(
        select(Job.completed_at)
        .where(Job.job_type == "goes_fetch", Job.status == "completed")
        .order_by(Job.completed_at.desc())
        .limit(1)
    )).scalar()
    last_fetch_time = last_job.isoformat() if last_job else None

    # Active schedules
    active_schedules = (await db.execute(
        select(func.count(FetchSchedule.id)).where(FetchSchedule.is_active.is_(True))
    )).scalar() or 0

    # Storage by satellite
    sat_storage_rows = (await db.execute(
        select(GoesFrame.satellite, func.coalesce(func.sum(GoesFrame.file_size), 0))
        .group_by(GoesFrame.satellite)
    )).all()
    storage_by_satellite = {row[0]: row[1] for row in sat_storage_rows}

    # Storage by band
    band_storage_rows = (await db.execute(
        select(GoesFrame.band, func.coalesce(func.sum(GoesFrame.file_size), 0))
        .group_by(GoesFrame.band)
    )).all()
    storage_by_band = {row[0]: row[1] for row in band_storage_rows}

    # Recent jobs (last 5 goes_fetch)
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
    query = select(GoesFrame).options(
        selectinload(GoesFrame.tags),
        selectinload(GoesFrame.collections),
    )
    count_query = select(func.count(GoesFrame.id))

    # Filters
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

    # Sort
    sort_col = getattr(GoesFrame, sort, GoesFrame.capture_time)
    if order == "desc":
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())

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
async def get_frame(frame_id: str, db: AsyncSession = Depends(get_db)):
    """Get single frame detail."""
    validate_uuid(frame_id, "frame_id")
    result = await db.execute(
        select(GoesFrame)
        .options(selectinload(GoesFrame.tags), selectinload(GoesFrame.collections))
        .where(GoesFrame.id == frame_id)
    )
    frame = result.scalars().first()
    if not frame:
        raise APIError(404, "not_found", "Frame not found")
    return GoesFrameResponse.model_validate(frame)


@router.delete("/frames")
async def bulk_delete_frames(
    payload: BulkFrameDeleteRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Bulk delete frames and their files."""
    result = await db.execute(
        select(GoesFrame).where(GoesFrame.id.in_(payload.ids))
    )
    frames = result.scalars().all()

    # Delete files
    for frame in frames:
        for path in [frame.file_path, frame.thumbnail_path]:
            if path:
                try:
                    os.remove(path)
                except OSError:
                    pass

    await db.execute(delete(GoesFrame).where(GoesFrame.id.in_(payload.ids)))
    await db.commit()
    return {"deleted": len(frames)}


@router.post("/frames/tag")
async def bulk_tag_frames(
    payload: BulkTagRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Bulk tag frames."""
    for frame_id in payload.frame_ids:
        for tag_id in payload.tag_ids:
            existing = await db.execute(
                select(FrameTag).where(
                    FrameTag.frame_id == frame_id, FrameTag.tag_id == tag_id
                )
            )
            if not existing.scalars().first():
                db.add(FrameTag(frame_id=frame_id, tag_id=tag_id))
    await db.commit()
    return {"tagged": len(payload.frame_ids)}


@router.post("/frames/bulk-tag")
async def bulk_tag_frames_v2(
    payload: BulkTagRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Bulk tag frames (v2 — accepts single tag_id or tag_ids list)."""
    tag_ids = payload.tag_ids
    for frame_id in payload.frame_ids:
        for tag_id in tag_ids:
            existing = await db.execute(
                select(FrameTag).where(
                    FrameTag.frame_id == frame_id, FrameTag.tag_id == tag_id
                )
            )
            if not existing.scalars().first():
                db.add(FrameTag(frame_id=frame_id, tag_id=tag_id))
    await db.commit()
    return {"tagged": len(payload.frame_ids)}


@router.post("/frames/bulk-delete")
async def bulk_delete_frames_v2(
    payload: BulkFrameDeleteRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Bulk delete frames (v2 endpoint)."""
    result = await db.execute(
        select(GoesFrame).where(GoesFrame.id.in_(payload.ids))
    )
    frames = result.scalars().all()
    for frame in frames:
        for path in [frame.file_path, frame.thumbnail_path]:
            if path:
                try:
                    os.remove(path)
                except OSError:
                    pass
    await db.execute(delete(GoesFrame).where(GoesFrame.id.in_(payload.ids)))
    await db.commit()
    return {"deleted": len(frames)}


def _frames_to_csv(frames: list[GoesFrame]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "satellite", "sector", "band", "capture_time", "file_size"])
    for f in frames:
        writer.writerow([
            f.id, f.satellite, f.sector, f.band,
            f.capture_time.isoformat() if f.capture_time else "",
            f.file_size,
        ])
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


@router.get("/frames/export")
async def export_frames(
    format: str = Query("json", pattern="^(csv|json)$"),  # noqa: A002
    db: AsyncSession = Depends(get_db),
):
    """Export all frame metadata as CSV or JSON."""
    result = await db.execute(select(GoesFrame).order_by(GoesFrame.capture_time.desc()))
    frames = result.scalars().all()
    if format == "csv":
        return StreamingResponse(
            io.BytesIO(_frames_to_csv(frames).encode()),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=goes_frames.csv"},
        )
    return _frames_to_json_list(frames)


@router.post("/frames/process")
async def process_frames(
    payload: ProcessFramesRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Send selected frames to the processing pipeline."""
    result = await db.execute(
        select(GoesFrame.file_path).where(GoesFrame.id.in_(payload.frame_ids))
    )
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


# ── Collections ───────────────────────────────────────────────────────

@router.post("/collections", response_model=CollectionResponse)
async def create_collection(
    payload: CollectionCreate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    coll = Collection(
        id=str(uuid.uuid4()),
        name=payload.name,
        description=payload.description,
    )
    db.add(coll)
    await db.commit()
    await db.refresh(coll)
    return CollectionResponse(
        id=coll.id,
        name=coll.name,
        description=coll.description or "",
        created_at=coll.created_at,
        updated_at=coll.updated_at,
        frame_count=0,
    )


@router.get("/collections", response_model=list[CollectionResponse])
async def list_collections(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            Collection,
            func.count(CollectionFrame.frame_id).label("frame_count"),
        )
        .outerjoin(CollectionFrame, CollectionFrame.collection_id == Collection.id)
        .group_by(Collection.id)
        .order_by(Collection.created_at.desc())
    )
    rows = result.all()
    return [
        CollectionResponse(
            id=coll.id,
            name=coll.name,
            description=coll.description or "",
            created_at=coll.created_at,
            updated_at=coll.updated_at,
            frame_count=count,
        )
        for coll, count in rows
    ]


@router.put("/collections/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: str,
    payload: CollectionUpdate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Collection).where(Collection.id == collection_id))
    coll = result.scalars().first()
    if not coll:
        raise APIError(404, "not_found", _COLLECTION_NOT_FOUND)
    if payload.name is not None:
        coll.name = payload.name
    if payload.description is not None:
        coll.description = payload.description
    await db.commit()
    await db.refresh(coll)

    count_result = await db.execute(
        select(func.count(CollectionFrame.frame_id)).where(
            CollectionFrame.collection_id == collection_id
        )
    )
    frame_count = count_result.scalar() or 0

    return CollectionResponse(
        id=coll.id,
        name=coll.name,
        description=coll.description or "",
        created_at=coll.created_at,
        updated_at=coll.updated_at,
        frame_count=frame_count,
    )


@router.delete("/collections/{collection_id}")
async def delete_collection(
    collection_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Collection).where(Collection.id == collection_id))
    coll = result.scalars().first()
    if not coll:
        raise APIError(404, "not_found", _COLLECTION_NOT_FOUND)
    await db.delete(coll)
    await db.commit()
    return {"deleted": collection_id}


@router.post("/collections/{collection_id}/frames")
async def add_frames_to_collection(
    collection_id: str,
    payload: CollectionFramesRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    # Verify collection exists
    result = await db.execute(select(Collection).where(Collection.id == collection_id))
    if not result.scalars().first():
        raise APIError(404, "not_found", _COLLECTION_NOT_FOUND)

    added = 0
    for frame_id in payload.frame_ids:
        existing = await db.execute(
            select(CollectionFrame).where(
                CollectionFrame.collection_id == collection_id,
                CollectionFrame.frame_id == frame_id,
            )
        )
        if not existing.scalars().first():
            db.add(CollectionFrame(collection_id=collection_id, frame_id=frame_id))
            added += 1
    await db.commit()
    return {"added": added}


@router.get("/collections/{collection_id}/frames", response_model=list[GoesFrameResponse])
async def list_collection_frames(
    collection_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return ordered frames for a collection."""
    result = await db.execute(select(Collection).where(Collection.id == collection_id))
    if not result.scalars().first():
        raise APIError(404, "not_found", _COLLECTION_NOT_FOUND)

    frame_result = await db.execute(
        select(GoesFrame)
        .join(CollectionFrame, CollectionFrame.frame_id == GoesFrame.id)
        .where(CollectionFrame.collection_id == collection_id)
        .options(selectinload(GoesFrame.tags), selectinload(GoesFrame.collections))
        .order_by(GoesFrame.capture_time.asc())
    )
    frames = frame_result.scalars().all()
    return [GoesFrameResponse.model_validate(f) for f in frames]


@router.get("/collections/{collection_id}/export")
async def export_collection(
    collection_id: str,
    format: str = Query("json", pattern="^(csv|json)$"),  # noqa: A002
    db: AsyncSession = Depends(get_db),
):
    """Export frame metadata for a collection."""
    result = await db.execute(select(Collection).where(Collection.id == collection_id))
    if not result.scalars().first():
        raise APIError(404, "not_found", _COLLECTION_NOT_FOUND)

    frame_result = await db.execute(
        select(GoesFrame)
        .join(CollectionFrame, CollectionFrame.frame_id == GoesFrame.id)
        .where(CollectionFrame.collection_id == collection_id)
        .order_by(GoesFrame.capture_time.desc())
    )
    frames = frame_result.scalars().all()
    if format == "csv":
        return StreamingResponse(
            io.BytesIO(_frames_to_csv(frames).encode()),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=collection_{collection_id}.csv"},
        )
    return _frames_to_json_list(frames)


@router.delete("/collections/{collection_id}/frames")
async def remove_frames_from_collection(
    collection_id: str,
    payload: CollectionFramesRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(CollectionFrame).where(
            CollectionFrame.collection_id == collection_id,
            CollectionFrame.frame_id.in_(payload.frame_ids),
        )
    )
    await db.commit()
    return {"removed": len(payload.frame_ids)}


# ── Tags ──────────────────────────────────────────────────────────────

@router.post("/tags", response_model=TagResponse)
async def create_tag(
    payload: TagCreate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    # Check uniqueness
    existing = await db.execute(select(Tag).where(Tag.name == payload.name))
    if existing.scalars().first():
        raise APIError(409, "conflict", "Tag already exists")
    tag = Tag(id=str(uuid.uuid4()), name=payload.name, color=payload.color)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return TagResponse.model_validate(tag)


@router.get("/tags", response_model=list[TagResponse])
async def list_tags(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).order_by(Tag.name))
    return [TagResponse.model_validate(t) for t in result.scalars().all()]


@router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalars().first()
    if not tag:
        raise APIError(404, "not_found", "Tag not found")
    await db.delete(tag)
    await db.commit()
    return {"deleted": tag_id}


# ── Frame Image Endpoint ──────────────────────────────────────────────


@router.get("/frames/{frame_id}/image")
async def get_frame_image(frame_id: str, db: AsyncSession = Depends(get_db)):
    """Serve the raw image file for a frame."""
    validate_uuid(frame_id, "frame_id")
    result = await db.execute(select(GoesFrame).where(GoesFrame.id == frame_id))
    frame = result.scalars().first()
    if not frame:
        raise APIError(404, "not_found", "Frame not found")

    file_path = Path(frame.file_path)
    if not file_path.is_absolute():
        file_path = Path(settings.DATA_DIR) / file_path

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


# ── Collection Frames Endpoint ────────────────────────────────────────


@router.get(
    "/collections/{collection_id}/frames",
    response_model=list[GoesFrameResponse],
)
async def get_collection_frames(
    collection_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get all frames in a collection, ordered by capture_time ascending."""
    validate_uuid(collection_id, "collection_id")
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    if not result.scalars().first():
        raise APIError(404, "not_found", _COLLECTION_NOT_FOUND)

    frame_result = await db.execute(
        select(GoesFrame)
        .join(CollectionFrame, CollectionFrame.frame_id == GoesFrame.id)
        .where(CollectionFrame.collection_id == collection_id)
        .options(selectinload(GoesFrame.tags), selectinload(GoesFrame.collections))
        .order_by(GoesFrame.capture_time.asc())
    )
    frames = frame_result.scalars().all()
    return [GoesFrameResponse.model_validate(f) for f in frames]
