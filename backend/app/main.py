"""FastAPI application entry point"""

import asyncio
import hmac
import json
import logging
import shutil
import uuid as _uuid_mod
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.exc import SQLAlchemyError
from starlette.types import ASGIApp, Receive, Scope, Send

from .config import settings as app_settings
from .db.database import init_db
from .errors import APIError, api_error_handler
from .logging_config import RequestLoggingMiddleware, setup_logging
from .metrics import (
    DISK_FREE_BYTES,
    DISK_USED_BYTES,
    FRAME_COUNT,
    PrometheusMiddleware,
    get_metrics_response,
)
from .middleware.correlation import CorrelationMiddleware
from .rate_limit import limiter
from .redis_pool import close_redis_pool, get_redis_client
from .routers import (
    animations,
    download,
    errors,
    file_download,
    goes_browse,
    goes_catalog,
    goes_collections,
    goes_fetch,
    goes_frames,
    goes_tags,
    health,
    images,
    jobs,
    notifications,
    presets,
    scheduling,
    share,
    stats,
    system,
)
from .routers import settings as settings_router
from .security import RequestBodyLimitMiddleware, SecurityHeadersMiddleware
from .utils import sanitize_log

logger = logging.getLogger(__name__)
ws_logger = logging.getLogger("websocket")


class GoesToSatelliteRewriteMiddleware:
    """Backward-compat ASGI middleware: rewrite /api/goes/* → /api/satellite/* transparently."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] in ("http", "websocket"):
            path: str = scope.get("path", "")
            if path.startswith("/api/goes/") or path == "/api/goes":
                scope = dict(scope)
                scope["path"] = "/api/satellite" + path[len("/api/goes") :]
        await self.app(scope, receive, send)


# Paths that skip API key auth
#
# JTN-470: ``/api/metrics`` previously skipped auth, exposing job counts,
# Celery task names and queue depths to any anonymous caller. It now requires
# the same ``X-API-Key`` header as every other internal endpoint (when an API
# key is configured).
AUTH_SKIP_PATHS = {"/docs", "/redoc", "/openapi.json"}
AUTH_SKIP_PREFIXES = ("/api/shared/", "/api/health")
# POST /api/errors is unauthenticated (errors happen when auth fails too)
AUTH_SKIP_METHODS_PATHS = {("POST", "/api/errors")}


async def _stale_job_checker():
    """Periodically check for stale jobs every 5 minutes."""
    from .db.database import async_session
    from .services.stale_jobs import cleanup_all_stale

    while True:
        await asyncio.sleep(300)  # 5 minutes
        try:
            async with async_session() as db:
                result = await cleanup_all_stale(db)
                if result["total"]:
                    logger.info("Stale job cleanup: %s", result)
        except (SQLAlchemyError, OSError, TypeError):
            logger.warning("Stale job check failed", exc_info=True)
        except Exception:
            logger.exception("Unexpected stale job checker failure")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown events"""
    setup_logging(debug=app_settings.debug)
    await init_db()

    if not app_settings.api_key:
        if not app_settings.debug:
            raise SystemExit(
                "FATAL: API_KEY environment variable is required in production "
                "(DEBUG=false). Set API_KEY or enable DEBUG mode for development."
            )
        logger.warning(
            "API key is not set — authentication is disabled. Set API_KEY environment variable for production."
        )

    # Check for stale jobs on startup
    try:
        from .db.database import async_session
        from .services.stale_jobs import cleanup_all_stale

        async with async_session() as db:
            result = await cleanup_all_stale(db)
            if result["total"]:
                logger.info("Startup stale job cleanup: %s", result)
    except (SQLAlchemyError, OSError, TypeError):
        logger.warning("Startup stale job check failed", exc_info=True)
    except Exception:
        logger.exception("Unexpected startup cleanup failure")

    # Seed default fetch presets on startup
    try:
        import uuid as _uuid

        from sqlalchemy import select as _sel

        from .db.database import async_session as _seed_session
        from .db.models import FetchPreset as _FP
        from .routers.scheduling_presets import DEFAULT_FETCH_PRESETS

        async with _seed_session() as _db:
            for _pdef in DEFAULT_FETCH_PRESETS:
                _res = await _db.execute(_sel(_FP).where(_FP.name == _pdef["name"]))
                if _res.scalars().first():
                    continue
                _db.add(
                    _FP(
                        id=str(_uuid.uuid4()),
                        name=_pdef["name"],
                        satellite=_pdef["satellite"],
                        sector=_pdef["sector"],
                        band=_pdef["band"],
                        description=_pdef["description"],
                    )
                )
            await _db.commit()
            logger.info("Default fetch presets seeded")
    except Exception:
        logger.warning("Failed to seed default presets", exc_info=True)

    # Start periodic checker
    checker_task = asyncio.create_task(_stale_job_checker())

    yield

    checker_task.cancel()
    await close_redis_pool()


