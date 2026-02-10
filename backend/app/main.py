"""FastAPI application entry point"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db.database import init_db
from .routers import jobs, images, presets, system


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


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/jobs/{job_id}")
async def job_websocket(websocket: WebSocket, job_id: str):
    """WebSocket endpoint stub for real-time job progress (Phase 2)"""
    await websocket.accept()
    try:
        await websocket.send_json({"type": "connected", "job_id": job_id})
        # In Phase 2, this will subscribe to Redis pub/sub for job updates
        while True:
            data = await websocket.receive_text()
            # Echo for now — will be replaced with real progress streaming
            await websocket.send_json({"type": "ack", "data": data})
    except WebSocketDisconnect:
        pass
