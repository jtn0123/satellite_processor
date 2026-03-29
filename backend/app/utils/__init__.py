"""Shared utilities."""

from __future__ import annotations

import logging
import os
import re
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


_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f-\x9f]")


def sanitize_log(value: object) -> str:
    """Sanitize a value for safe logging by stripping control characters.

    Prevents log injection attacks where user-controlled input containing
    newlines or other control characters could forge log entries.
    """
    return _CONTROL_CHARS.sub("", str(value))


def utcnow() -> datetime:
    """Return the current UTC time as a naive datetime (no tzinfo).

    This avoids the Python 3.12 deprecation of ``datetime.utcnow()`` while
    still returning a naive datetime compatible with PostgreSQL
    ``TIMESTAMP WITHOUT TIME ZONE`` columns.
    """
    return datetime.now(UTC).replace(tzinfo=None)
