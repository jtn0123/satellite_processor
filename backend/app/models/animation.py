"""Pydantic schemas for crop presets and animation studio endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..services.satellite_registry import SATELLITE_REGISTRY


def _validate_satellite_sector_band(
    satellite: str | None,
    sector: str | None,
    band: str | None = None,
) -> None:
    """Validate the (satellite, sector, band) triple when present.

    All three fields are optional on some animation schemas; we only validate
    what's set. Raises ``ValueError`` so Pydantic surfaces a 422 instead of
    a generic 500 when the user selects e.g. GOES-19 + FLDK (JTN-426).
    """
    if not satellite:
        return
    cfg = SATELLITE_REGISTRY.get(satellite)
    if cfg is None:
        raise ValueError(f"Unknown satellite: {satellite}")
    if sector and sector not in cfg.sectors:
        raise ValueError(f"Sector {sector!r} is not valid for {satellite}. Valid sectors: {sorted(cfg.sectors)}")
    if band and band not in cfg.bands:
        raise ValueError(f"Band {band!r} is not valid for {satellite}. Valid bands: {sorted(cfg.bands)}")


# Shared regex patterns for animation settings
PATTERN_FORMAT = r"^(mp4|gif)$"
PATTERN_QUALITY = r"^(low|medium|high)$"
PATTERN_RESOLUTION = r"^(preview|full)$"
PATTERN_LOOP_STYLE = r"^(forward|pingpong|hold)$"
PATTERN_SCALE = r"^[1-9]\d{0,2}%$"

# --- Crop Preset schemas ---


# GOES full-disk at native 0.5 km resolution is ~21696×21696. Cap at 32 000 px
# on any axis so callers can't submit absurd 999_999_999 values and overflow
# downstream math (JTN-474 ISSUE-069).
_CROP_MAX_AXIS = 32_000


class CropPresetCreate(BaseModel):
    """Request schema for creating a crop preset with name and region coordinates."""

    name: str = Field(..., min_length=1, max_length=200)
    x: int = Field(..., ge=0, le=_CROP_MAX_AXIS)
    y: int = Field(..., ge=0, le=_CROP_MAX_AXIS)
    width: int = Field(..., gt=0, le=_CROP_MAX_AXIS)
    height: int = Field(..., gt=0, le=_CROP_MAX_AXIS)


class CropPresetUpdate(BaseModel):
    """Request schema for updating a crop preset. All fields are optional."""

    name: str | None = None
    x: int | None = Field(None, ge=0, le=_CROP_MAX_AXIS)
    y: int | None = Field(None, ge=0, le=_CROP_MAX_AXIS)
    width: int | None = Field(None, gt=0, le=_CROP_MAX_AXIS)
    height: int | None = Field(None, gt=0, le=_CROP_MAX_AXIS)


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
    frame_ids: list[str] | None = Field(None, min_length=1, max_length=5000)
    # Filter-based frame selection (alternative to frame_ids)
    satellite: str | None = None
    band: str | None = None
    sector: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    collection_id: str | None = None
    # Settings
    fps: int = Field(10, ge=1, le=60)
    format: str = Field("mp4", pattern=PATTERN_FORMAT)
    quality: str = Field("medium", pattern=PATTERN_QUALITY)
    resolution: str = Field("full", pattern=PATTERN_RESOLUTION)
    loop_style: str = Field("forward", pattern=PATTERN_LOOP_STYLE)
    overlay: OverlaySettings | None = None
    crop_preset_id: str | None = None
    false_color: bool = False
    scale: str = Field("100%", pattern=PATTERN_SCALE)

    @model_validator(mode="after")
    def validate_triple(self):
        _validate_satellite_sector_band(self.satellite, self.sector, self.band)
        return self


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
    duration_seconds: float = 0.0
    created_at: datetime | None = None
    completed_at: datetime | None = None
    error: str = ""
    job_id: str | None = None


# --- Animation from range ---


class AnimationFromRange(BaseModel):
    """Create animation from a time range query."""

    name: str | None = Field(None, max_length=200)
    satellite: str
    sector: str
    band: str
    start_time: datetime
    end_time: datetime
    fps: int = Field(10, ge=1, le=60)
    format: str = Field("mp4", pattern=PATTERN_FORMAT)
    quality: str = Field("medium", pattern=PATTERN_QUALITY)
    resolution: str = Field("full", pattern=PATTERN_RESOLUTION)
    loop_style: str = Field("forward", pattern=PATTERN_LOOP_STYLE)
    overlay: OverlaySettings | None = None

    @model_validator(mode="after")
    def validate_triple(self):
        _validate_satellite_sector_band(self.satellite, self.sector, self.band)
        return self


class AnimationRecent(BaseModel):
    """Create animation from recent N hours."""

    satellite: str
    sector: str
    band: str
    hours: int = Field(6, ge=1, le=72)
    fps: int = Field(10, ge=1, le=60)
    format: str = Field("mp4", pattern=PATTERN_FORMAT)
    quality: str = Field("medium", pattern=PATTERN_QUALITY)
    resolution: str = Field("full", pattern=PATTERN_RESOLUTION)
    loop_style: str = Field("forward", pattern=PATTERN_LOOP_STYLE)
    overlay: OverlaySettings | None = None

    @model_validator(mode="after")
    def validate_triple(self):
        _validate_satellite_sector_band(self.satellite, self.sector, self.band)
        return self


class BatchAnimationItem(BaseModel):
    """Single item in a batch animation request."""

    satellite: str
    sector: str
    band: str
    start_time: datetime
    end_time: datetime
    fps: int = Field(10, ge=1, le=60)
    format: str = Field("mp4", pattern=PATTERN_FORMAT)
    quality: str = Field("medium", pattern=PATTERN_QUALITY)
    resolution: str = Field("full", pattern=PATTERN_RESOLUTION)
    loop_style: str = Field("forward", pattern=PATTERN_LOOP_STYLE)
    overlay: OverlaySettings | None = None

    @model_validator(mode="after")
    def validate_triple(self):
        _validate_satellite_sector_band(self.satellite, self.sector, self.band)
        return self


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
    fps: int = Field(10, ge=1, le=60)
    hours_back: int | None = Field(None, gt=0, le=168)
    format: str = Field("mp4", pattern=PATTERN_FORMAT)
    quality: str = Field("medium", pattern=PATTERN_QUALITY)
    resolution: str = Field("full", pattern=PATTERN_RESOLUTION)
    loop_style: str = Field("forward", pattern=PATTERN_LOOP_STYLE)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode="after")
    def validate_triple(self):
        _validate_satellite_sector_band(self.satellite, self.sector, self.band)
        return self


class AnimationPresetUpdate(BaseModel):
    """Request schema for updating an animation preset."""

    name: str | None = None
    satellite: str | None = None
    sector: str | None = None
    band: str | None = None
    fps: int | None = Field(None, ge=1, le=60)
    hours_back: int | None = Field(None, gt=0, le=168)
    format: str | None = None
    quality: str | None = None
    resolution: str | None = None
    loop_style: str | None = None

    @model_validator(mode="after")
    def validate_triple(self):
        _validate_satellite_sector_band(self.satellite, self.sector, self.band)
        return self


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
