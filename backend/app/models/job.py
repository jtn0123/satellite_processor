"""Pydantic schemas for jobs"""

import os
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

ALLOWED_PARAM_KEYS = {
    "image_ids", "image_paths", "input_path", "output_path",
    "crop_x", "crop_y", "crop_width", "crop_height",
    "crop", "false_color", "false_color_enabled", "add_timestamp",
    "timestamp", "fps", "encoder", "bitrate", "video_quality",
    "video", "scale", "format", "resolution", "interpolation",
}


def _check_unknown_keys(params: dict) -> None:
    unknown = set(params.keys()) - ALLOWED_PARAM_KEYS
    if unknown:
        raise ValueError(f"Unknown parameter keys: {unknown}")


def _is_suspicious_path(key: str, val: str) -> bool:
    """Check if a string param value looks like path traversal."""
    if key in ("input_path", "output_path"):
        return False
    return ".." in val or val.startswith("/")


def _check_image_paths(paths: list) -> None:
    """Validate image_paths list for traversal attacks."""
    for p in paths:
        if isinstance(p, str) and ".." in p:
            raise ValueError("Path traversal not allowed in image_paths")


def _check_path_traversal(params: dict) -> None:
    for key, val in params.items():
        if isinstance(val, str) and _is_suspicious_path(key, val):
            raise ValueError(f"Suspicious value for '{key}'")
        if key == "image_paths" and isinstance(val, list):
            _check_image_paths(val)


class JobCreate(BaseModel):
    """Request schema for creating a processing or video creation job."""

    job_type: Literal["image_process", "video_create"] = "image_process"
    params: dict = Field(default_factory=dict)
    input_path: str = Field(default="", max_length=500)

    @field_validator("params")
    @classmethod
    def validate_params(cls, v: dict) -> dict:
        v = {k: val for k, val in v.items() if val is not None}
        _check_unknown_keys(v)
        _check_path_traversal(v)
        return v

    @field_validator("input_path")
    @classmethod
    def validate_input_path(cls, v: str) -> str:
        if not v:
            return v
        if ".." in v:
            raise ValueError("Path traversal not allowed in input_path")
        if os.path.isabs(v) and not v.startswith(("/data", "/tmp")):
            raise ValueError("Absolute path outside allowed directories")
        return v


class JobResponse(BaseModel):
    """Response schema for a job with status, progress, and output path."""

    id: str
    status: str
    job_type: str
    params: dict
    progress: int
    status_message: str
    input_path: str
    output_path: str
    error: str
    task_id: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class JobUpdate(BaseModel):
    """Request schema for updating job status and progress."""

    status: str | None = None
    progress: int | None = None
    status_message: str | None = None
    output_path: str | None = None
    error: str | None = None
