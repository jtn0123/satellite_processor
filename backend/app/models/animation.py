"""Pydantic schemas for crop presets and animation studio endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# --- Crop Preset schemas ---


class CropPresetCreate(BaseModel):
    """Request schema for creating a crop preset with name and region coordinates."""

    name: str = Field(..., min_length=1, max_length=200)
    x: int = Field(..., ge=0)
    y: int = Field(..., ge=0)
    width: int = Field(..., gt=0)
    height: int = Field(..., gt=0)


class CropPresetUpdate(BaseModel):
    """Request schema for updating a crop preset. All fields are optional."""

    name: str | None = None
    x: int | None = Field(None, ge=0)
    y: int | None = Field(None, ge=0)
    width: int | None = Field(None, gt=0)
    height: int | None = Field(None, gt=0)


class CropPresetResponse(BaseModel):
    """Response schema for a crop preset with coordinates and metadata."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    x: int
    y: int
    width: int
    height: int
    created_at: datetime | None = None


# --- Animation schemas ---


class AnimationCreate(BaseModel):
    """Request schema for creating an animation from selected frames or filters."""

    name: str = Field("Untitled Animation", min_length=1, max_length=200)
    frame_ids: list[str] | None = None
    # Filter-based frame selection (alternative to frame_ids)
    satellite: str | None = None
    band: str | None = None
    sector: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    collection_id: str | None = None
    # Settings
    fps: int = Field(10, ge=1, le=30)
    format: str = Field("mp4", pattern="^(mp4|gif)$")
    quality: str = Field("medium", pattern="^(low|medium|high)$")
    crop_preset_id: str | None = None
    false_color: bool = False
    scale: str = "100%"


class AnimationResponse(BaseModel):
    """Response schema for an animation with status, output path, and metadata."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    status: str
    frame_count: int
    fps: int
    format: str
    quality: str
    crop_preset_id: str | None = None
    false_color: bool = False
    scale: str = "100%"
    output_path: str | None = None
    file_size: int = 0
    duration_seconds: int = 0
    created_at: datetime | None = None
    completed_at: datetime | None = None
    error: str = ""
    job_id: str | None = None
