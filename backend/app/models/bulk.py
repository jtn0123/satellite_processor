"""Pydantic schemas for bulk operations"""

from pydantic import BaseModel, Field


class BulkDeleteRequest(BaseModel):
    """Request schema for bulk-deleting resources by their IDs."""

    ids: list[str] = Field(..., min_length=1)
