"""Pydantic schemas for jobs"""

from datetime import datetime

from pydantic import BaseModel, Field


class JobCreate(BaseModel):
    job_type: str = "image_process"
    params: dict = Field(default_factory=dict)
    input_path: str = ""


class JobResponse(BaseModel):
    id: str
    status: str
    job_type: str
    params: dict
    progress: int
    status_message: str
    input_path: str
    output_path: str
    error: str
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class JobUpdate(BaseModel):
    status: str | None = None
    progress: int | None = None
    status_message: str | None = None
    output_path: str | None = None
    error: str | None = None
