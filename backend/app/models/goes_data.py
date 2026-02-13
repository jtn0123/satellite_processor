"""Pydantic schemas for GOES data management endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# --- Frame schemas ---

class GoesFrameResponse(BaseModel):
    """Response schema for a GOES satellite frame with file info, tags, and collections."""

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
    """Aggregated statistics for GOES frames broken down by satellite and band."""

    total_frames: int
    total_size_bytes: int
    by_satellite: dict[str, dict[str, int]]  # satellite -> {count, size}
    by_band: dict[str, dict[str, int]]


class BulkFrameDeleteRequest(BaseModel):
    """Request schema for bulk-deleting GOES frames by their IDs."""

    ids: list[str] = Field(..., min_length=1)


class BulkTagRequest(BaseModel):
    """Request schema for applying tags to multiple frames at once."""

    frame_ids: list[str] = Field(..., min_length=1)
    tag_ids: list[str] = Field(..., min_length=1)


class ProcessFramesRequest(BaseModel):
    """Request schema for submitting selected frames for processing."""

    frame_ids: list[str] = Field(..., min_length=1)
    params: dict = Field(default_factory=dict)


# --- Collection schemas ---

class CollectionBrief(BaseModel):
    """Minimal collection info embedded in frame responses."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str


class CollectionCreate(BaseModel):
    """Request schema for creating a named frame collection."""

    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""


class CollectionUpdate(BaseModel):
    """Request schema for updating collection name or description."""

    name: str | None = None
    description: str | None = None


class CollectionResponse(BaseModel):
    """Response schema for a collection with frame count and timestamps."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    frame_count: int = 0


class CollectionFramesRequest(BaseModel):
    """Request schema for adding frames to a collection."""

    frame_ids: list[str] = Field(..., min_length=1)


# --- Tag schemas ---

class TagCreate(BaseModel):
    """Request schema for creating a tag with name and color."""

    name: str = Field(..., min_length=1, max_length=100)
    color: str = "#3b82f6"


class TagResponse(BaseModel):
    """Response schema for a tag with id, name, and color."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    color: str
