"""Pydantic schemas for bulk operations"""

from pydantic import BaseModel, Field


class BulkDeleteRequest(BaseModel):
    ids: list[str] = Field(..., min_length=1)
