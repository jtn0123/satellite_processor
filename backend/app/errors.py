"""Standardized API error responses."""

from fastapi import Request
from fastapi.responses import JSONResponse


class APIError(Exception):
    """Structured API error with consistent JSON format."""

    def __init__(self, status_code: int, error: str, detail: str = ""):
        self.status_code = status_code
        self.error = error
        self.detail = detail


async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.error, "detail": exc.detail},
    )
