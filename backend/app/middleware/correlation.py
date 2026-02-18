"""Correlation ID middleware for request tracing.

Generates a short request ID for each request and attaches it to the response
headers and logging context. Accepts an incoming X-Request-ID header if provided.
"""

import contextvars
import logging
import re
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID_PATTERN = re.compile(r"^[\w\-]{1,64}$")

# Context variable accessible from anywhere in the request lifecycle
request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id", default=""
)


class CorrelationMiddleware:
    """Pure ASGI middleware that injects X-Request-ID into requests and responses.

    Uses ASGI directly (not BaseHTTPMiddleware) to avoid breaking WebSocket
    connections and to minimise overhead.
    """

    def __init__(self, app: ASGIApp) -> None:
        """Initialise middleware with the wrapped ASGI application."""
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Process an ASGI request, injecting a correlation ID."""
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Extract or generate request ID
        headers = dict(scope.get("headers", []))
        incoming_id = headers.get(b"x-request-id", b"").decode().strip()
        if incoming_id and not REQUEST_ID_PATTERN.match(incoming_id):
            incoming_id = ""
        rid = incoming_id or uuid.uuid4().hex[:8]

        # Store in context var for logging filters
        token = request_id_ctx.set(rid)

        async def send_with_id(message: Message) -> None:
            """Wrap send to inject X-Request-ID into response headers."""
            if message["type"] == "http.response.start":
                message = dict(message)
                message["headers"] = list(message.get("headers", [])) + [
                    (b"x-request-id", rid.encode())
                ]
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            request_id_ctx.reset(token)


class RequestIdFilter(logging.Filter):
    """Logging filter that injects request_id from the context variable."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        record.request_id = request_id_ctx.get("")  # type: ignore[attr-defined]
        return True
