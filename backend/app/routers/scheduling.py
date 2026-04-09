"""Routers for fetch presets, schedules, and cleanup rules."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Body
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db.database import DbSession
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
from ..utils import safe_remove, sanitize_log, utcnow
from .scheduling_presets import DEFAULT_FETCH_PRESETS

logger = logging.getLogger(__name__)

_FETCH_PRESET_NOT_FOUND = "Fetch preset not found"
_SCHEDULE_NOT_FOUND = "Schedule not found"

router = APIRouter(prefix="/api/satellite", tags=["scheduling"])


# ── Seed Defaults ─────────────────────────────────────────


@router.post("/fetch-presets/seed-defaults")
async def seed_default_presets(db: DbSession) -> dict[str, Any]:
    """Create default fetch presets if they don't already exist."""
    logger.info("Seeding default fetch presets")
    created = []
    for preset_def in DEFAULT_FETCH_PRESETS:
        result = await db.execute(select(FetchPreset).where(FetchPreset.name == preset_def["name"]))
        if result.scalars().first():
            continue
        preset = FetchPreset(
            id=str(uuid.uuid4()),
            name=preset_def["name"],
            satellite=preset_def["satellite"],
            sector=preset_def["sector"],
            band=preset_def["band"],
            description=preset_def["description"],
        )
        db.add(preset)
        created.append(preset_def["name"])
    if created:
        await db.commit()
    return {"seeded": created, "total": len(created)}


# ── Fetch Presets ─────────────────────────────────────────


async def _get_preset_last_fetch_map(db: AsyncSession, preset_ids: list[str]) -> dict[str, datetime | None]:
    """Return {preset_id: most_recent_completed_at} for the given presets.

    JTN-421 ISSUE-031: the fetch-preset row has no ``last_fetch_time``
    column, so we derive it from the jobs table by looking at the most
    recent completed ``goes_fetch`` job whose ``params.preset_id`` matches.
    This is best-effort: we pull ``completed_at`` from recent goes_fetch
    jobs (capped, one query) and fold them down to a map.
    """
    if not preset_ids:
        return {}
    # Limit how many jobs we scan — we only need the most recent per preset.
    # 500 rows covers the common case (8 presets × dozens of runs each).
    result = await db.execute(
        select(Job.params, Job.completed_at)
        .where(Job.job_type == "goes_fetch")
        .where(Job.status.in_(("completed", "completed_partial")))
        .where(Job.completed_at.is_not(None))
        .order_by(Job.completed_at.desc())
        .limit(500)
    )
    out: dict[str, datetime | None] = dict.fromkeys(preset_ids)
    wanted = set(preset_ids)
    for params, completed_at in result.all():
        if not isinstance(params, dict):
            continue
        pid = params.get("preset_id")
        if pid in wanted and out.get(pid) is None:
            out[pid] = completed_at
            wanted.discard(pid)
            if not wanted:
                break
    return out


def _build_preset_response(preset: FetchPreset, last_fetch_time: datetime | None) -> FetchPresetResponse:
    resp = FetchPresetResponse.model_validate(preset)
    resp.last_fetch_time = last_fetch_time
    return resp


@router.post("/fetch-presets")
async def create_fetch_preset(
    payload: Annotated[FetchPresetCreate, Body()],
    db: DbSession,
) -> FetchPresetResponse:
    logger.info("Creating fetch preset")
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
    return _build_preset_response(preset, None)


@router.get("/fetch-presets")
async def list_fetch_presets(db: DbSession) -> list[FetchPresetResponse]:
    logger.debug("Listing fetch presets")
    result = await db.execute(select(FetchPreset).order_by(FetchPreset.created_at.desc()))
    presets = list(result.scalars().all())
    last_fetch_map = await _get_preset_last_fetch_map(db, [p.id for p in presets])
    return [_build_preset_response(p, last_fetch_map.get(p.id)) for p in presets]


@router.put("/fetch-presets/{preset_id}")
async def update_fetch_preset(
    preset_id: str,
    payload: Annotated[FetchPresetUpdate, Body()],
    db: DbSession,
) -> FetchPresetResponse:
    logger.info("Updating fetch preset: id=%s", sanitize_log(preset_id))
    result = await db.execute(select(FetchPreset).where(FetchPreset.id == preset_id))
    preset = result.scalars().first()
    if not preset:
        raise APIError(404, "not_found", _FETCH_PRESET_NOT_FOUND)
    for field in ("name", "satellite", "sector", "band", "description"):
        val = getattr(payload, field)
        if val is not None:
            setattr(preset, field, val)
    await db.commit()
    await db.refresh(preset)
    last_fetch_map = await _get_preset_last_fetch_map(db, [preset.id])
    return _build_preset_response(preset, last_fetch_map.get(preset.id))