app = FastAPI(
    title=app_settings.app_name,
    lifespan=lifespan,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Custom error handler
app.add_exception_handler(APIError, api_error_handler)


# Global unhandled exception handler for consistent error envelope
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": "An unexpected error occurred"},
    )


def _verify_api_key(key: object) -> bool:
    """Timing-safe API key verification."""
    if not isinstance(key, str):
        return False
    return hmac.compare_digest(key, app_settings.api_key)


# #21: API key auth middleware (optional — disabled when API_KEY env var is empty)
@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    if app_settings.api_key:
        path = request.url.path
        skip = (
            path in AUTH_SKIP_PATHS
            or (request.method, path) in AUTH_SKIP_METHODS_PATHS
            or path.startswith("/ws/")
            or any(path.startswith(p) for p in AUTH_SKIP_PREFIXES)
        )
        if not skip:
            key = request.headers.get("X-API-Key", "")
            if not _verify_api_key(key):
                logger.warning("Rejected API request with invalid key: %s %s", request.method, sanitize_log(path))
                return JSONResponse(
                    status_code=401,
                    content={"error": "unauthorized", "detail": "Invalid or missing API key"},
                )
    return await call_next(request)


# Middleware stack (last added = outermost in Starlette)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestBodyLimitMiddleware)
app.add_middleware(CorrelationMiddleware)
app.add_middleware(PrometheusMiddleware)
app.add_middleware(RequestLoggingMiddleware)
# Backward-compat: /api/goes/* → /api/satellite/* (runs before routing)
app.add_middleware(GoesToSatelliteRewriteMiddleware)
# CORSMiddleware must be outermost so preflight responses always get CORS headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key", "Idempotency-Key"],
    expose_headers=["X-Request-ID"],
    max_age=600,
)

# Register routers
app.include_router(jobs.router)
app.include_router(images.router)
app.include_router(presets.router)
app.include_router(system.router)
app.include_router(settings_router.router)
app.include_router(goes_catalog.router)
app.include_router(goes_fetch.router)
app.include_router(goes_browse.router)
app.include_router(animations.router)
app.include_router(goes_frames.router)
app.include_router(goes_collections.router)
app.include_router(goes_tags.router)
app.include_router(health.router)
app.include_router(stats.router)
app.include_router(download.router)
app.include_router(scheduling.router)
app.include_router(notifications.router)
app.include_router(share.router)
app.include_router(file_download.router)
app.include_router(errors.router)

# Optional OpenTelemetry tracing (enabled when OTEL_EXPORTER_OTLP_ENDPOINT is set)
from .tracing import setup_tracing  # noqa: E402

setup_tracing(app)


# Alias: /api/frames → /api/satellite/frames (Bug #6)
@app.get("/api/frames", include_in_schema=False)
async def frames_alias(request: Request):
    """Redirect /api/frames to /api/satellite/frames, preserving query params."""
    query = str(request.query_params)
    url = "/api/satellite/frames"
    if query:
        url += f"?{query}"
    return RedirectResponse(url=url, status_code=307)


# ── Metrics endpoint ──────────────────────────────────────────────


@app.get("/api/metrics", include_in_schema=False)
async def metrics_endpoint():
    """Prometheus metrics endpoint."""
    # Update storage metrics on each scrape
    try:
        usage = shutil.disk_usage(app_settings.storage_path)
        DISK_FREE_BYTES.set(usage.free)
        DISK_USED_BYTES.set(usage.used)
    except OSError:
        pass

    # Update frame count
    try:
        from sqlalchemy import func, select

        from .db.database import async_session
        from .db.models import GoesFrame

        async with async_session() as session:
            count = (await session.execute(select(func.count(GoesFrame.id)))).scalar() or 0
            FRAME_COUNT.set(count)
    except (SQLAlchemyError, ImportError):
        pass

    return get_metrics_response()


# ── OpenAPI JSON fix (#2) ─────────────────────────────────────────


@app.get("/openapi.json", include_in_schema=False)
async def openapi_json():
    """Return raw OpenAPI JSON (fixes broken /openapi.json response)."""
    return JSONResponse(content=app.openapi())


