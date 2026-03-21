"""Routers for schedules (CRUD, toggle)."""

from __future__ import annotations

import logging
import uuid
from datetime import timedelta

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db.database import get_db
from ..db.models import (
    FetchPreset,
    FetchSchedule,
)
from ..errors import APIError
from ..models.scheduling import (
    FetchScheduleCreate,
    FetchScheduleResponse,
    FetchScheduleUpdate,
)
from ..rate_limit import limiter
from ..utils import utcnow

logger = logging.getLogger(__name__)

_FETCH_PRESET_NOT_FOUND = "Fetch preset not found"
_SCHEDULE_NOT_FOUND = "Schedule not found"

router = APIRouter(prefix="/api/satellite", tags=["scheduling"])


# ── Schedules ─────────────────────────────────────────────

@router.post("/schedules", response_model=FetchScheduleResponse)
@limiter.limit("10/minute")
async def create_schedule(
    request: Request,
    payload: FetchScheduleCreate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    # Verify preset exists
    logger.info("Creating schedule")
    result = await db.execute(select(FetchPreset).where(FetchPreset.id == payload.preset_id))
    if not result.scalars().first():
        raise APIError(404, "not_found", _FETCH_PRESET_NOT_FOUND)

    now = utcnow()
    schedule = FetchSchedule(
        id=str(uuid.uuid4()),
        name=payload.name,
        preset_id=payload.preset_id,
        interval_minutes=payload.interval_minutes,
        is_active=payload.is_active,
        next_run_at=now + timedelta(minutes=payload.interval_minutes) if payload.is_active else None,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return await _schedule_response(db, schedule)


@router.get("/schedules", response_model=list[FetchScheduleResponse])
@limiter.limit("60/minute")
async def list_schedules(request: Request, db: AsyncSession = Depends(get_db)):
    logger.debug("Listing schedules")
    result = await db.execute(
        select(FetchSchedule)
        .options(selectinload(FetchSchedule.preset))
        .order_by(FetchSchedule.created_at.desc())
    )
    schedules = result.scalars().all()
    return [FetchScheduleResponse.model_validate(s) for s in schedules]


@router.put("/schedules/{schedule_id}", response_model=FetchScheduleResponse)
@limiter.limit("10/minute")
async def update_schedule(
    request: Request,
    schedule_id: str,
    payload: FetchScheduleUpdate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    logger.info("Updating schedule: id=%s", schedule_id)
    result = await db.execute(
        select(FetchSchedule).options(selectinload(FetchSchedule.preset)).where(FetchSchedule.id == schedule_id)
    )
    schedule = result.scalars().first()
    if not schedule:
        raise APIError(404, "not_found", _SCHEDULE_NOT_FOUND)

    if payload.preset_id is not None:
        p = await db.execute(select(FetchPreset).where(FetchPreset.id == payload.preset_id))
        if not p.scalars().first():
            raise APIError(404, "not_found", _FETCH_PRESET_NOT_FOUND)
        schedule.preset_id = payload.preset_id

    for field in ("name", "interval_minutes", "is_active"):
        val = getattr(payload, field)
        if val is not None:
            setattr(schedule, field, val)

    # Recompute next_run_at if toggled active
    if schedule.is_active and schedule.next_run_at is None:
        schedule.next_run_at = utcnow() + timedelta(minutes=schedule.interval_minutes)
    elif not schedule.is_active:
        schedule.next_run_at = None

    await db.commit()
    await db.refresh(schedule)
    return await _schedule_response(db, schedule)


@router.delete("/schedules/{schedule_id}")
@limiter.limit("10/minute")
async def delete_schedule(
    request: Request,
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
):
    logger.info("Deleting schedule: id=%s", schedule_id)
    result = await db.execute(select(FetchSchedule).where(FetchSchedule.id == schedule_id))
    schedule = result.scalars().first()
    if not schedule:
        raise APIError(404, "not_found", _SCHEDULE_NOT_FOUND)
    await db.delete(schedule)
    await db.commit()
    return {"deleted": schedule_id}


@router.post("/schedules/{schedule_id}/toggle", response_model=FetchScheduleResponse)
@limiter.limit("10/minute")
async def toggle_schedule(
    request: Request,
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
):
    logger.info("Toggling schedule: id=%s", schedule_id)
    result = await db.execute(
        select(FetchSchedule).options(selectinload(FetchSchedule.preset)).where(FetchSchedule.id == schedule_id)
    )
    schedule = result.scalars().first()
    if not schedule:
        raise APIError(404, "not_found", _SCHEDULE_NOT_FOUND)

    schedule.is_active = not schedule.is_active
    if schedule.is_active:
        schedule.next_run_at = utcnow() + timedelta(minutes=schedule.interval_minutes)
    else:
        schedule.next_run_at = None

    await db.commit()
    await db.refresh(schedule)
    return await _schedule_response(db, schedule)


async def _schedule_response(db: AsyncSession, schedule: FetchSchedule) -> FetchScheduleResponse:
    """Build response with preset loaded."""
    # Re-query with eager loading to avoid lazy load issues
    result = await db.execute(
        select(FetchSchedule)
        .options(selectinload(FetchSchedule.preset))
        .where(FetchSchedule.id == schedule.id)
    )
    schedule = result.scalars().first()
    return FetchScheduleResponse.model_validate(schedule)
