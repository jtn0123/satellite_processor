"""Pydantic schemas for images"""

from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ImageResponse(BaseModel):
    id: str
    filename: str
    original_name: str
    file_size: int
    width: int | None = None
    height: int | None = None
    satellite: str | None = None
    captured_at: datetime | None = None
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    limit: int
