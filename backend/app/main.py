"""FastAPI application entry point"""

import asyncio
import json
import logging
import shutil
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

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
from .rate_limit import limiter
from .redis_pool import close_redis_pool, get_redis_client
from .routers import (
    animations,
    download,
    goes,
    goes_data,
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

logger = logging.getLogger(__name__)

# Paths that skip API key auth
AUTH_SKIP_PATHS = {"/api/health", "/api/metrics", "/docs", "/redoc", "/openapi.json"}
AUTH_SKIP_PREFIXES = ("/api/shared/",)


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
        except Exception:
            logger.debug("Stale job check failed", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown events"""
    setup_logging(debug=app_settings.debug)
    await init_db()

    # Check for stale jobs on startup
    try:
        from .db.database import async_session
        from .services.stale_jobs import cleanup_all_stale

        async with async_session() as db:
            result = await cleanup_all_stale(db)
            if result["total"]:
                logger.info("Startup stale job cleanup: %s", result)
    except Exception:
        logger.debug("Startup stale job check failed", exc_info=True)

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


# #21: API key auth middleware (optional — disabled when API_KEY env var is empty)
@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    if app_settings.api_key:
        path = request.url.path
        if path not in AUTH_SKIP_PATHS and not path.startswith("/ws/") and not any(path.startswith(p) for p in AUTH_SKIP_PREFIXES):
            key = request.headers.get("X-API-Key", "")
            if key != app_settings.api_key:
                return JSONResponse(status_code=401, content={"error": "unauthorized", "detail": "Invalid or missing API key"})
    return await call_next(request)


# Middleware stack (order matters — outermost first)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestBodyLimitMiddleware)
app.add_middleware(PrometheusMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
    expose_headers=["X-Request-ID"],
    max_age=600,
)

# Register routers
app.include_router(jobs.router)
app.include_router(images.router)
app.include_router(presets.router)
app.include_router(system.router)
app.include_router(settings_router.router)
app.include_router(goes.router)
app.include_router(animations.router)
app.include_router(goes_data.router)
app.include_router(health.router)
app.include_router(stats.router)
app.include_router(download.router)
app.include_router(scheduling.router)
app.include_router(notifications.router)
app.include_router(share.router)


# ── Metrics endpoint ──────────────────────────────────────────────


@app.get("/api/metrics", include_in_schema=False)
async def metrics_endpoint():
    """Prometheus metrics endpoint."""
    # Update storage metrics on each scrape
    try:
        usage = shutil.disk_usage(app_settings.storage_path)
        DISK_FREE_BYTES.set(usage.free)
        DISK_USED_BYTES.set(usage.used)
    except Exception:
        pass

    # Update frame count
    try:
        from sqlalchemy import func, select

        from .db.database import async_session
        from .db.models import GoesFrame

        async with async_session() as session:
            count = (await session.execute(select(func.count(GoesFrame.id)))).scalar() or 0
            FRAME_COUNT.set(count)
    except Exception:
        pass

    return get_metrics_response()


# ── OpenAPI JSON fix (#2) ─────────────────────────────────────────


@app.get("/openapi.json", include_in_schema=False)
async def openapi_json():
    """Return raw OpenAPI JSON (fixes broken /openapi.json response)."""
    return JSONResponse(content=app.openapi())


# ── WebSocket ─────────────────────────────────────────────────────

WS_PING_INTERVAL = 30  # seconds
WS_MAX_CONNECTIONS_PER_IP = 10
_ws_connections: dict[str, int] = {}  # ip -> count


def _ws_track(ip: str, delta: int) -> bool:
    """Track WS connections per IP. Returns False if limit exceeded on connect."""
    count = _ws_connections.get(ip, 0) + delta
    if delta > 0 and count > WS_MAX_CONNECTIONS_PER_IP:
        return False
    _ws_connections[ip] = max(0, count)
    if _ws_connections[ip] == 0:
        _ws_connections.pop(ip, None)
    return True


async def _ws_authenticate(websocket: WebSocket) -> bool:
    """Validate API key on WebSocket handshake. Returns False if auth fails."""
    if not app_settings.api_key:
        return True
    key = websocket.query_params.get("api_key", "") or websocket.headers.get("x-api-key", "")
    if key != app_settings.api_key:
        await websocket.close(code=4401, reason="Invalid or missing API key")
        return False
    return True


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
    """WebSocket endpoint for real-time job progress via Redis pub/sub"""
    if not await _ws_authenticate(websocket):
        return

    client_ip = websocket.client.host if websocket.client else "unknown"
    if not _ws_track(client_ip, 1):
        await websocket.close(code=4429, reason="Too many connections")
        return

    await websocket.accept()
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
        pass
    finally:
        _ws_track(client_ip, -1)
        await pubsub.unsubscribe(f"job:{job_id}")
        await pubsub.close()


# ── Global event WebSocket ────────────────────────────────────────

GLOBAL_EVENT_CHANNEL = "sat_processor:events"


@app.websocket("/ws/events")
async def global_events_websocket(websocket: WebSocket):
    """WebSocket for global events: new frames, schedule completions, etc."""
    if not await _ws_authenticate(websocket):
        return

    await websocket.accept()
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
        pass
    finally:
        await pubsub.unsubscribe(GLOBAL_EVENT_CHANNEL)
        await pubsub.close()


# ── Status heartbeat WebSocket ────────────────────────────────────


@app.websocket("/ws/status")
async def status_websocket(websocket: WebSocket):
    """Lightweight heartbeat WebSocket used by ConnectionStatus indicator."""
    if not await _ws_authenticate(websocket):
        return

    await websocket.accept()
    try:
        await websocket.send_json({"type": "connected"})
        # Keep alive with pings; close when client disconnects
        while True:
            await asyncio.sleep(WS_PING_INTERVAL)
            await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
