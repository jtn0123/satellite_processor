"""Shared pagination wrapper models"""

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper with items, total count, and page info."""

    items: list[T]
    total: int
    page: int
    limit: int
