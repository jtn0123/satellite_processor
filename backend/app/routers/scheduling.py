"""Routers for fetch presets, schedules, and cleanup rules."""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Body, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db.database import get_db
from ..db.models import (
    CleanupRule,
    CollectionFrame,
    FetchPreset,
    FetchSchedule,
    GoesFrame,
    Job,
)
from ..errors import APIError
from ..models.scheduling import (
    CleanupPreviewResponse,
    CleanupRuleCreate,
    CleanupRuleResponse,
    CleanupRuleUpdate,
    CleanupRunResponse,
    FetchPresetCreate,
    FetchPresetResponse,
    FetchPresetUpdate,
    FetchScheduleCreate,
    FetchScheduleResponse,
    FetchScheduleUpdate,
)

router = APIRouter(prefix="/api/goes", tags=["scheduling"])


# ── Fetch Presets ─────────────────────────────────────────

@router.post("/fetch-presets", response_model=FetchPresetResponse)
async def create_fetch_preset(
    payload: FetchPresetCreate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    preset = FetchPreset(
        id=str(uuid.uuid4()),
        name=payload.name,
        satellite=payload.satellite,
        sector=payload.sector,
        band=payload.band,
        description=payload.description,
    )
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    return FetchPresetResponse.model_validate(preset)


@router.get("/fetch-presets", response_model=list[FetchPresetResponse])
async def list_fetch_presets(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FetchPreset).order_by(FetchPreset.created_at.desc()))
    return [FetchPresetResponse.model_validate(p) for p in result.scalars().all()]


@router.put("/fetch-presets/{preset_id}", response_model=FetchPresetResponse)
async def update_fetch_preset(
    preset_id: str,
    payload: FetchPresetUpdate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(FetchPreset).where(FetchPreset.id == preset_id))
    preset = result.scalars().first()
    if not preset:
        raise APIError(404, "not_found", "Fetch preset not found")
    for field in ("name", "satellite", "sector", "band", "description"):
        val = getattr(payload, field)
        if val is not None:
            setattr(preset, field, val)
    await db.commit()
    await db.refresh(preset)
    return FetchPresetResponse.model_validate(preset)


@router.delete("/fetch-presets/{preset_id}")
async def delete_fetch_preset(
    preset_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(FetchPreset).where(FetchPreset.id == preset_id))
    preset = result.scalars().first()
    if not preset:
        raise APIError(404, "not_found", "Fetch preset not found")
    await db.delete(preset)
    await db.commit()
    return {"deleted": preset_id}


