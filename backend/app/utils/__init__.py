"""Shared utilities."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Return the current UTC time as a naive datetime (no tzinfo).

    This avoids the Python 3.12 deprecation of ``datetime.utcnow()`` while
    still returning a naive datetime compatible with PostgreSQL
    ``TIMESTAMP WITHOUT TIME ZONE`` columns.
    """
    return datetime.now(UTC).replace(tzinfo=None)
