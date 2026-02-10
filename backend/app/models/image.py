"""Pydantic schemas for images"""

from datetime import datetime

from pydantic import BaseModel


class ImageResponse(BaseModel):
    id: str
    filename: str
    original_name: str
    file_size: int
    width: int | None = None
    height: int | None = None
    satellite: str | None = None
    captured_at: datetime | None = None
    uploaded_at: datetime | None = None

    model_config = {"from_attributes": True}