@router.delete("/fetch-presets/{preset_id}")
async def delete_fetch_preset(
    preset_id: str,
    db: DbSession,
) -> dict[str, Any]:
    logger.info("Deleting fetch preset: id=%s", sanitize_log(preset_id))
    result = await db.execute(select(FetchPreset).where(FetchPreset.id == preset_id))
    preset = result.scalars().first()
    if not preset:
        raise APIError(404, "not_found", _FETCH_PRESET_NOT_FOUND)
    await db.delete(preset)
    await db.commit()
    return {"deleted": preset_id}


@router.post("/fetch-presets/{preset_id}/run")
async def run_fetch_preset(
    preset_id: str,
    db: DbSession,
) -> dict[str, Any]:
    """Execute a preset immediately (fetches last 1 hour of data).

    JTN-460: Uses ``datetime.now(timezone.utc)`` consistently so that comparing
    tz-aware DB timestamps (e.g. ``last_fetch_time``) with the in-request ``now``
    can never raise ``TypeError: can't compare offset-naive and offset-aware
    datetimes``. The naive form stored in the DB is derived from the same
    moment so the two representations stay in sync.
    """
    result = await db.execute(select(FetchPreset).where(FetchPreset.id == preset_id))
    preset = result.scalars().first()
    if not preset:
        raise APIError(404, "not_found", _FETCH_PRESET_NOT_FOUND)

    # Tz-aware "now" is used for any cross-boundary comparison (e.g. against
    # aware timestamps loaded from Postgres TIMESTAMP WITH TIME ZONE columns)
    # and the ISO strings stored in Job.params. The downstream fetch task
    # parses these back with ``datetime.fromisoformat`` and will receive
    # tz-aware values, matching S3 metadata comparisons.
    now_aware = datetime.now(UTC)
    start_aware = now_aware - timedelta(hours=1)

    job_id = str(uuid.uuid4())
    job = Job(
        id=job_id,
        status="pending",
        job_type="goes_fetch",
        params={
            "satellite": preset.satellite,
            "sector": preset.sector,
            "band": preset.band,
            "start_time": start_aware.isoformat(),
            "end_time": now_aware.isoformat(),
            "preset_id": preset.id,
        },
    )
    db.add(job)
    await db.commit()

    # Dispatch to the correct task based on satellite type
    from ..services.satellite_registry import SATELLITE_REGISTRY

    sat_config = SATELLITE_REGISTRY.get(preset.satellite)
    if sat_config and sat_config.format == "hsd":
        if preset.band == "TrueColor":
            from ..tasks.himawari_fetch_task import fetch_himawari_true_color

            fetch_himawari_true_color.delay(job_id, job.params)
        else:
            from ..tasks.himawari_fetch_task import fetch_himawari_data

            fetch_himawari_data.delay(job_id, job.params)
    else:
        from ..tasks.fetch_task import fetch_goes_data

        fetch_goes_data.delay(job_id, job.params)

    return {"job_id": job_id, "status": "pending", "preset": preset.name}


# ── Schedules ─────────────────────────────────────────────


@router.post("/schedules")
async def create_schedule(
    payload: Annotated[FetchScheduleCreate, Body()],
    db: DbSession,
) -> FetchScheduleResponse:
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


@router.get("/schedules")
async def list_schedules(db: DbSession) -> list[FetchScheduleResponse]:
    logger.debug("Listing schedules")
    result = await db.execute(
        select(FetchSchedule).options(selectinload(FetchSchedule.preset)).order_by(FetchSchedule.created_at.desc())
    )
    schedules = result.scalars().all()
    return [FetchScheduleResponse.model_validate(s) for s in schedules]


@router.put("/schedules/{schedule_id}")
async def update_schedule(
    schedule_id: str,
    payload: Annotated[FetchScheduleUpdate, Body()],
    db: DbSession,
) -> FetchScheduleResponse:
    logger.info("Updating schedule: id=%s", sanitize_log(schedule_id))
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
async def delete_schedule(
    schedule_id: str,
    db: DbSession,
) -> dict[str, Any]:
    logger.info("Deleting schedule: id=%s", sanitize_log(schedule_id))
    result = await db.execute(select(FetchSchedule).where(FetchSchedule.id == schedule_id))
    schedule = result.scalars().first()
    if not schedule:
        raise APIError(404, "not_found", _SCHEDULE_NOT_FOUND)
    await db.delete(schedule)
    await db.commit()
    return {"deleted": schedule_id}