@router.post("/fetch-presets/{preset_id}/run")
async def run_fetch_preset(
    preset_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Execute a preset immediately (fetches last 1 hour of data)."""
    result = await db.execute(select(FetchPreset).where(FetchPreset.id == preset_id))
    preset = result.scalars().first()
    if not preset:
        raise APIError(404, "not_found", "Fetch preset not found")

    now = datetime.now(UTC)
    job_id = str(uuid.uuid4())
    job = Job(
        id=job_id,
        status="pending",
        job_type="goes_fetch",
        params={
            "satellite": preset.satellite,
            "sector": preset.sector,
            "band": preset.band,
            "start_time": (now - timedelta(hours=1)).isoformat(),
            "end_time": now.isoformat(),
            "preset_id": preset.id,
        },
    )
    db.add(job)
    await db.commit()

    from ..tasks.goes_tasks import fetch_goes_data

    fetch_goes_data.delay(job_id, job.params)
    return {"job_id": job_id, "status": "pending", "preset": preset.name}


# ── Schedules ─────────────────────────────────────────────

@router.post("/schedules", response_model=FetchScheduleResponse)
async def create_schedule(
    payload: FetchScheduleCreate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    # Verify preset exists
    result = await db.execute(select(FetchPreset).where(FetchPreset.id == payload.preset_id))
    if not result.scalars().first():
        raise APIError(404, "not_found", "Fetch preset not found")

    now = datetime.now(UTC)
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
async def list_schedules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(FetchSchedule)
        .options(selectinload(FetchSchedule.preset))
        .order_by(FetchSchedule.created_at.desc())
    )
    schedules = result.scalars().all()
    return [FetchScheduleResponse.model_validate(s) for s in schedules]


@router.put("/schedules/{schedule_id}", response_model=FetchScheduleResponse)
async def update_schedule(
    schedule_id: str,
    payload: FetchScheduleUpdate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FetchSchedule).options(selectinload(FetchSchedule.preset)).where(FetchSchedule.id == schedule_id)
    )
    schedule = result.scalars().first()
    if not schedule:
        raise APIError(404, "not_found", "Schedule not found")

    if payload.preset_id is not None:
        p = await db.execute(select(FetchPreset).where(FetchPreset.id == payload.preset_id))
        if not p.scalars().first():
            raise APIError(404, "not_found", "Fetch preset not found")
        schedule.preset_id = payload.preset_id

    for field in ("name", "interval_minutes", "is_active"):
        val = getattr(payload, field)
        if val is not None:
            setattr(schedule, field, val)

    # Recompute next_run_at if toggled active
    if schedule.is_active and schedule.next_run_at is None:
        schedule.next_run_at = datetime.now(UTC) + timedelta(minutes=schedule.interval_minutes)
    elif not schedule.is_active:
        schedule.next_run_at = None

    await db.commit()
    await db.refresh(schedule)
    return await _schedule_response(db, schedule)


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(FetchSchedule).where(FetchSchedule.id == schedule_id))
    schedule = result.scalars().first()
    if not schedule:
        raise APIError(404, "not_found", "Schedule not found")
    await db.delete(schedule)
    await db.commit()
    return {"deleted": schedule_id}


@router.post("/schedules/{schedule_id}/toggle", response_model=FetchScheduleResponse)
async def toggle_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FetchSchedule).options(selectinload(FetchSchedule.preset)).where(FetchSchedule.id == schedule_id)
    )
    schedule = result.scalars().first()
    if not schedule:
        raise APIError(404, "not_found", "Schedule not found")

    schedule.is_active = not schedule.is_active
    if schedule.is_active:
        schedule.next_run_at = datetime.now(UTC) + timedelta(minutes=schedule.interval_minutes)
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


# ── Cleanup Rules ─────────────────────────────────────────

@router.post("/cleanup-rules", response_model=CleanupRuleResponse)
async def create_cleanup_rule(
    payload: CleanupRuleCreate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    rule = CleanupRule(
        id=str(uuid.uuid4()),
        name=payload.name,
        rule_type=payload.rule_type,
        value=payload.value,
        protect_collections=payload.protect_collections,
        is_active=payload.is_active,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return CleanupRuleResponse.model_validate(rule)


@router.get("/cleanup-rules", response_model=list[CleanupRuleResponse])
async def list_cleanup_rules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CleanupRule).order_by(CleanupRule.created_at.desc()))
    return [CleanupRuleResponse.model_validate(r) for r in result.scalars().all()]


@router.put("/cleanup-rules/{rule_id}", response_model=CleanupRuleResponse)
async def update_cleanup_rule(
    rule_id: str,
    payload: CleanupRuleUpdate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CleanupRule).where(CleanupRule.id == rule_id))
    rule = result.scalars().first()
    if not rule:
        raise APIError(404, "not_found", "Cleanup rule not found")
    for field in ("name", "rule_type", "value", "protect_collections", "is_active"):
        val = getattr(payload, field)
        if val is not None:
            setattr(rule, field, val)
    await db.commit()
    await db.refresh(rule)
    return CleanupRuleResponse.model_validate(rule)


@router.delete("/cleanup-rules/{rule_id}")
async def delete_cleanup_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CleanupRule).where(CleanupRule.id == rule_id))
    rule = result.scalars().first()
    if not rule:
        raise APIError(404, "not_found", "Cleanup rule not found")
    await db.delete(rule)
    await db.commit()
    return {"deleted": rule_id}


@router.get("/cleanup/preview", response_model=CleanupPreviewResponse)
async def preview_cleanup(db: AsyncSession = Depends(get_db)):
    """Dry-run: show what would be deleted by active cleanup rules."""
    frames_to_delete = await _get_frames_to_cleanup(db)
    total_size = sum(f.file_size or 0 for f in frames_to_delete)
    return CleanupPreviewResponse(
        frame_count=len(frames_to_delete),
        total_size_bytes=total_size,
        frames=[
            {"id": f.id, "file_path": f.file_path, "file_size": f.file_size, "capture_time": f.capture_time.isoformat() if f.capture_time else None}
            for f in frames_to_delete[:100]  # Limit preview to 100
        ],
    )


@router.post("/cleanup/run", response_model=CleanupRunResponse)
async def run_cleanup_now(db: AsyncSession = Depends(get_db)):
    """Manually trigger cleanup."""
    frames_to_delete = await _get_frames_to_cleanup(db)
    freed = 0
    for frame in frames_to_delete:
        for path in [frame.file_path, frame.thumbnail_path]:
            if path:
                try:
                    os.remove(path)
                except OSError:
                    pass
        freed += frame.file_size or 0
        await db.delete(frame)
    await db.commit()
    return CleanupRunResponse(deleted_frames=len(frames_to_delete), freed_bytes=freed)


async def _get_frames_to_cleanup(db: AsyncSession) -> list[GoesFrame]:
    """Compute which frames should be cleaned up based on active rules."""
    result = await db.execute(select(CleanupRule).where(CleanupRule.is_active == True))  # noqa: E712
    rules = result.scalars().all()
    if not rules:
        return []

    delete_ids: set[str] = set()

    for rule in rules:
        # Get IDs of frames in collections (for protection)
        protected_ids: set[str] = set()
        if rule.protect_collections:
            prot = await db.execute(select(CollectionFrame.frame_id))
            protected_ids = {r[0] for r in prot.all()}

        if rule.rule_type == "max_age_days":
            cutoff = datetime.now(UTC) - timedelta(days=rule.value)
            q = select(GoesFrame).where(GoesFrame.created_at < cutoff)
            res = await db.execute(q)
            for frame in res.scalars().all():
                if frame.id not in protected_ids:
                    delete_ids.add(frame.id)

        elif rule.rule_type == "max_storage_gb":
            # Get total storage
            total_result = await db.execute(select(func.coalesce(func.sum(GoesFrame.file_size), 0)))
            total_bytes = total_result.scalar() or 0
            max_bytes = rule.value * 1024 * 1024 * 1024

            if total_bytes > max_bytes:
                # Get oldest frames first
                q = select(GoesFrame).order_by(GoesFrame.created_at.asc())
                res = await db.execute(q)
                excess = total_bytes - max_bytes
                freed = 0
                for frame in res.scalars().all():
                    if freed >= excess:
                        break
                    if frame.id not in protected_ids:
                        delete_ids.add(frame.id)
                        freed += frame.file_size or 0

    if not delete_ids:
        return []

    result = await db.execute(select(GoesFrame).where(GoesFrame.id.in_(delete_ids)))
    return list(result.scalars().all())
