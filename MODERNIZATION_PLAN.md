# Satellite Processor — Web Modernization Plan

## Overview

Transform the PyQt6 desktop app into a Docker-deployed web application with a React frontend and FastAPI backend, accessible from any browser. Same VoltTracker-style proxy pattern for external access.

---

## Current Architecture

```
satellite_processor/
├── core/           ← Processing engine (3,400 LOC) — THIS STAYS
│   ├── processor.py          (1032 LOC) — Main orchestrator, Qt signals
│   ├── video_handler.py      (1182 LOC) — FFmpeg video creation
│   ├── image_operations.py   (637 LOC)  — Crop, false color, timestamps
│   ├── file_manager.py       (233 LOC)  — File discovery & ordering
│   ├── settings_manager.py   (133 LOC)  — JSON settings persistence
│   ├── resource_monitor.py   (74 LOC)   — CPU/RAM/GPU monitoring
│   ├── progress_tracker.py   (52 LOC)   — Progress tracking
│   └── utils.py              (37 LOC)   — Timestamp parsing
├── gui/            ← PyQt6 desktop GUI — REPLACED BY WEB
└── utils/          ← Helpers, logging, presets
```

**Key Insight:** The `core/` module is well-separated from the GUI. The main coupling is `processor.py` using Qt signals (`pyqtSignal`) for progress/status updates. We need to decouple those into callbacks or events.

---

## Target Architecture

```
┌─────────────────────────────────────────────────┐
│                 Docker Compose                   │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │  Nginx   │  │  FastAPI  │  │ Celery Worker │ │
│  │ (React   │→ │  (API +   │→ │ (Processing   │ │
│  │  SPA)    │  │  WebSocket│  │  Jobs)        │ │
│  └──────────┘  └──────────┘  └───────────────┘ │
│                      │              │            │
│                ┌─────┴─────┐  ┌────┴────┐       │
│                │ PostgreSQL │  │  Redis  │       │
│                │ (Jobs, DB) │  │ (Queue) │       │
│                └───────────┘  └─────────┘       │
│                                                  │
│  Volumes: /data/input, /data/output, /data/temp  │
└─────────────────────────────────────────────────┘
         │
    Reverse Proxy (Cloudflare/Nginx)
         │
    Browser Access
```

---

## Detailed Phase Plan

### Phase 1: Core Decoupling & FastAPI Backend

**Goal:** Strip Qt dependencies from `core/`, wrap with FastAPI REST endpoints.

#### 1a. Decouple core from Qt
- Remove `pyqtSignal` from `processor.py` — replace with callback functions
- Remove `QObject`/`QThread` inheritance — use plain Python classes
- Remove `PyQt6` imports from all `core/` files
- Create `core_decoupled/` as a clean copy (or refactor in-place on a branch)
- Keep `PresetManager` but swap `QSettings` → JSON file storage
- **Tests should still pass** after decoupling (minus Qt-specific ones)

#### 1b. FastAPI application
```
backend/
├── app/
│   ├── main.py              # FastAPI app, CORS, lifespan
│   ├── config.py            # Settings (pydantic-settings)
│   ├── models/
│   │   ├── job.py           # Job schema (id, status, params, progress, results)
│   │   └── settings.py      # Processing settings schema
│   ├── routers/
│   │   ├── jobs.py          # POST /jobs, GET /jobs, GET /jobs/{id}, DELETE /jobs/{id}
│   │   ├── images.py        # POST /images/upload, GET /images, GET /images/{id}
│   │   ├── presets.py       # CRUD /presets
│   │   ├── system.py        # GET /system/status (CPU, RAM, disk)
│   │   └── ws.py            # WebSocket /ws/jobs/{id} for live progress
│   ├── services/
│   │   ├── processor.py     # Wraps core processor, translates callbacks → events
│   │   └── storage.py       # File storage management
│   ├── tasks/
│   │   └── processing.py    # Celery tasks for image/video processing
│   └── db/
│       ├── database.py      # SQLAlchemy async engine
│       └── models.py        # ORM models (Job, Image, Preset)
├── requirements.txt
└── Dockerfile
```