@router.post("/schedules/{schedule_id}/toggle")
async def toggle_schedule(
    schedule_id: str,
    db: DbSession,
) -> FetchScheduleResponse:
    logger.info("Toggling schedule: id=%s", sanitize_log(schedule_id))
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
        select(FetchSchedule).options(selectinload(FetchSchedule.preset)).where(FetchSchedule.id == schedule.id)
    )
    schedule = result.scalars().first()
    return FetchScheduleResponse.model_validate(schedule)


# ── Cleanup Rules ─────────────────────────────────────────


@router.post("/cleanup-rules")
async def create_cleanup_rule(
    payload: Annotated[CleanupRuleCreate, Body()],
    db: DbSession,
) -> CleanupRuleResponse:
    logger.info("Creating cleanup rule")
    rule = CleanupRule(
        id=str(uuid.uuid4()),
        name=payload.name,
        rule_type=payload.rule_type,
        value=payload.value,
        satellite=payload.satellite,
        protect_collections=payload.protect_collections,
        is_active=payload.is_active,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return CleanupRuleResponse.model_validate(rule)


@router.get("/cleanup-rules")
async def list_cleanup_rules(db: DbSession) -> list[CleanupRuleResponse]:
    logger.debug("Listing cleanup rules")
    result = await db.execute(select(CleanupRule).order_by(CleanupRule.created_at.desc()))
    return [CleanupRuleResponse.model_validate(r) for r in result.scalars().all()]


@router.put("/cleanup-rules/{rule_id}")
async def update_cleanup_rule(
    rule_id: str,
    payload: Annotated[CleanupRuleUpdate, Body()],
    db: DbSession,
) -> CleanupRuleResponse:
    logger.info("Updating cleanup rule: id=%s", sanitize_log(rule_id))
    result = await db.execute(select(CleanupRule).where(CleanupRule.id == rule_id))
    rule = result.scalars().first()
    if not rule:
        raise APIError(404, "not_found", "Cleanup rule not found")
    for field in ("name", "rule_type", "value", "satellite", "protect_collections", "is_active"):
        val = getattr(payload, field)
        if val is not None:
            setattr(rule, field, val)
    await db.commit()
    await db.refresh(rule)
    return CleanupRuleResponse.model_validate(rule)


@router.delete("/cleanup-rules/{rule_id}")
async def delete_cleanup_rule(
    rule_id: str,
    db: DbSession,
) -> dict[str, Any]:
    logger.info("Deleting cleanup rule: id=%s", sanitize_log(rule_id))
    result = await db.execute(select(CleanupRule).where(CleanupRule.id == rule_id))
    rule = result.scalars().first()
    if not rule:
        raise APIError(404, "not_found", "Cleanup rule not found")
    await db.delete(rule)
    await db.commit()
    return {"deleted": rule_id}


@router.get("/cleanup/stats")
async def cleanup_storage_stats(db: DbSession) -> dict[str, Any]:
    """Per-satellite storage breakdown for the cleanup dashboard."""
    logger.debug("Cleanup storage stats requested")
    rows = (
        await db.execute(
            select(
                GoesFrame.satellite,
                GoesFrame.sector,
                func.count(GoesFrame.id).label("count"),
                func.coalesce(func.sum(GoesFrame.file_size), 0).label("size"),
                func.min(GoesFrame.capture_time).label("oldest"),
                func.max(GoesFrame.capture_time).label("newest"),
            ).group_by(GoesFrame.satellite, GoesFrame.sector)
        )
    ).all()

    satellites: dict[str, Any] = {}
    total_frames = 0
    total_size = 0

    for sat, sector, count, size, oldest, newest in rows:
        total_frames += count
        total_size += size
        if sat not in satellites:
            satellites[sat] = {"total_frames": 0, "total_size": 0, "sectors": {}}
        satellites[sat]["total_frames"] += count
        satellites[sat]["total_size"] += size
        satellites[sat]["sectors"][sector] = {
            "count": count,
            "size": size,
            "oldest": oldest.isoformat() if oldest else None,
            "newest": newest.isoformat() if newest else None,
        }

    return {
        "total_frames": total_frames,
        "total_size": total_size,
        "satellites": satellites,
    }


@router.get("/cleanup/preview")
async def preview_cleanup(db: DbSession) -> CleanupPreviewResponse:
    """Dry-run: show what would be deleted by active cleanup rules."""
    logger.info("Preview cleanup requested")
    frames_to_delete = await _get_frames_to_cleanup(db)
    total_size = sum(f.file_size or 0 for f in frames_to_delete)
    return CleanupPreviewResponse(
        frame_count=len(frames_to_delete),
        total_size_bytes=total_size,
        frames=[
            {
                "id": f.id,
                "file_path": f.file_path,
                "file_size": f.file_size,
                "capture_time": f.capture_time.isoformat() if f.capture_time else None,
            }
            for f in frames_to_delete[:100]  # Limit preview to 100
        ],
    )


@router.post("/cleanup/run")
async def run_cleanup_now(db: DbSession) -> CleanupRunResponse:
    """Manually trigger cleanup."""
    frames_to_delete = await _get_frames_to_cleanup(db)
    freed = 0
    for frame in frames_to_delete:
        for path in [frame.file_path, frame.thumbnail_path]:
            if path:
                safe_remove(path)
        freed += frame.file_size or 0
        await db.delete(frame)
    await db.commit()
    return CleanupRunResponse(deleted_frames=len(frames_to_delete), freed_bytes=freed)


async def _get_protected_ids(db: AsyncSession, protect_collections: bool) -> set[str]:
    """Return IDs of frames in collections if protection is enabled."""
    if not protect_collections:
        return set()
    prot = await db.execute(select(CollectionFrame.frame_id))
    return {r[0] for r in prot.all()}


async def _collect_age_deletions(db: AsyncSession, rule: CleanupRule, protected_ids: set[str]) -> set[str]:
    """Find frame IDs older than max age that are not protected."""
    cutoff = utcnow() - timedelta(days=rule.value)
    # Bug #10: Select only IDs instead of full objects to avoid OOM
    query = select(GoesFrame.id).where(GoesFrame.created_at < cutoff)
    if rule.satellite:
        query = query.where(GoesFrame.satellite == rule.satellite)
    if protected_ids:
        query = query.where(GoesFrame.id.notin_(protected_ids))
    res = await db.execute(query)
    return {r[0] for r in res.all()}


async def _collect_storage_deletions(db: AsyncSession, rule: CleanupRule, protected_ids: set[str]) -> set[str]:
    """Find oldest frame IDs to delete to bring storage under the limit."""
    size_query = select(func.coalesce(func.sum(GoesFrame.file_size), 0))
    if rule.satellite:
        size_query = size_query.where(GoesFrame.satellite == rule.satellite)
    total_result = await db.execute(size_query)
    total_bytes = total_result.scalar() or 0
    max_bytes = rule.value * 1024 * 1024 * 1024

    if total_bytes <= max_bytes:
        return set()

    # Bug #10: Select only ID and file_size columns instead of full objects.
    # Iterate without .all() to avoid creating a second copy of all rows.
    query = select(GoesFrame.id, GoesFrame.file_size).order_by(GoesFrame.created_at.asc())
    if rule.satellite:
        query = query.where(GoesFrame.satellite == rule.satellite)
    if protected_ids:
        query = query.where(GoesFrame.id.notin_(protected_ids))
    result = await db.execute(query)
    excess = total_bytes - max_bytes
    freed = 0
    ids: set[str] = set()
    for frame_id, file_size in result:
        if freed >= excess:
            break
        ids.add(frame_id)
        freed += file_size or 0
    return ids


async def _get_frames_to_cleanup(db: AsyncSession) -> list[GoesFrame]:
    """Compute which frames should be cleaned up based on active rules."""
    result = await db.execute(select(CleanupRule).where(CleanupRule.is_active == True))  # noqa: E712
    rules = result.scalars().all()
    if not rules:
        return []

    delete_ids: set[str] = set()

    for rule in rules:
        protected_ids = await _get_protected_ids(db, rule.protect_collections)

        if rule.rule_type == "max_age_days":
            delete_ids |= await _collect_age_deletions(db, rule, protected_ids)
        elif rule.rule_type == "max_storage_gb":
            delete_ids |= await _collect_storage_deletions(db, rule, protected_ids)

    if not delete_ids:
        return []

    result = await db.execute(select(GoesFrame).where(GoesFrame.id.in_(delete_ids)))
    return list(result.scalars().all())