# ── WebSocket ─────────────────────────────────────────────────────

WS_PING_INTERVAL = 30  # seconds
WS_TOO_MANY_CONNECTIONS = "Too many connections"
WS_MAX_CONNECTIONS_PER_IP = 10
# JTN-470: WS close codes for invalid path parameters and auth failures.
# 4400 mirrors HTTP 400 (bad request) in the private 4000-4999 range reserved
# for application use by RFC 6455.
WS_CODE_INVALID_JOB_ID = 4400
_ws_connections: dict[str, int] = {}  # ip -> count
_ws_lock = asyncio.Lock()


def _is_valid_uuid(value: str) -> bool:
    """Return True if ``value`` parses as a UUID.

    JTN-470: ``/ws/jobs/{job_id}`` previously accepted arbitrary strings
    (including 10KB payloads and SQL-injection-shaped inputs) and echoed them
    back in the ``connected`` message. We validate the parameter as a UUID
    before doing anything else to shrink the attack surface.
    """
    if not isinstance(value, str) or len(value) != 36:
        return False
    try:
        _uuid_mod.UUID(value)
    except (ValueError, AttributeError):
        return False
    return True


async def _ws_track(ip: str, delta: int) -> bool:
    """Track WS connections per IP. Returns False if limit exceeded on connect."""
    async with _ws_lock:
        count = _ws_connections.get(ip, 0) + delta
        if delta > 0 and count > WS_MAX_CONNECTIONS_PER_IP:
            return False
        _ws_connections[ip] = max(0, count)
        if _ws_connections[ip] == 0:
            _ws_connections.pop(ip, None)
        return True


async def _ws_authenticate(websocket: WebSocket) -> bool:
    """Validate API key on WebSocket connection.

    Authentication is performed in two phases:
    1. Check headers (X-API-Key, Authorization) for non-browser clients.
    2. If no header key, accept the connection and wait for a first-message
       auth payload: ``{"type": "auth", "api_key": "..."}``. This avoids
       exposing credentials in URL query parameters (visible in browser
       dev tools, server logs, and proxy access logs).

    Legacy query-param auth (``api_key=...``) is still supported for backward
    compatibility but is deprecated.

    When first-message auth is used, the connection is accepted inside this
    function; callers must check ``websocket.client_state`` before calling
    ``accept()`` again.

    Returns False if auth fails (connection is closed with 4401).
    """
    if not app_settings.api_key:
        return True

    # Phase 1: Check headers and legacy query params (pre-accept)
    key = (
        websocket.headers.get("x-api-key", "")
        or websocket.headers.get("authorization", "").removeprefix("Bearer ")
        or websocket.query_params.get("api_key", "")  # deprecated, kept for compat
    )
    if _verify_api_key(key):
        return True

    # Phase 2: Accept connection and wait for first-message auth
    await websocket.accept()
    try:
        # Wait up to 5 seconds for auth message
        msg = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
        if isinstance(msg, dict) and msg.get("type") == "auth" and _verify_api_key(msg.get("api_key", "")):
            return True
    except (TimeoutError, WebSocketDisconnect, ConnectionError, RuntimeError, json.JSONDecodeError):
        pass

    await websocket.close(code=4401, reason="Invalid or missing API key")
    return False


async def _ws_accept_if_needed(websocket: WebSocket) -> None:
    """Accept the WebSocket connection if not already accepted (first-message auth)."""
    from starlette.websockets import WebSocketState

    if websocket.client_state != WebSocketState.CONNECTED:
        await websocket.accept()


async def _ws_reader(websocket: WebSocket) -> None:
    """Read and discard client messages until disconnect."""
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass


async def _ws_writer(websocket: WebSocket, pubsub) -> None:
    """Forward Redis pub/sub messages to the WebSocket client."""
    while True:
        msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
        if msg and msg["type"] == "message":
            try:
                data = json.loads(msg["data"])
            except (json.JSONDecodeError, TypeError):
                continue
            msg_type = data.pop("type", "progress")
            await websocket.send_json({"type": msg_type, **data})
            if data.get("status") in ("completed", "failed", "cancelled"):
                break


async def _ws_ping(websocket: WebSocket) -> None:
    """Send periodic ping to keep WebSocket alive."""
    try:
        while True:
            await asyncio.sleep(WS_PING_INTERVAL)
            await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass


