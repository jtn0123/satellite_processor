"""Pydantic schemas for GOES data management endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# --- Frame schemas ---

class GoesFrameResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    satellite: str
    sector: str
    band: str
    capture_time: datetime
    file_path: str
    file_size: int
    width: int | None = None
    height: int | None = None
    thumbnail_path: str | None = None
    source_job_id: str | None = None
    created_at: datetime | None = None
    tags: list[TagResponse] = []
    collections: list[CollectionBrief] = []


class FrameStatsResponse(BaseModel):
    total_frames: int
    total_size_bytes: int
    by_satellite: dict[str, dict[str, int]]  # satellite -> {count, size}
    by_band: dict[str, dict[str, int]]


class BulkFrameDeleteRequest(BaseModel):
    ids: list[str] = Field(..., min_length=1)


class BulkTagRequest(BaseModel):
    frame_ids: list[str] = Field(..., min_length=1)
    tag_ids: list[str] = Field(..., min_length=1)


class ProcessFramesRequest(BaseModel):
    frame_ids: list[str] = Field(..., min_length=1)
    params: dict = Field(default_factory=dict)


# --- Collection schemas ---

class CollectionBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str


class CollectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""


class CollectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class CollectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    frame_count: int = 0


class CollectionFramesRequest(BaseModel):
    frame_ids: list[str] = Field(..., min_length=1)


# --- Tag schemas ---

class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = "#3b82f6"


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    color: str
