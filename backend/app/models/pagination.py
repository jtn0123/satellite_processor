"""Shared pagination wrapper models"""

from dataclasses import dataclass
from typing import Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel

T = TypeVar("T")


@dataclass
class PaginationParams:
    """Reusable pagination dependency for FastAPI endpoints."""

    page: int = Query(1, ge=1)
    limit: int = Query(50, ge=1, le=200)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper with items, total count, and page info."""

    items: list[T]
    total: int
    page: int
    limit: int