**API Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/images/upload` | Upload satellite images (multipart) |
| GET | `/api/images` | List uploaded images with metadata |
| DELETE | `/api/images/{id}` | Delete an uploaded image |
| POST | `/api/jobs` | Create processing job (params: crop, false color, timestamp, video settings) |
| GET | `/api/jobs` | List all jobs with status |
| GET | `/api/jobs/{id}` | Job detail + progress |
| DELETE | `/api/jobs/{id}` | Cancel/delete job |
| GET | `/api/jobs/{id}/output` | Download processed output (images/video) |
| WS | `/ws/jobs/{id}` | Real-time progress stream |
| GET | `/api/presets` | List processing presets |
| POST | `/api/presets` | Save preset |
| DELETE | `/api/presets/{name}` | Delete preset |
| GET | `/api/system/status` | System resource monitor |
| GET | `/api/settings` | Get current settings |
| PUT | `/api/settings` | Update settings |

#### 1c. Database schema
```sql
-- Jobs table
CREATE TABLE jobs (
    id UUID PRIMARY KEY,
    status VARCHAR(20),  -- pending, processing, completed, failed, cancelled
    job_type VARCHAR(20), -- image_process, video_create
    params JSONB,
    progress INTEGER DEFAULT 0,
    status_message TEXT,
    input_path TEXT,
    output_path TEXT,
    error TEXT,
    created_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- Images table  
CREATE TABLE images (
    id UUID PRIMARY KEY,
    filename TEXT,
    original_name TEXT,
    file_path TEXT,
    file_size BIGINT,
    width INTEGER,
    height INTEGER,
    satellite VARCHAR(20),  -- GOES-16, GOES-18
    channel VARCHAR(10),
    captured_at TIMESTAMP,  -- Parsed from GOES filename
    uploaded_at TIMESTAMP
);

-- Presets table
CREATE TABLE presets (
    id UUID PRIMARY KEY,
    name VARCHAR(100) UNIQUE,
    params JSONB,
    created_at TIMESTAMP
);
```

---

### Phase 2: Celery Workers + WebSocket Progress

**Goal:** Async processing with real-time progress updates.

- **Celery tasks** wrap the core processor:
  - `process_images_task(job_id, params)` — batch image processing
  - `create_video_task(job_id, params)` — video creation from processed images
- **Progress callbacks** from the decoupled processor → Redis pub/sub → WebSocket
- **Job lifecycle:** `pending` → `processing` → `completed`/`failed`
- **Cancellation:** Signal Celery to revoke task, update job status
- **Resource monitoring:** Periodic task reports CPU/RAM/GPU usage

```python
# Example: Celery task wrapping the processor
@celery_app.task(bind=True)
def process_images_task(self, job_id: str, params: dict):
    processor = SatelliteImageProcessor()
    
    def on_progress(message: str, percent: int):
        # Push to Redis pub/sub → WebSocket picks it up
        redis.publish(f"job:{job_id}", json.dumps({
            "progress": percent, "message": message
        }))
        # Also update DB
        update_job_progress(job_id, percent, message)
    
    processor.on_progress = on_progress
    processor.process_batch(params)
```

---

### Phase 3: React Frontend

**Goal:** Modern, responsive UI for all processing workflows.

```
frontend/
├── src/
│   ├── components/
│   │   ├── Layout/            # Sidebar nav, header, theme
│   │   ├── Upload/            # Drag-and-drop image upload zone
│   │   ├── ImageGallery/      # Grid view of uploaded satellite images
│   │   ├── ImagePreview/      # Full-size image viewer with metadata
│   │   ├── ProcessingForm/    # Configure processing params (crop, color, etc.)
│   │   ├── JobMonitor/        # Real-time job progress with WebSocket
│   │   ├── VideoPlayer/       # In-browser video playback of results
│   │   ├── PresetManager/     # Save/load/delete processing presets
│   │   └── SystemMonitor/     # CPU/RAM/GPU gauges (like current Qt widget)
│   ├── hooks/
│   │   ├── useWebSocket.ts    # WebSocket hook for job progress
│   │   └── useApi.ts          # API client hook
│   ├── pages/
│   │   ├── Dashboard.tsx      # Overview: recent jobs, system status
│   │   ├── Upload.tsx         # Upload & manage satellite images
│   │   ├── Process.tsx        # Configure & launch processing jobs
│   │   ├── Jobs.tsx           # Job history & monitoring
│   │   └── Settings.tsx       # App settings & preferences
│   ├── api/
│   │   └── client.ts          # Typed API client (axios/fetch)
│   └── App.tsx
├── package.json
├── vite.config.ts
├── tsconfig.json
└── Dockerfile
```

**Key UI Features:**
- **Drag-and-drop upload** with progress bars, auto-detection of GOES metadata from filenames
- **Image gallery** with thumbnail grid, sortable by date/satellite/channel
- **Processing config panel** — mirrors current Qt options: crop region (visual selector on image), false color method, timestamp toggle, video codec/FPS/quality
- **Live job monitor** — progress bar, log stream, ETA, resource usage (all via WebSocket)
- **Video player** — play result videos in-browser, download button
- **Dark theme** — satellite imagery looks best on dark backgrounds
- **Mobile responsive** — check on your phone

**Tech:**
- React 18 + TypeScript
- Vite for build
- TailwindCSS for styling
- Shadcn/ui component library
- React Query for data fetching
- Recharts for system monitor graphs

---

### Phase 4: Docker & Deployment

**Goal:** One `docker compose up` to run everything.

```yaml
# docker-compose.yml
services:
  frontend:
    build: ./frontend
    ports: ["3000:80"]
    depends_on: [api]

  api:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      - DATABASE_URL=postgresql://sat:sat@db/satellite_processor
      - REDIS_URL=redis://redis:6379
      - STORAGE_PATH=/data
    volumes:
      - sat-data:/data
    depends_on: [db, redis]

  worker:
    build: ./backend
    command: celery -A app.tasks worker --loglevel=info --concurrency=4
    environment:
      - DATABASE_URL=postgresql://sat:sat@db/satellite_processor
      - REDIS_URL=redis://redis:6379
      - STORAGE_PATH=/data
    volumes:
      - sat-data:/data
    depends_on: [db, redis]

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: satellite_processor
      POSTGRES_USER: sat
      POSTGRES_PASSWORD: sat
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

volumes:
  sat-data:
  pgdata:
```

**CI/CD (GitHub Actions):**
- `test.yml` — Python tests + frontend tests + lint on PRs
- `docker.yml` — Build & push to GHCR on `release` branch (same as VoltTracker)
- Watchtower for auto-deploy on server

**Reverse Proxy:**
- Nginx or Caddy in front, SSL termination
- Same pattern as VoltTracker for external access via neuhard.dev subdomain (e.g., `sat.neuhard.dev`)

---

### Phase 5: Polish & Extended Features

- **Authentication:** Simple token/password auth (or OAuth if needed)
- **Image gallery enhancements:** Timeline view, satellite orbit visualization
- **Batch scheduling:** Queue multiple jobs, priority ordering
- **Notifications:** Job complete → Discord webhook or push notification
- **GOES data auto-fetch:** Scheduled download from NOAA servers (cron job in container)
- **Map overlay:** Show satellite coverage area on a map
- **Comparison view:** Side-by-side before/after processing
- **Export options:** GIF, WebM, individual frame download as ZIP

---

## Migration Strategy

1. **Branch:** `feature/web-modernization` 
2. **Keep Qt GUI working** on `main` during migration
3. **Core refactor first** — decouple from Qt, ensure tests pass
4. **Backend + frontend** built in parallel on feature branch
5. **Merge when MVP works** — upload, process, view results via browser
6. **Iterate** — add features in subsequent PRs

## Dependencies (New)

**Backend:**
- fastapi, uvicorn, python-multipart
- sqlalchemy[asyncio], asyncpg, alembic
- celery, redis
- pydantic-settings
- websockets

**Frontend:**
- react, react-dom, react-router-dom
- typescript, vite
- tailwindcss, @shadcn/ui
- @tanstack/react-query
- axios

**Infra:**
- Docker, docker-compose
- PostgreSQL 16
- Redis 7
- Nginx (frontend serving + reverse proxy)

---

## Estimated Timeline

| Phase | Scope | Effort |
|-------|-------|--------|
| Phase 1 | Core decouple + FastAPI | 2-3 sessions |
| Phase 2 | Celery + WebSocket | 1-2 sessions |
| Phase 3 | React frontend | 3-4 sessions |
| Phase 4 | Docker + CI/CD | 1 session |
| Phase 5 | Polish | Ongoing |

**MVP (upload → process → view):** ~5-6 sessions
