"""Pydantic schemas for processing settings"""

from pydantic import BaseModel, Field, field_validator


class ProcessingSettings(BaseModel):
    """Global processing settings for crop, color, timestamp, and video encoding."""

    crop_enabled: bool = False
    crop_x: int = Field(default=0, ge=0)
    crop_y: int = Field(default=0, ge=0)
    crop_width: int = Field(default=0, ge=0)
    crop_height: int = Field(default=0, ge=0)
    false_color_enabled: bool = False
    add_timestamp: bool = True
    fps: int = Field(default=30, ge=1, le=60)
    encoder: str = "H.264"
    bitrate: int = Field(default=5000, gt=0)
    video_quality: str = "high"


class PresetCreate(BaseModel):
    """Request schema for creating a named processing parameter preset."""

    name: str = Field(min_length=1, max_length=100)
    params: dict

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("params")
    @classmethod
    def validate_params(cls, v: dict) -> dict:
        if not v:
            raise ValueError("params must be a non-empty dict")
        return v


class PresetResponse(BaseModel):
    """Response schema for a processing preset with its stored parameters."""

    id: str
    name: str
    params: dict
    created_at: str

    model_config = {"from_attributes": True}
