# Satellite Processor

Web application for processing GOES satellite imagery — upload images, apply false color, crop regions, add timestamps, and generate timelapse videos, all from your browser.

## Architecture

```
Browser ──► Nginx (React SPA) ──► FastAPI (REST + WebSocket) ──► Celery Worker
                                         │                            │
                                    PostgreSQL                     Redis
                                    (jobs, images)              (task queue)
                                         │
                                    Shared Volume (/data)
```

**Services:**
- **Frontend** — React 18 + TypeScript + Vite + TailwindCSS (served via Nginx)
- **API** — FastAPI with async SQLAlchemy, WebSocket for live job progress
- **Worker** — Celery worker running the core `satellite_processor` engine
- **PostgreSQL** — Job history, image metadata, presets
- **Redis** — Celery broker + result backend

## Quick Start

```bash
# Production (all 5 services, detached)
docker compose up --build -d

# Open in browser
open http://localhost:3000
```

## Development

```bash
# Dev mode (hot-reload for backend, SQLite instead of Postgres)
make dev

# Or manually:
docker compose -f docker-compose.dev.yml up --build
```

Frontend dev server (outside Docker):
```bash
cd frontend && npm install && npm run dev
```

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start dev environment with hot-reload |
| `make prod` | Start production stack (detached) |
| `make test` | Run backend + frontend tests |
| `make clean` | Stop all containers and remove volumes |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/images/upload` | Upload satellite images (multipart) |
| `GET` | `/api/images` | List uploaded images with metadata |
| `DELETE` | `/api/images/{id}` | Delete an image |
| `POST` | `/api/jobs` | Create processing job |
| `GET` | `/api/jobs` | List all jobs |
| `GET` | `/api/jobs/{id}` | Job detail + progress |
| `DELETE` | `/api/jobs/{id}` | Cancel/delete job |
| `GET` | `/api/jobs/{id}/output` | Download processed output |
| `WS` | `/ws/jobs/{id}` | Real-time progress stream |
| `GET` | `/api/presets` | List processing presets |
| `POST` | `/api/presets` | Save preset |
| `GET` | `/api/system/status` | System resource usage |
| `GET` | `/api/health` | Basic health check |
| `GET` | `/api/health/detailed` | Detailed health (DB, Redis, disk) |
| `GET` | `/api/goes/products` | List available GOES satellites/bands |
| `POST` | `/api/goes/fetch` | Fetch GOES frames for a time range (max 24h) |
| `GET` | `/api/goes/gaps` | Analyze coverage gaps |
| `POST` | `/api/goes/backfill` | Auto-fill detected gaps |
| `GET` | `/api/jobs/{id}/download` | Download job output (single file or zip) |
| `POST` | `/api/jobs/bulk-download` | Download outputs from multiple jobs |

## GOES Satellite Data

The GOES Data page lets you fetch imagery directly from NOAA's public S3 buckets:

- **Satellites:** GOES-16, GOES-18, GOES-19
- **Sectors:** FullDisk, CONUS, Mesoscale1, Mesoscale2
- **Bands:** C01–C16 (all 16 ABI bands)
- **Time Range:** Max 24 hours per fetch request
- **Gap Detection:** Automatically finds missing frames in your collection
- **Backfill:** One-click gap filling fetches missing frames

Fetched frames are converted from NetCDF to PNG and added to your image library.

## Development Setup

### Pre-commit Hooks

This project uses [pre-commit](https://pre-commit.com/) for automated linting and formatting:

```bash
pip install pre-commit
pre-commit install
```

Hooks will run automatically on `git commit`. To run manually:

```bash
pre-commit run --all-files
```

### Dev Dependencies

```bash
pip install -r requirements-dev.txt
```

## CI/CD

- **PRs** → runs Python tests, frontend build check, linting (`.github/workflows/test.yml`)
- **Push to `release`** → builds and pushes Docker images to GHCR (`.github/workflows/docker.yml`)

## License

MIT
