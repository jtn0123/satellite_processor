"""GOES frame collection management endpoints."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Body, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db.database import get_db
from ..db.models import Collection, CollectionFrame, GoesFrame
from ..errors import APIError
from ..models.goes_data import (
    CollectionCreate,
    CollectionFramesRequest,
    CollectionResponse,
    CollectionUpdate,
    GoesFrameResponse,
)
from ..models.pagination import PaginatedResponse
from .goes_frames import MAX_EXPORT_LIMIT, _frames_to_csv, _frames_to_json_list

logger = logging.getLogger(__name__)

_COLLECTION_NOT_FOUND = "Collection not found"

router = APIRouter(prefix="/api/goes", tags=["goes-collections"])


@router.post("/collections", response_model=CollectionResponse)
async def create_collection(
    payload: CollectionCreate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    logger.info("Creating collection: name=%s", payload.name)
    existing = await db.execute(
        select(Collection).where(Collection.name == payload.name)
    )
    if existing.scalar_one_or_none() is not None:
        raise APIError(409, "conflict", f"Collection '{payload.name}' already exists")

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


@router.get("/collections", response_model=PaginatedResponse[CollectionResponse])
async def list_collections(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    logger.debug("Listing collections")
    total = (await db.execute(select(func.count(Collection.id)))).scalar() or 0
    result = await db.execute(
        select(
            Collection,
            func.count(CollectionFrame.frame_id).label("frame_count"),
        )
        .outerjoin(CollectionFrame, CollectionFrame.collection_id == Collection.id)
        .group_by(Collection.id)
        .order_by(Collection.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = result.all()
    items = [
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
    return PaginatedResponse(items=items, total=total, page=page, limit=limit)


@router.put("/collections/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: str,
    payload: CollectionUpdate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    logger.info("Updating collection: id=%s", collection_id)
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
    logger.info("Deleting collection: id=%s", collection_id)
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
    logger.info("Adding frames to collection: id=%s", collection_id)
    result = await db.execute(select(Collection).where(Collection.id == collection_id))
    if not result.scalars().first():
        raise APIError(404, "not_found", _COLLECTION_NOT_FOUND)

    # Bug #9: Bulk insert with ON CONFLICT DO NOTHING
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    values = [
        {"collection_id": collection_id, "frame_id": frame_id}
        for frame_id in payload.frame_ids
    ]
    if values:
        stmt = pg_insert(CollectionFrame).values(values).on_conflict_do_nothing()
        result = await db.execute(stmt)
        added = result.rowcount
    else:
        added = 0
    await db.commit()
    return {"added": added}


@router.get("/collections/{collection_id}/frames", response_model=PaginatedResponse[GoesFrameResponse])
async def list_collection_frames(
    collection_id: str,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=1000),
):
    """Return ordered frames for a collection with pagination."""
    logger.debug("Listing collection frames: id=%s", collection_id)
    result = await db.execute(select(Collection).where(Collection.id == collection_id))
    if not result.scalars().first():
        raise APIError(404, "not_found", _COLLECTION_NOT_FOUND)

    count_result = await db.execute(
        select(func.count(CollectionFrame.frame_id))
        .where(CollectionFrame.collection_id == collection_id)
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * limit
    frame_result = await db.execute(
        select(GoesFrame)
        .join(CollectionFrame, CollectionFrame.frame_id == GoesFrame.id)
        .where(CollectionFrame.collection_id == collection_id)
        .options(selectinload(GoesFrame.tags), selectinload(GoesFrame.collections))
        .order_by(GoesFrame.capture_time.asc())
        .offset(offset)
        .limit(limit)
    )
    frames = frame_result.scalars().all()
    return PaginatedResponse(
        items=[GoesFrameResponse.model_validate(f) for f in frames],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/collections/{collection_id}/export")
async def export_collection(
    collection_id: str,
    format: str = Query("json", pattern="^(csv|json)$"),  # noqa: A002
    db: AsyncSession = Depends(get_db),
    limit: int = Query(1000, ge=1),
    offset: int = Query(0, ge=0),
):
    """Export frame metadata for a collection."""
    logger.info("Exporting collection: id=%s", collection_id)
    import io

    if limit > MAX_EXPORT_LIMIT:
        raise APIError(
            400,
            "limit_exceeded",
            f"Export limit must not exceed {MAX_EXPORT_LIMIT}. Requested: {limit}",
        )
    result = await db.execute(select(Collection).where(Collection.id == collection_id))
    if not result.scalars().first():
        raise APIError(404, "not_found", _COLLECTION_NOT_FOUND)

    frame_result = await db.execute(
        select(GoesFrame)
        .join(CollectionFrame, CollectionFrame.frame_id == GoesFrame.id)
        .where(CollectionFrame.collection_id == collection_id)
        .order_by(GoesFrame.capture_time.desc())
        .offset(offset)
        .limit(limit)
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
    logger.info("Removing frames from collection: id=%s", collection_id)
    result = await db.execute(
        delete(CollectionFrame).where(
            CollectionFrame.collection_id == collection_id,
            CollectionFrame.frame_id.in_(payload.frame_ids),
        )
    )
    await db.commit()
    return {"removed": result.rowcount}
