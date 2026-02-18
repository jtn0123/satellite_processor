"""Structured logging configuration"""

import logging
import sys
import time

from starlette.types import ASGIApp, Receive, Scope, Send


def setup_logging(debug: bool = False):
    """Configure structured logging. JSON for prod, human-readable for dev."""
    from .middleware.correlation import RequestIdFilter

    level = logging.DEBUG if debug else logging.INFO
    rid_filter = RequestIdFilter()

    if debug:
        fmt = "%(asctime)s %(levelname)-8s [%(request_id)s] %(name)s: %(message)s"
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(fmt))
    else:
        try:
            from pythonjsonlogger import jsonlogger
            handler = logging.StreamHandler(sys.stdout)
            formatter = jsonlogger.JsonFormatter(
                "%(asctime)s %(levelname)s %(name)s %(request_id)s %(message)s",
                rename_fields={"asctime": "timestamp", "levelname": "level"},
            )
            handler.setFormatter(formatter)
        except ImportError:
            fmt = "%(asctime)s %(levelname)-8s [%(request_id)s] %(name)s: %(message)s"
            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(logging.Formatter(fmt))

    handler.addFilter(rid_filter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Quiet noisy loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING if not debug else logging.INFO)


class RequestLoggingMiddleware:
    """Log request method, path, status, and duration.

    Uses pure ASGI to avoid breaking WebSocket connections.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        logger = logging.getLogger("api.request")
        start = time.perf_counter()
        status_code = 500

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        await self.app(scope, receive, send_wrapper)
        duration_ms = (time.perf_counter() - start) * 1000

        from .middleware.correlation import request_id_ctx
        rid = request_id_ctx.get("")

        logger.info(
            "%s %s %d %.1fms [%s]",
            scope.get("method", "?"),
            scope.get("path", "?"),
            status_code,
            duration_ms,
            rid,
            extra={
                "method": scope.get("method", "?"),
                "path": scope.get("path", "?"),
                "status": status_code,
                "duration_ms": round(duration_ms, 1),
                "request_id": rid,
            },
        )
