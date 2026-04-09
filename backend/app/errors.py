"""Standardized API error responses and validation utilities.

This module exposes a small exception hierarchy rooted at :class:`APIError`
(JTN-392). Callers should raise the most specific subclass that fits the
failure — the FastAPI exception handler below maps every member of the
hierarchy to the same JSON envelope, so routers and services can swap a
bare ``APIError(...)`` for e.g. ``NotFoundError(...)`` without any
handler-side changes.

The subclasses carry a class-level ``status_code`` and ``error`` code so
call sites only need to supply a human-readable ``detail`` string. They
can still be customised per-instance when a non-default status code is
required.

``ProcessorError`` is the common base for failures that originate in the
core :mod:`satellite_processor` pipeline; it is used by Celery tasks to
narrow ``except`` blocks away from a bare ``Exception`` catch (JTN-393).
It is intentionally *not* an ``APIError`` — processor failures happen on
the Celery worker side, not inside an HTTP request, so mapping them to a
status code would be meaningless.
"""

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
    """Structured API error with consistent JSON format.

    Base class for the backend's HTTP-facing exception hierarchy. Direct
    instantiation is still supported for one-off errors that don't fit a
    named subclass, but new call sites should prefer the narrower
    subclasses defined below.
    """

    #: Default HTTP status code. Subclasses override this; instances may
    #: also pass ``status_code=`` explicitly to override per-raise.
    status_code: int = 500
    #: Default machine-readable error code. Subclasses override this.
    error: str = "internal_error"

    def __init__(
        self,
        status_code: int | None = None,
        error: str | None = None,
        detail: str = "",
    ):
        # Allow subclasses to supply class-level defaults while keeping
        # the positional-argument API backward compatible.
        if status_code is not None:
            self.status_code = status_code
        if error is not None:
            self.error = error
        self.detail = detail
        super().__init__(detail or self.error)


class ValidationError(APIError):
    """Request payload failed validation (HTTP 422 by default).

    ``status_code`` may be overridden per-raise when a caller needs a
    different client-error code — most often 400 for requests that
    parsed successfully but fall outside a hard-coded limit.
    """

    status_code = 422
    error = "validation_error"

    def __init__(
        self,
        detail: str = "",
        error: str | None = None,
        status_code: int | None = None,
    ):
        super().__init__(status_code=status_code, error=error, detail=detail)


class NotFoundError(APIError):
    """Resource does not exist (HTTP 404)."""

    status_code = 404
    error = "not_found"

    def __init__(self, detail: str = "", error: str | None = None):
        super().__init__(error=error, detail=detail)


class ForbiddenError(APIError):
    """Caller is not permitted to access the resource (HTTP 403)."""

    status_code = 403
    error = "forbidden"

    def __init__(self, detail: str = "", error: str | None = None):
        super().__init__(error=error, detail=detail)


class ConflictError(APIError):
    """Request conflicts with current resource state (HTTP 409)."""

    status_code = 409
    error = "conflict"

    def __init__(self, detail: str = "", error: str | None = None):
        super().__init__(error=error, detail=detail)


class UnauthorizedError(APIError):
    """Caller is not authenticated (HTTP 401)."""

    status_code = 401
    error = "unauthorized"

    def __init__(self, detail: str = "", error: str | None = None):
        super().__init__(error=error, detail=detail)


class RateLimitError(APIError):
    """Too many requests from the caller (HTTP 429)."""

    status_code = 429
    error = "rate_limited"

    def __init__(self, detail: str = "", error: str | None = None):
        super().__init__(error=error, detail=detail)


class FetchError(APIError):
    """Fetching remote satellite data failed (HTTP 502 by default).

    Raised by GOES / Himawari fetcher services when an upstream HTTP
    call, S3 listing, or parse step fails after any internal retries.
    Subclass of :class:`APIError` so router-level handlers can report
    a consistent envelope; callers that need a different status code
    (e.g. 504 for gateway timeout) can override it per-raise.
    """

    status_code = 502
    error = "fetch_failed"

    def __init__(
        self,
        detail: str = "",
        error: str | None = None,
        status_code: int | None = None,
    ):
        super().__init__(status_code=status_code, error=error, detail=detail)


class StorageError(APIError):
    """Local storage I/O failed (HTTP 500 by default).

    Raised for filesystem failures (missing output directories, permission
    errors, disk full, path-traversal attempts). :func:`validate_safe_path`
    raises a specialised :class:`PathTraversalError` which is a subclass
    of :class:`StorageError`.
    """

    status_code = 500
    error = "storage_error"

    def __init__(
        self,
        detail: str = "",
        error: str | None = None,
        status_code: int | None = None,
    ):
        super().__init__(status_code=status_code, error=error, detail=detail)


class PathTraversalError(StorageError):
    """File path escapes the allowed root directory (HTTP 403).

    Raised by :func:`validate_safe_path`. It is a :class:`StorageError`
    subclass so I/O-style ``except`` blocks catch it, but it overrides
    ``status_code`` / ``error`` to match :class:`ForbiddenError` so the
    HTTP response is identical to any other forbidden access.
    """

    status_code = 403
    error = "forbidden"

    def __init__(self, detail: str = "Path outside allowed directory"):
        # Bypass StorageError.__init__ because we always want the 403
        # default and never a custom status code on a traversal attempt.
        APIError.__init__(self, detail=detail)


class ProcessorError(Exception):
    """Base class for failures in the core satellite processing pipeline.

    Distinct from :class:`APIError` because it is raised on the Celery
    worker side, not inside an HTTP request. Celery tasks narrow their
    ``except`` blocks on this class (plus a small allow-list of
    third-party library errors) so that genuinely unexpected crashes
    — ``AttributeError`` from a misconfigured ``processor.process()``
    call, for instance — surface instead of being silently swallowed
    into a generic "Processing failed" status (JTN-393).
    """

    def __init__(self, message: str = ""):
        self.message = message
        super().__init__(message)


class ProcessorConfigError(ProcessorError):
    """Processor was misconfigured before ``process()`` was invoked."""


class ProcessorRuntimeError(ProcessorError):
    """Processor failed mid-pipeline due to a recoverable runtime error."""


def api_error_handler(_request: Request, exc: APIError) -> JSONResponse:
    payload = APIErrorResponse(error=exc.error, detail=exc.detail, status_code=exc.status_code)
    return JSONResponse(status_code=exc.status_code, content=payload.model_dump())


def validate_uuid(value: str, name: str = "id") -> str:
    """Validate that a string is a valid UUID. Returns the normalized string."""
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError):
        raise NotFoundError(f"Resource not found (invalid {name})")
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
        raise PathTraversalError()
    return Path(resolved)
