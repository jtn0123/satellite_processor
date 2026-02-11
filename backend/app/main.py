"""FastAPI application entry point"""

import asyncio
import json
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
from .rate_limit import limiter
from .routers import health, images, jobs, presets, system
from .routers import settings as settings_router

# Paths that skip API key auth
AUTH_SKIP_PATHS = {"/api/health", "/docs", "/redoc", "/openapi.json"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown events"""
    setup_logging(debug=app_settings.debug)
    await init_db()
    yield


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


# #21: API key auth middleware (optional — disabled when API_KEY env var is empty)
@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    if app_settings.api_key:
        path = request.url.path
        if path not in AUTH_SKIP_PATHS and not path.startswith("/ws/"):
            key = request.headers.get("X-API-Key", "")
            if key != app_settings.api_key:
                return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
    return await call_next(request)


# Middleware
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)

# Register routers
app.include_router(jobs.router)
app.include_router(images.router)
app.include_router(presets.router)
app.include_router(system.router)
app.include_router(settings_router.router)
app.include_router(health.router)


@app.websocket("/ws/jobs/{job_id}")
async def job_websocket(websocket: WebSocket, job_id: str):
    """WebSocket endpoint for real-time job progress via Redis pub/sub"""
    import redis.asyncio as aioredis

    await websocket.accept()
    r = aioredis.from_url(app_settings.redis_url)
    pubsub = r.pubsub()
    await pubsub.subscribe(f"job:{job_id}")

    try:
        await websocket.send_json({"type": "connected", "job_id": job_id})

        async def reader():
            try:
                while True:
                    await websocket.receive_text()
            except WebSocketDisconnect:
                pass

        async def writer():
            while True:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
                if msg and msg["type"] == "message":
                    try:
                        data = json.loads(msg["data"])
                    except (json.JSONDecodeError, TypeError):
                        continue
                    await websocket.send_json({"type": "progress", **data})
                    if data.get("status") in ("completed", "failed", "cancelled"):
                        break

        done, pending = await asyncio.wait(
            [asyncio.create_task(reader()), asyncio.create_task(writer())],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"job:{job_id}")
        await pubsub.close()
        await r.close()
