"""Pydantic schemas for jobs"""

from datetime import datetime
from typing import Optional
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
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class JobUpdate(BaseModel):
    status: Optional[str] = None
    progress: Optional[int] = None
    status_message: Optional[str] = None
    output_path: Optional[str] = None
    error: Optional[str] = None
