"""Structured logging configuration"""

import logging
import os
import sys
import time
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


def setup_logging(debug: bool = False):
    """Configure structured logging. JSON for prod, human-readable for dev."""
    level = logging.DEBUG if debug else logging.INFO
    
    if debug:
        fmt = "%(asctime)s %(levelname)-8s %(name)s: %(message)s"
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(fmt))
    else:
        try:
            from pythonjsonlogger import jsonlogger
            handler = logging.StreamHandler(sys.stdout)
            formatter = jsonlogger.JsonFormatter(
                "%(asctime)s %(levelname)s %(name)s %(message)s",
                rename_fields={"asctime": "timestamp", "levelname": "level"},
            )
            handler.setFormatter(formatter)
        except ImportError:
            fmt = "%(asctime)s %(levelname)-8s %(name)s: %(message)s"
            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(logging.Formatter(fmt))

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Quiet noisy loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING if not debug else logging.INFO)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log request method, path, status, and duration."""

    async def dispatch(self, request: Request, call_next):
        logger = logging.getLogger("api.request")
        start = time.perf_counter()
        response: Response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "%s %s %d %.1fms",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round(duration_ms, 1),
            },
        )
        return response
