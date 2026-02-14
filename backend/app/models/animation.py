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


# --- Overlay schema ---


class OverlaySettings(BaseModel):
    """Settings for text overlay on animation frames."""

    timestamp: bool = False
    label: bool = False
    colorbar: bool = False


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
    resolution: str = Field("full", pattern="^(preview|full)$")
    loop_style: str = Field("forward", pattern="^(forward|pingpong|hold)$")
    overlay: OverlaySettings | None = None
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
    resolution: str = "full"
    loop_style: str = "forward"
    overlay: dict | None = None
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


# --- Animation from range ---


class AnimationFromRange(BaseModel):
    """Create animation from a time range query."""

    satellite: str
    sector: str
    band: str
    start_time: datetime
    end_time: datetime
    fps: int = Field(10, ge=1, le=30)
    format: str = Field("mp4", pattern="^(mp4|gif)$")
    quality: str = Field("medium", pattern="^(low|medium|high)$")
    resolution: str = Field("full", pattern="^(preview|full)$")
    loop_style: str = Field("forward", pattern="^(forward|pingpong|hold)$")
    overlay: OverlaySettings | None = None


class AnimationRecent(BaseModel):
    """Create animation from recent N hours."""

    satellite: str
    sector: str
    band: str
    hours: int = Field(6, ge=1, le=72)
    fps: int = Field(10, ge=1, le=30)
    format: str = Field("mp4", pattern="^(mp4|gif)$")
    quality: str = Field("medium", pattern="^(low|medium|high)$")
    resolution: str = Field("full", pattern="^(preview|full)$")
    loop_style: str = Field("forward", pattern="^(forward|pingpong|hold)$")
    overlay: OverlaySettings | None = None


class BatchAnimationItem(BaseModel):
    """Single item in a batch animation request."""

    satellite: str
    sector: str
    band: str
    start_time: datetime
    end_time: datetime
    fps: int = Field(10, ge=1, le=30)
    format: str = Field("mp4", pattern="^(mp4|gif)$")
    quality: str = Field("medium", pattern="^(low|medium|high)$")
    resolution: str = Field("full", pattern="^(preview|full)$")
    loop_style: str = Field("forward", pattern="^(forward|pingpong|hold)$")
    overlay: OverlaySettings | None = None


class BatchAnimationRequest(BaseModel):
    """Batch animation creation request."""

    animations: list[BatchAnimationItem] = Field(..., min_length=1, max_length=10)


# --- Frame range preview ---


class FrameRangePreview(BaseModel):
    """Preview of frames in a time range."""

    total_frames: int
    first: dict | None = None
    middle: dict | None = None
    last: dict | None = None
    first_thumbnail: str | None = None
    middle_thumbnail: str | None = None
    last_thumbnail: str | None = None


# --- Animation Preset schemas ---


class AnimationPresetCreate(BaseModel):
    """Request schema for creating an animation preset."""

    name: str = Field(..., min_length=1, max_length=200)
    satellite: str | None = None
    sector: str | None = None
    band: str | None = None
    fps: int = Field(10, ge=1, le=30)
    format: str = Field("mp4", pattern="^(mp4|gif)$")
    quality: str = Field("medium", pattern="^(low|medium|high)$")
    resolution: str = Field("full", pattern="^(preview|full)$")
    loop_style: str = Field("forward", pattern="^(forward|pingpong|hold)$")


class AnimationPresetUpdate(BaseModel):
    """Request schema for updating an animation preset."""

    name: str | None = None
    satellite: str | None = None
    sector: str | None = None
    band: str | None = None
    fps: int | None = Field(None, ge=1, le=30)
    format: str | None = None
    quality: str | None = None
    resolution: str | None = None
    loop_style: str | None = None


class AnimationPresetResponse(BaseModel):
    """Response schema for an animation preset."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    satellite: str | None = None
    sector: str | None = None
    band: str | None = None
    fps: int = 10
    format: str = "mp4"
    quality: str = "medium"
    resolution: str = "full"
    loop_style: str = "forward"
    created_at: datetime | None = None