@app.websocket("/ws/jobs/{job_id}")
async def job_websocket(websocket: WebSocket, job_id: str):
    """WebSocket endpoint for real-time job progress via Redis pub/sub.

    JTN-470: ``job_id`` must be a valid UUID. Invalid values are rejected with
    close code 4400 before auth, rate-limit tracking, or Redis subscription.
    """
    if not _is_valid_uuid(job_id):
        # Accept briefly so we can send a structured close code; close reason
        # is echoed by some clients but never the raw job_id.
        await websocket.accept()
        ws_logger.warning(
            "WS rejected: /ws/jobs/<invalid> (len=%d) from %s",
            len(job_id) if isinstance(job_id, str) else -1,
            sanitize_log(websocket.client.host if websocket.client else "unknown"),
        )
        await websocket.close(code=WS_CODE_INVALID_JOB_ID, reason="Invalid job_id")
        return

    if not await _ws_authenticate(websocket):
        return

    client_ip = websocket.client.host if websocket.client else "unknown"
    if not await _ws_track(client_ip, 1):
        await websocket.close(code=4429, reason=WS_TOO_MANY_CONNECTIONS)
        return

    await _ws_accept_if_needed(websocket)
    ws_logger.info("WS connected: /ws/jobs/%s from %s", sanitize_log(job_id), sanitize_log(client_ip))
    r = get_redis_client()
    pubsub = r.pubsub()
    await pubsub.subscribe(f"job:{job_id}")

    try:
        await websocket.send_json({"type": "connected", "job_id": job_id})
        _, pending = await asyncio.wait(
            [
                asyncio.create_task(_ws_reader(websocket)),
                asyncio.create_task(_ws_writer(websocket, pubsub)),
                asyncio.create_task(_ws_ping(websocket)),
            ],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()
    except WebSocketDisconnect:
        ws_logger.info("WS disconnected: /ws/jobs/%s from %s", sanitize_log(job_id), sanitize_log(client_ip))
    finally:
        await _ws_track(client_ip, -1)
        await pubsub.unsubscribe(f"job:{job_id}")
        await pubsub.close()


# ── Global event WebSocket ────────────────────────────────────────

GLOBAL_EVENT_CHANNEL = "sat_processor:events"


@app.websocket("/ws/events")
async def global_events_websocket(websocket: WebSocket):
    """WebSocket for global events: new frames, schedule completions, etc."""
    if not await _ws_authenticate(websocket):
        return

    client_ip = websocket.client.host if websocket.client else "unknown"
    if not await _ws_track(client_ip, 1):
        await websocket.close(code=4429, reason=WS_TOO_MANY_CONNECTIONS)
        return

    await _ws_accept_if_needed(websocket)
    ws_logger.info("WS connected: /ws/events from %s", sanitize_log(client_ip))
    r = get_redis_client()
    pubsub = r.pubsub()
    await pubsub.subscribe(GLOBAL_EVENT_CHANNEL)

    try:
        await websocket.send_json({"type": "connected"})

        async def _event_writer():
            while True:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
                if msg and msg["type"] == "message":
                    try:
                        data = json.loads(msg["data"])
                        await websocket.send_json(data)
                    except (json.JSONDecodeError, TypeError):
                        continue

        _, pending = await asyncio.wait(
            [
                asyncio.create_task(_ws_reader(websocket)),
                asyncio.create_task(_event_writer()),
                asyncio.create_task(_ws_ping(websocket)),
            ],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()
    except WebSocketDisconnect:
        ws_logger.info("WS disconnected: /ws/events from %s", sanitize_log(client_ip))
    finally:
        await _ws_track(client_ip, -1)
        await pubsub.unsubscribe(GLOBAL_EVENT_CHANNEL)
        await pubsub.close()


# ── Status heartbeat WebSocket ────────────────────────────────────


@app.websocket("/ws/status")
async def status_websocket(websocket: WebSocket):
    """Lightweight heartbeat WebSocket used by ConnectionStatus indicator."""
    if not await _ws_authenticate(websocket):
        return

    client_ip = websocket.client.host if websocket.client else "unknown"
    if not await _ws_track(client_ip, 1):
        await websocket.close(code=4429, reason=WS_TOO_MANY_CONNECTIONS)
        return

    await _ws_accept_if_needed(websocket)
    try:
        await websocket.send_json({"type": "connected"})
        # Keep alive with pings; close when client disconnects
        while True:
            await asyncio.sleep(WS_PING_INTERVAL)
            await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    finally:
        await _ws_track(client_ip, -1)
