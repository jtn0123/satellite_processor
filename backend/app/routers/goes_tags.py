"""GOES frame tag management endpoints."""

from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Body, Query
from sqlalchemy import delete, func, select
from sqlalchemy.sql import func as sql_func

from ..db.database import DbSession
from ..db.models import FrameTag, Tag
from ..errors import APIError
from ..models.goes_data import TagCreate, TagResponse
from ..models.pagination import PaginatedResponse
from ..utils import sanitize_log

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/satellite", tags=["satellite-tags"])


@router.post("/tags", response_model=TagResponse)
async def create_tag(
    payload: Annotated[TagCreate, Body()],
    db: DbSession,
):
    """Create a tag. Tag names are compared case-insensitively for
    uniqueness so "Severe Weather" and "severe weather" collide
    (JTN-474 ISSUE-072).
    """
    logger.info("Creating tag: name=%s", sanitize_log(payload.name))
    existing = await db.execute(select(Tag).where(sql_func.lower(Tag.name) == payload.name.lower()))
    if existing.scalars().first():
        raise APIError(409, "conflict", "Tag already exists")
    tag = Tag(id=str(uuid.uuid4()), name=payload.name, color=payload.color)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return TagResponse.model_validate(tag)


@router.get("/tags", response_model=PaginatedResponse[TagResponse])
async def list_tags(
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
):
    logger.debug("Listing tags")
    total = (await db.execute(select(func.count(Tag.id)))).scalar() or 0
    result = await db.execute(select(Tag).order_by(Tag.name).offset((page - 1) * limit).limit(limit))
    items = [TagResponse.model_validate(t) for t in result.scalars().all()]
    return PaginatedResponse(items=items, total=total, page=page, limit=limit)


@router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str, db: DbSession):
    logger.info("Deleting tag: id=%s", sanitize_log(tag_id))
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalars().first()
    if not tag:
        raise APIError(404, "not_found", "Tag not found")
    await db.execute(delete(FrameTag).where(FrameTag.tag_id == tag_id))
    await db.delete(tag)
    await db.commit()
    return {"deleted": tag_id}
