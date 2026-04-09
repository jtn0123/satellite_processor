"""Standardized API error responses and validation utilities."""

import uuid
from pathlib import Path

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


class APIErrorResponse(BaseModel):
    """JSON envelope returned by :class:`APIError` and the global exception handlers.

    Keeping this as a real Pydantic model (rather than an inline dict) is what
    lets us reference it from the ``responses=`` kwarg on router decorators so
    the OpenAPI schema publishes a proper error shape. Generated frontend
    types then get a typed ``APIErrorResponse`` instead of ``unknown`` for
    non-2xx bodies — JTN-419.
    """

    error: str = Field(
        ...,
        description="Short machine-readable error code (e.g. 'not_found', 'invalid_file_type').",
        examples=["not_found"],
    )
    detail: str = Field(
        default="",
        description="Human-readable explanation of what went wrong. May be empty.",
        examples=["Resource not found (invalid image_id)"],
    )
    status_code: int = Field(
        ...,
        description="HTTP status code mirrored in the body for clients that only read JSON.",
        examples=[404],
    )


# Reusable ``responses=`` fragment for router decorators. Advertises the
# ``APIErrorResponse`` envelope on the most common error statuses we raise,
# so the generated OpenAPI schema carries error shapes for every route that
# opts in via ``**API_ERROR_RESPONSES``.
API_ERROR_RESPONSES: dict[int | str, dict[str, object]] = {
    400: {"model": APIErrorResponse, "description": "Bad Request — invalid payload or parameters."},
    401: {"model": APIErrorResponse, "description": "Unauthorized — missing or invalid API key."},
    403: {"model": APIErrorResponse, "description": "Forbidden — path or operation rejected."},
    404: {"model": APIErrorResponse, "description": "Not Found — resource does not exist."},
    409: {"model": APIErrorResponse, "description": "Conflict — duplicate or concurrent change."},
    413: {"model": APIErrorResponse, "description": "Payload Too Large — request body exceeded the limit."},
    415: {"model": APIErrorResponse, "description": "Unsupported Media Type."},
    429: {"model": APIErrorResponse, "description": "Too Many Requests — rate limit exceeded."},
    500: {"model": APIErrorResponse, "description": "Internal Server Error."},
}


class APIError(Exception):
    """Structured API error with consistent JSON format."""

    def __init__(self, status_code: int, error: str, detail: str = ""):
        self.status_code = status_code
        self.error = error
        self.detail = detail


def api_error_handler(_request: Request, exc: APIError) -> JSONResponse:
    payload = APIErrorResponse(error=exc.error, detail=exc.detail, status_code=exc.status_code)
    return JSONResponse(status_code=exc.status_code, content=payload.model_dump())


def validate_uuid(value: str, name: str = "id") -> str:
    """Validate that a string is a valid UUID. Returns the normalized string."""
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError):
        raise APIError(404, "not_found", f"Resource not found (invalid {name})")
    return value


def validate_safe_path(file_path: str, allowed_root: str) -> Path:
    """Validate that a file path doesn't escape the allowed root directory.

    Both paths are resolved to absolute before comparison, so relative
    ``allowed_root`` (e.g. ``./data``) and absolute ``file_path``
    (e.g. ``/app/data/...`` inside Docker) are handled correctly.

    Uses Path.resolve() + str prefix check — a pattern recognised by
    CodeQL as a path-injection sanitizer.
    """
    root = str(Path(allowed_root).resolve())
    resolved = str(Path(file_path).resolve())
    if not (resolved == root or resolved.startswith(root + "/")):
        raise APIError(403, "forbidden", "Path outside allowed directory")
    return Path(resolved)
