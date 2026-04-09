"""Pydantic schemas for jobs"""

import os
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# Per-job-type required params. Enforced in ``JobCreate.require_meaningful_input``
# so that ``POST /api/jobs -d '{}'`` 422s instead of silently spawning a stub
# job that the Celery worker then fails with "Processing returned False"
# (JTN-421 ISSUE-028).
_JOB_TYPE_REQUIRED_INPUT = {
    "image_process": ("image_ids", "image_paths"),
    "video_create": ("image_ids", "image_paths"),
}

ALLOWED_PARAM_KEYS = {
    "image_ids",
    "image_paths",
    "input_path",
    "output_path",
    "crop_x",
    "crop_y",
    "crop_width",
    "crop_height",
    "crop",
    "false_color",
    "false_color_enabled",
    "add_timestamp",
    "timestamp",
    "fps",
    "encoder",
    "bitrate",
    "video_quality",
    "video",
    "scale",
    "format",
    "resolution",
    "interpolation",
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

    job_type: Literal["image_process", "video_create", "goes_fetch"] = "image_process"
    name: str | None = None
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

    @model_validator(mode="after")
    def require_meaningful_input(self):
        """Reject empty-body job create requests (JTN-421 ISSUE-028).

        The stub job was accepted, dispatched, and then failed on the worker
        with ``Processing returned False`` — wasting a worker slot and
        polluting the Jobs list with ghost rows. Now we require callers to
        supply either ``input_path`` (top-level or nested in params) or one
        of the job-type's required params keys.
        """
        required_for_type = _JOB_TYPE_REQUIRED_INPUT.get(self.job_type, ())
        if not required_for_type:
            return self
        has_required_param = any(self.params.get(key) for key in required_for_type)
        has_any_input = bool(self.input_path) or bool(self.params.get("input_path")) or has_required_param
        if not has_any_input:
            raise ValueError(
                f"job_type={self.job_type!r} requires input_path or at least one of: {list(required_for_type)}"
            )
        return self


class JobResponse(BaseModel):
    """Response schema for a job with status, progress, and output path."""

    id: str
    name: str | None = None
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
    frames_completed: int | None = None
    frames_total: int | None = None

    model_config = {"from_attributes": True}

    def model_post_init(self, __context):
        """Derive frames_completed/frames_total from params and progress."""
        if self.params:
            total = self.params.get("frames_total")
            if total and self.frames_total is None:
                self.frames_total = total
            if self.frames_completed is None and total:
                self.frames_completed = int((self.progress / 100) * total) if self.progress else 0


class JobUpdate(BaseModel):
    """Request schema for updating job status and progress."""

    status: str | None = None
    progress: int | None = None
    status_message: str | None = None
    output_path: str | None = None
    error: str | None = None
