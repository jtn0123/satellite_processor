"""Standardized API error responses and validation utilities."""

import uuid
from pathlib import Path

from fastapi import Request
from fastapi.responses import JSONResponse


class APIError(Exception):
    """Structured API error with consistent JSON format."""

    def __init__(self, status_code: int, error: str, detail: str = ""):
        self.status_code = status_code
        self.error = error
        self.detail = detail


def api_error_handler(_request: Request, exc: APIError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.error, "detail": exc.detail},
    )


def validate_uuid(value: str, name: str = "id") -> str:
    """Validate that a string is a valid UUID. Returns the normalized string."""
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError):
        raise APIError(404, "not_found", f"Resource not found (invalid {name})")
    return value


def validate_safe_path(file_path: str, allowed_root: str) -> Path:
    """Validate that a file path doesn't escape the allowed root directory."""
    root = Path(allowed_root).resolve()
    resolved = Path(file_path).resolve()
    if not str(resolved).startswith(str(root)):
        raise APIError(403, "forbidden", "Path traversal detected")
    return resolved
