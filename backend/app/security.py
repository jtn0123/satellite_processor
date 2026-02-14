"""Security middleware — headers and request body size limits.

Uses pure ASGI middleware instead of BaseHTTPMiddleware to avoid
breaking WebSocket connections (BaseHTTPMiddleware intercepts
WebSocket upgrade requests and returns HTTP errors).
"""

from __future__ import annotations

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# 10 MB default request body limit
MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024

# Security headers applied to every response
SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
}


class SecurityHeadersMiddleware:
    """Add security headers to all HTTP responses. Passes WebSocket through."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                raw_headers = list(message.get("headers", []))
                for key, value in SECURITY_HEADERS.items():
                    raw_headers.append((key.lower().encode(), value.encode()))
                message["headers"] = raw_headers
            await send(message)

        await self.app(scope, receive, send_with_headers)


class RequestBodyLimitMiddleware:
    """Reject requests with bodies exceeding the configured limit.

    Skips file upload endpoints and WebSocket connections.
    """

    SKIP_PATHS = {"/api/images/upload"}

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path in self.SKIP_PATHS:
            await self.app(scope, receive, send)
            return

        # Check content-length header
        headers = dict(
            (k.decode("latin-1"), v.decode("latin-1"))
            for k, v in scope.get("headers", [])
        )
        content_length = headers.get("content-length")
        if content_length and int(content_length) > MAX_REQUEST_BODY_BYTES:
            response = JSONResponse(
                status_code=413,
                content={"error": "request_too_large", "detail": "Request body exceeds 10MB limit"},
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
