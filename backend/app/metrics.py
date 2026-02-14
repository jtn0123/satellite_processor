"""Prometheus metrics for the Satellite Processor API.

Provides request metrics middleware, task metrics, S3 operation metrics,
and a /api/metrics endpoint for Prometheus scraping.
"""

from __future__ import annotations

import time

from prometheus_client import Counter, Gauge, Histogram, generate_latest
from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send

# ── HTTP Request Metrics ──────────────────────────────────────────

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"],
)

REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "path"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

# ── Job / Task Metrics ────────────────────────────────────────────

ACTIVE_JOBS = Gauge(
    "active_jobs",
    "Number of currently processing jobs",
)

TASK_FAILURES = Counter(
    "celery_task_failures_total",
    "Total Celery task failures",
    ["task_name"],
)

TASK_COMPLETIONS = Counter(
    "celery_task_completions_total",
    "Total Celery task completions",
    ["task_name"],
)

# ── S3 Metrics ────────────────────────────────────────────────────

S3_FETCH_COUNT = Counter(
    "s3_fetch_total",
    "Total S3 fetch operations",
    ["operation"],  # list, get
)

S3_FETCH_ERRORS = Counter(
    "s3_fetch_errors_total",
    "Total S3 fetch errors",
    ["operation", "error_type"],
)

# ── Frame Metrics ─────────────────────────────────────────────────

FRAME_COUNT = Gauge(
    "goes_frames_total",
    "Total number of GOES frames in database",
)

# ── Disk / Storage ────────────────────────────────────────────────

DISK_FREE_BYTES = Gauge(
    "disk_free_bytes",
    "Free disk space in bytes for storage path",
)

DISK_USED_BYTES = Gauge(
    "disk_used_bytes",
    "Used disk space in bytes for storage path",
)


# ── Paths to normalize for cardinality control ────────────────────

_SKIP_PATHS = {"/api/metrics", "/api/health", "/docs", "/redoc", "/openapi.json"}


def _normalize_path(path: str) -> str:
    """Collapse UUID path segments to reduce metric cardinality."""
    parts = path.split("/")
    normalized = []
    for part in parts:
        # Replace UUID-like segments
        if len(part) == 36 and part.count("-") == 4:
            normalized.append("{id}")
        else:
            normalized.append(part)
    return "/".join(normalized)


class PrometheusMiddleware:
    """Collect HTTP request metrics for Prometheus.

    Uses pure ASGI to avoid breaking WebSocket connections.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path in _SKIP_PATHS:
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET")
        norm_path = _normalize_path(path)
        start = time.perf_counter()
        status_code = 500

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration = time.perf_counter() - start
            REQUEST_COUNT.labels(method=method, path=norm_path, status=str(status_code)).inc()
            REQUEST_LATENCY.labels(method=method, path=norm_path).observe(duration)


def get_metrics_response() -> Response:
    """Generate Prometheus metrics response."""
    return Response(
        content=generate_latest(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )
