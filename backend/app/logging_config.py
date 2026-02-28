"""Structured logging configuration with wide event support."""

import json
import logging
import sys
import time
import traceback

from starlette.types import ASGIApp, Receive, Scope, Send

from .middleware.correlation import request_id_ctx


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


def _get_header(scope: Scope, name: bytes) -> str:
    """Extract a header value from ASGI scope."""
    for key, value in scope.get("headers", []):
        if key == name:
            return value.decode("latin-1", errors="replace")
    return ""


def _parse_user_agent(ua: str) -> str | None:
    """Extract a simplified browser/OS string from a User-Agent header."""
    if not ua:
        return None
    import re
    # Common patterns: Chrome, Firefox, Safari, Edge, bot
    for pattern, name in [
        (r"Edg[e/](\S+)", "Edge"),
        (r"Chrome/(\S+)", "Chrome"),
        (r"Firefox/(\S+)", "Firefox"),
        (r"Safari/(\S+)", "Safari"),
    ]:
        m = re.search(pattern, ua)
        if m:
            version = m.group(1).split(".")[0]
            # Detect OS
            os_name = "Unknown"
            if "Android" in ua:
                os_name = "Android"
            elif "iPhone" in ua or "iPad" in ua:
                os_name = "iOS"
            elif "Windows" in ua:
                os_name = "Windows"
            elif "Mac OS" in ua or "Macintosh" in ua:
                os_name = "macOS"
            elif "Linux" in ua:
                os_name = "Linux"
            return f"{name}/{version} ({os_name})"
    if "bot" in ua.lower() or "crawler" in ua.lower():
        return "Bot"
    return ua[:50] if len(ua) > 50 else ua


def _get_response_content_type(send_wrapper, scope) -> str | None:  # noqa: ARG001
    """Extract response content-type. Returns None if unavailable.

    Note: In the current ASGI send-wrapper pattern, response headers aren't
    captured. This returns None as a placeholder; a future enhancement can
    capture headers in send_wrapper.
    """
    return None


class RequestLoggingMiddleware:
    """Emit one wide event per HTTP request as structured JSON.

    Uses pure ASGI to avoid breaking WebSocket connections.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._wide_logger = logging.getLogger("wide_event")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        status_code = 500
        response_size = 0
        response_content_type: str | None = None
        error_info: dict[str, str] | None = None

        content_length = _get_header(scope, b"content-length")
        request_size = int(content_length) if content_length.isdigit() else 0

        async def send_wrapper(message: dict) -> None:
            nonlocal status_code, response_size, response_content_type
            if message["type"] == "http.response.start":
                status_code = message["status"]
                for key, value in message.get("headers", []):
                    if key == b"content-type":
                        response_content_type = value.decode("latin-1", errors="replace")
                        break
            elif message["type"] == "http.response.body":
                body = message.get("body", b"")
                if body:
                    response_size += len(body)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            error_info = {
                "type": type(exc).__name__,
                "message": str(exc),
                "traceback": "".join(traceback.format_exception(type(exc), exc, exc.__traceback__, limit=5)),
            }
            raise
        finally:
            duration_ms = (time.perf_counter() - start) * 1000
            method = scope.get("method", "?")
            path = scope.get("path", "?")
            query_string = scope.get("query_string", b"").decode("latin-1", errors="replace")
            client = scope.get("client")
            # NOTE: IP logged for request tracing / rate-limit debugging.
            # Ensure production log retention policy limits PII exposure.
            client_ip = client[0] if client else "unknown"
            user_agent = _get_header(scope, b"user-agent")
            content_type = response_content_type
            correlation_id = request_id_ctx.get("")

            # Parse user agent into simplified browser/OS string
            ua_parsed = _parse_user_agent(user_agent)

            wide_event: dict = {
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z",
                "correlation_id": correlation_id,
                "method": method,
                "path": path,
                "query_string": query_string or None,
                "status_code": status_code,
                "duration_ms": round(duration_ms, 2),
                "client_ip": client_ip,
                "user_agent": user_agent,
                "user_agent_parsed": ua_parsed,
                "response_content_type": content_type,
                "request_size_bytes": request_size,
                "response_size_bytes": response_size,
                "db_query_count": None,
                "cache_hit": False,
            }

            if error_info:
                wide_event["error"] = error_info

            # Emit as a single JSON line
            self._wide_logger.info(json.dumps(wide_event, default=str))
