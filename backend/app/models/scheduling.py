"""Pydantic schemas for fetch presets, schedules, and cleanup rules."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# --- Fetch Preset schemas ---

class FetchPresetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    satellite: str = Field(..., min_length=1, max_length=20)
    sector: str = Field(..., min_length=1, max_length=20)
    band: str = Field(..., min_length=1, max_length=10)
    description: str = ""


class FetchPresetUpdate(BaseModel):
    name: str | None = None
    satellite: str | None = None
    sector: str | None = None
    band: str | None = None
    description: str | None = None


class FetchPresetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    satellite: str
    sector: str
    band: str
    description: str
    created_at: datetime | None = None


# --- Fetch Schedule schemas ---

class FetchScheduleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    preset_id: str
    interval_minutes: int = Field(..., ge=1)
    is_active: bool = False


class FetchScheduleUpdate(BaseModel):
    name: str | None = None
    preset_id: str | None = None
    interval_minutes: int | None = Field(None, ge=1)
    is_active: bool | None = None


class FetchScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    preset_id: str
    interval_minutes: int
    is_active: bool
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    preset: FetchPresetResponse | None = None


# --- Cleanup Rule schemas ---

class CleanupRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    rule_type: str = Field(..., pattern="^(max_age_days|max_storage_gb)$")
    value: float = Field(..., gt=0)
    protect_collections: bool = True
    is_active: bool = True


class CleanupRuleUpdate(BaseModel):
    name: str | None = None
    rule_type: str | None = Field(None, pattern="^(max_age_days|max_storage_gb)$")
    value: float | None = Field(None, gt=0)
    protect_collections: bool | None = None
    is_active: bool | None = None


class CleanupRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    rule_type: str
    value: float
    protect_collections: bool
    is_active: bool
    created_at: datetime | None = None


class CleanupPreviewResponse(BaseModel):
    frame_count: int
    total_size_bytes: int
    frames: list[dict] = []


class CleanupRunResponse(BaseModel):
    deleted_frames: int
    freed_bytes: int
