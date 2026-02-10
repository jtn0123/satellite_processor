"""FastAPI application entry point"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db.database import init_db
from .routers import jobs, images, presets, system, settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown events"""
    await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(jobs.router)
app.include_router(images.router)
app.include_router(presets.router)
app.include_router(system.router)
app.include_router(settings.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/jobs/{job_id}")
async def job_websocket(websocket: WebSocket, job_id: str):
    """WebSocket endpoint for real-time job progress via Redis pub/sub"""
    import asyncio
    import json
    import redis.asyncio as aioredis
    from .config import settings

    await websocket.accept()
    r = aioredis.from_url(settings.redis_url)
    pubsub = r.pubsub()
    await pubsub.subscribe(f"job:{job_id}")

    try:
        await websocket.send_json({"type": "connected", "job_id": job_id})
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
            if msg and msg["type"] == "message":
                data = json.loads(msg["data"])
                await websocket.send_json({"type": "progress", **data})
                # Close after terminal states
                if data.get("status") in ("completed", "failed", "cancelled"):
                    await websocket.send_json({"type": "done", "status": data["status"]})
                    break
            # Check if client disconnected by trying to receive with short timeout
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=0.01)
            except asyncio.TimeoutError:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"job:{job_id}")
        await pubsub.close()
        await r.close()
