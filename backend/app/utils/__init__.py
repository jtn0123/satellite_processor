"""Shared utilities."""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime

logger = logging.getLogger(__name__)


def safe_remove(path: str | os.PathLike[str]) -> int:
    """Remove a file, returning bytes freed. Silently ignores missing files."""
    try:
        size = os.path.getsize(path)
        os.remove(path)
        return size
    except OSError:
        return 0


def utcnow() -> datetime:
    """Return the current UTC time as a naive datetime (no tzinfo).

    This avoids the Python 3.12 deprecation of ``datetime.utcnow()`` while
    still returning a naive datetime compatible with PostgreSQL
    ``TIMESTAMP WITHOUT TIME ZONE`` columns.
    """
    return datetime.now(UTC).replace(tzinfo=None)
