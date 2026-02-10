"""Pydantic schemas for processing settings"""

from pydantic import BaseModel


class ProcessingSettings(BaseModel):
    crop_enabled: bool = False
    crop_x: int = 0
    crop_y: int = 0
    crop_width: int = 0
    crop_height: int = 0
    false_color_enabled: bool = False
    add_timestamp: bool = True
    fps: int = 30
    encoder: str = "H.264"
    bitrate: int = 5000
    video_quality: str = "high"


class PresetCreate(BaseModel):
    name: str
    params: dict


class PresetResponse(BaseModel):
    id: str
    name: str
    params: dict
    created_at: str

    model_config = {"from_attributes": True}
