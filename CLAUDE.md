# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A web-based GOES satellite data platform for fetching, browsing, and animating imagery from NOAA's geostationary satellites (GOES-16/18/19 and Himawari). Full-stack app with React frontend, FastAPI backend, Celery workers, PostgreSQL, and Redis.

## Common Commands

### Development
```bash
make dev                          # Start all services with hot-reload (docker-compose.dev.yml)
make prod                         # Start production stack
make clean                        # Tear down all compose stacks and volumes
```

### Backend Testing
```bash
cd backend && pytest -v --tb=short                    # All backend tests
cd backend && pytest tests/test_health.py -v          # Single test file
cd backend && pytest tests/test_health.py::test_name  # Single test
cd backend && pytest -m integration                   # Integration tests only (skipped by default)
```
Test config is in `pyproject.toml` — testpaths are `satellite_processor/core/tests` and `backend/tests`. Tests use in-memory SQLite (aiosqlite), fakeredis, and mocked Celery. The `conftest.py` auto-creates/drops tables per test and disables rate limiting.

### Frontend
```bash
cd frontend && npm install && npm run dev    # Dev server
cd frontend && npm run build                 # Production build (tsc + vite)
cd frontend && npx vitest run                # Run tests
cd frontend && npx vitest                    # Watch mode
cd frontend && npm run lint                  # ESLint
```

### Linting & Formatting
```bash
make lint                                    # Backend (ruff) + frontend (eslint)
cd backend && python -m ruff check .         # Backend lint only
cd backend && python -m ruff format .        # Backend format
pre-commit run --all-files                   # All pre-commit hooks (ruff, prettier, eslint)
```

### Database Migrations
```bash
cd backend && alembic upgrade head           # Apply migrations
cd backend && alembic revision -m "desc"     # Create new migration
```

## Architecture

### Three-Layer Structure

1. **`satellite_processor/`** — Core processing engine (standalone Python package). Image processing pipeline, file management, FFmpeg video handling, resource monitoring. No web framework dependencies.

2. **`backend/`** — FastAPI application that wraps the core engine:
   - `app/main.py` — App entry point, middleware stack, WebSocket endpoints
   - `app/routers/` — API route handlers (all under `/api/` prefix). GOES routes are under `/api/satellite/` with backward-compat rewrite from `/api/goes/`
   - `app/services/` — Business logic (GOES fetcher, catalog, gap detection, Himawari reader, storage)
   - `app/tasks/` — Celery task definitions (fetch, composite, animation, scheduling, Himawari)
   - `app/db/` — SQLAlchemy 2.0 async models and session management
   - `app/models/` — Pydantic request/response schemas

3. **`frontend/`** — React 19 + TypeScript SPA:
   - Uses Vite, Tailwind CSS v4, TanStack Query, React Router v7
   - `src/api/` — API client layer
   - `src/pages/` — Route-level page components
   - `src/components/` — Shared UI components
   - `src/hooks/` — Custom React hooks

### Key Patterns

- **Async throughout**: FastAPI with async SQLAlchemy (asyncpg for Postgres, aiosqlite for tests)
- **Real-time updates**: Redis pub/sub → WebSocket (`/ws/jobs/{id}`, `/ws/events`, `/ws/status`)
- **Task queue**: Celery workers with Redis broker; Celery Beat for periodic schedules/cleanup
- **API auth**: Optional API key via `X-API-Key` header (disabled when `API_KEY` env is empty, required in production)

## Code Style

- **Python**: Ruff for linting and formatting. Line length 120. Target Python 3.11+. Rules: E, F, I, UP, B (ignoring E501, B008, B904).
- **TypeScript/Frontend**: ESLint + Prettier via pre-commit.
- **Commits**: Conventional Commits enforced by commitlint (`feat:`, `fix:`, `chore:`, etc.)
- **CI**: GitHub Actions runs tests, lint, and frontend build on PRs. Push to `release` branch builds Docker images to GHCR.
