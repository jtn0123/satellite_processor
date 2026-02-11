# Audit #7 — Satellite Processor

**Date:** 2026-02-11
**Auditor:** Claude (automated)
**Branch:** `main` (includes merged PR #22 `feat/goes-fetch` and PR #23 `feat/ui-polish`)
**Previous audits:** #3–6 (findings #1–154)
**Finding range:** #155–#210

---

## Summary Table

| # | Category | Grade | Findings | Notes |
|---|----------|-------|----------|-------|
| 1 | Backend API | B+ | 8 | Solid REST design, good error handling, minor gaps |
| 2 | Core Processor | B | 5 | Mature but complex, some dead code remains |
| 3 | Frontend (React/TS) | B+ | 9 | Good UX, nice polish, some gaps |
| 4 | Docker & Infrastructure | A- | 4 | Production-ready compose, good health checks |
| 5 | CI/CD | B+ | 3 | Good pipeline, missing a few things |
| 6 | Tests | B | 5 | Decent coverage, some gaps |
| 7 | Documentation | B- | 4 | README exists, inline docs decent, missing pieces |
| 8 | Security | B+ | 6 | API key auth, path validation, some gaps |
| 9 | Configuration | A- | 3 | Clean pydantic-settings, well structured |
| 10 | Performance | B+ | 4 | Good throttling, streaming uploads, minor issues |
| 11 | GOES Fetch (NEW) | B | 5 | Solid S3 integration, gap detection works, rough edges |
| 12 | UI/UX Polish (NEW) | A- | 4 | Excellent dark theme, mobile nav, keyboard shortcuts |

**Overall Grade: B+**

---

## What's Good

This codebase has improved significantly across 7 audits. Notable strengths:

- **Clean architecture:** FastAPI + Celery + React with clear separation of concerns
- **Production Docker Compose** with Postgres, Redis, health checks, non-root user
- **Streaming uploads** prevent OOM on large satellite images (500MB limit, chunked)
- **WebSocket real-time progress** with exponential backoff reconnection
- **GOES S3 integration** is well-designed with proper unsigned client, gap detection, coverage stats
- **UI polish** is excellent — dark theme, mobile drawer, keyboard shortcuts, lightbox, sort/filter gallery
- **Error handling** is consistent (APIError pattern, ErrorBoundary in React)
- **Rate limiting** on all write endpoints
- **API key auth** middleware (optional, configurable)
- **Lazy loading** all routes with Suspense
- **Pre-commit hooks** with ruff, prettier, eslint
- **Good test breadth** — backend, core, frontend unit, E2E with Playwright

---

## Detailed Findings

### 1. Backend API

**#155** | Medium | `bulk_download` uses untyped `dict` payload instead of Pydantic model
`backend/app/routers/download.py:56` — `payload: dict` should be a proper Pydantic model like `BulkDeleteRequest` for validation and docs.

**#156** | Low | `x-logging` anchor defined but never referenced in `docker-compose.yml`
`docker-compose.yml:67` — `x-logging: &default-logging` is defined but no service uses `<<: *default-logging`.

**#157** | Medium | Download endpoint duplicates output listing logic from jobs router
`backend/app/routers/download.py` and `backend/app/routers/jobs.py:get_job_output` both have nearly identical file-finding logic. Should extract shared utility.

**#158** | Low | `StorageService.save_upload` is dead code — upload logic moved to router
`backend/app/services/storage.py:save_upload` reads entire file into memory as `content: bytes`. The router uses chunked streaming instead. Dead code.

**#159** | Low | `StorageService.list_uploads` is self-documented dead code
`backend/app/services/storage.py:list_uploads` — Comment says it's dead code, should be removed.

**#160** | Medium | No pagination on presets endpoint
`backend/app/routers/presets.py:list_presets` returns all presets with no limit. Could grow unbounded.

**#161** | Low | Jobs router and download router both registered under `/api/jobs` prefix
Both `jobs.py` and `download.py` use `prefix="/api/jobs"`. Works but confusing — download could use its own prefix or be in the same file.

**#162** | Info | `celery_app.py` only includes `app.tasks.processing`, not `app.tasks.goes_tasks`
`backend/app/celery_app.py:9` — `include=["app.tasks.processing"]` omits goes_tasks. Tasks still work via `delay()` import, but worker autodiscovery won't find them cleanly.

### 2. Core Processor

**#163** | Medium | `processor.py` docstring placement bug
`backend/app/services/processor.py:12-13` — Docstring `"""Configure processor settings..."""` appears AFTER the first statement (`params = to_core_settings(params)`), making it a string expression, not a docstring.

**#164** | Low | `_stage_scale` is a no-op placeholder
`satellite_processor/core/processor.py` — `_stage_scale` returns input unchanged. Either implement or remove.

**#165** | Low | `sys.path.insert(0, ...)` in services/processor.py and tasks/processing.py
Multiple `sys.path` manipulations for imports. Fragile — should use proper package installation or PYTHONPATH.

**#166** | Medium | Core processor still depends on `cv2` (OpenCV) at import time
`satellite_processor/core/processor.py` — If OpenCV isn't installed, import fails. Backend Dockerfile installs it but it's a heavy dependency. No graceful fallback.

**#167** | Low | `MAX_WORKERS_MULTIPLIER`, `MAX_WORKERS_CAP` etc. are module-level constants but not configurable
`satellite_processor/core/processor.py` — Hardcoded parallelism params. Should be configurable.

### 3. Frontend (React/TS)

**#168** | Medium | `ProcessingForm` ignores `initialParams` prop entirely
`frontend/src/components/Processing/ProcessingForm.tsx` — Props accept `initialParams` for preset loading but the component never uses it to populate form state.

**#169** | Low | `formatBytes` duplicated in `Dashboard.tsx` and `ImageGallery.tsx`
Same utility function copy-pasted. Should extract to shared util.

**#170** | Low | `useImages` hook doesn't paginate — fetches only first page
`frontend/src/hooks/useApi.ts:useImages` calls `/images` without page params. Gallery shows only first 20 images.

**#171** | Medium | No error state displayed in GoesData fetch/backfill failures
`frontend/src/pages/GoesData.tsx:107` — `fetchMutation.isError` shows generic "Failed to create fetch job" with no error detail from the API.

**#172** | Low | `JobList` client-side `limit` slicing instead of server-side
`frontend/src/components/Jobs/JobList.tsx` — Fetches ALL jobs then slices. Should pass limit as query param.

**#173** | Info | Settings page uses anti-pattern for syncing form state
`frontend/src/pages/Settings.tsx:20-23` — Calling `setForm(settings)` inside render (via `if (settings && !synced)`) is a state update during render. Should use `useEffect`.

**#174** | Low | No loading/error states in GoesData page products query
Products query has no `isLoading` or `isError` handling — selects just empty if products haven't loaded.

**#175** | Info | False color options mismatch between settings and processing form
Settings offers: vegetation/fire/natural/urban/water. ProcessingForm offers: vegetation/fire/water_vapor/dust/airmass. These should be consistent.

**#176** | Low | Video codec options mismatch between settings and processing form
Settings: h264/h265/vp9. ProcessingForm: h264/hevc/av1. Inconsistent.

### 4. Docker & Infrastructure

**#177** | Medium | No Alembic migrations — `create_all()` used in production
`backend/app/db/database.py` — TODO comment acknowledges this. Schema changes in production require manual migration.

**#178** | Low | Frontend Dockerfile references `nginx.conf` that isn't in repo
`frontend/Dockerfile:8` — `COPY nginx.conf /etc/nginx/conf.d/default.conf` but no nginx.conf visible in the file listing.

**#179** | Low | Dev compose doesn't include frontend service
`docker-compose.dev.yml` — Only api, worker, redis. Frontend dev presumably runs via `npm run dev` separately, but not documented.

**#180** | Info | No resource limits (memory/CPU) on Docker services
`docker-compose.yml` — No `deploy.resources.limits`. Worker could consume all memory on large jobs.

### 5. CI/CD

**#181** | Medium | No security scanning (Trivy, Snyk, etc.) in CI
Neither workflow scans for vulnerabilities in Docker images or dependencies.

**#182** | Low | No coverage upload to Codecov/Coveralls
Backend tests generate coverage XML but it's not uploaded anywhere for tracking.

**#183** | Info | Docker build only triggers on `release` branch, not on tags
`docker.yml` triggers on push to `release`. Tagging strategy not defined.

### 6. Tests

**#184** | Medium | No tests for GOES Celery tasks (`goes_tasks.py`)
`backend/tests/test_goes_fetcher.py` tests the fetcher service but no tests for the actual Celery task orchestration (DB updates, progress publishing).

**#185** | Medium | No tests for download router
`backend/app/routers/download.py` has no corresponding test file.

**#186** | Low | Frontend missing tests for GoesData, PresetManager, KeyboardShortcuts, VideoPlayer
New components from PR #22 and #23 have no unit tests.

**#187** | Low | E2E tests don't cover GOES data page
`frontend/e2e/` has no goes-data spec.

**#188** | Info | Coverage threshold is low — 45% backend, 35% core
`backend/pyproject.toml` and `pyproject.toml` — These are passing but leave large untested surface area.

### 7. Documentation

**#189** | Medium | No API documentation beyond auto-generated Swagger
No hand-written API guide, authentication docs, or deployment guide.

**#190** | Low | GOES feature not documented in README
PR #22 added GOES fetching but README likely doesn't cover satellite selection, gap detection, etc.

**#191** | Low | No CHANGELOG entry format or versioning policy documented
`CHANGELOG.md` exists but contributing guide doesn't specify changelog format.

**#192** | Info | `MODERNIZATION_PLAN.md` may be outdated now that modernization is done
Check if this is still relevant or should be archived.

### 8. Security

**#193** | High | WebSocket endpoint bypasses API key authentication
`backend/app/main.py:47` — `AUTH_SKIP_PATHS` doesn't cover `/ws/`, but the middleware explicitly skips all WebSocket paths: `if not path.startswith("/ws/:")`. Anyone can connect to job progress WebSocket without auth.

**#194** | Medium | Bulk download doesn't validate job ownership / no per-user isolation
`backend/app/routers/download.py` — Any authenticated user can download any job's output. No user/tenant model.

**#195** | Medium | `_get_sync_db()` uses global engine without connection pooling config
`backend/app/tasks/processing.py` and `goes_tasks.py` — Global `_sync_engine` with no pool size, timeout, or recycle settings. Could exhaust DB connections under load.

**#196** | Low | Settings file stored as plain JSON on disk with no access control
`backend/app/routers/settings.py` — `app_settings.json` is world-readable if storage permissions aren't locked down.

**#197** | Low | Redis connection in WebSocket handler not using connection pool
`backend/app/main.py:73` — Each WebSocket creates a new Redis connection. Under many concurrent viewers, could exhaust connections.

**#198** | Info | No CSRF protection (acceptable for API-only backend with API key)

### 9. Configuration

**#199** | Low | `GOES_AUTO_BACKFILL` config exists but no auto-backfill scheduler uses it
`backend/app/config.py:29` — `goes_auto_backfill: bool = False` is defined but never checked anywhere.

**#200** | Low | `CORS_ORIGINS` env var in docker-compose defaults to empty string
`docker-compose.yml:15` — `CORS_ORIGINS=${CORS_ORIGINS:-}` would result in `[""]` being parsed. Should default to something valid or omit.

**#201** | Info | No `.env.example` at root for docker-compose (only `backend/.env.example` and `.env.production.example`)
Slightly confusing — which env file to use for docker-compose?

### 10. Performance

**#202** | Medium | Zip creation in bulk download loads entire zip into memory
`backend/app/routers/download.py:62-66` — Uses `io.BytesIO()` buffer. For large outputs, this could OOM. Should stream the zip.

**#203** | Low | `useJobs` refetches every 5s, `useSystemStatus` every 5s, `useStats` every 10s, `useHealthDetailed` every 15s
Combined, this is ~30 requests/minute of background polling per browser tab. Could be heavy with multiple tabs.

**#204** | Low | Thumbnail generation is synchronous and blocks the event loop
`backend/app/routers/images.py:get_thumbnail` — PIL operations in async endpoint block the event loop. Should use `asyncio.to_thread()`.

**#205** | Info | `fetch_single_preview` has unused expression on line creating bucket lookup
`backend/app/services/goes_fetcher.py:200` — `SATELLITE_BUCKETS[closest["key"].split("/")[0]]...` result is not assigned. Dead expression.

### 11. GOES Fetch (NEW)

**#206** | Medium | `backfill_gaps` Celery task uses `asyncio.run()` inside sync task
`backend/app/tasks/goes_tasks.py:107` — Calling `asyncio.run()` works but creates a new event loop each time. If called from an already-async context, this would fail. Fragile pattern.

**#207** | Medium | No time range limit on GOES fetch requests
`backend/app/models/goes.py:GoesFetchRequest` validates end > start but doesn't limit the range. A user could request years of data, generating massive S3 listing operations.

**#208** | Low | `fetch_single_preview` creates temp file but doesn't guarantee cleanup
`backend/app/services/goes_fetcher.py:210-215` — Uses `NamedTemporaryFile(delete=False)` but never unlinks. Temp files accumulate.

**#209** | Low | GOES fetcher has no retry logic for S3 failures
Individual frame fetch failures are caught and logged but not retried. Transient S3 errors lose frames permanently.

**#210** | Info | `detect_capture_pattern` in gap_detector.py is defined but never called from any endpoint
`backend/app/services/gap_detector.py:detect_capture_pattern` — Useful function but dead code from the API perspective.

### 12. UI/UX Polish (NEW)

**#211** | Low | Mobile drawer doesn't trap focus (accessibility)
`frontend/src/components/Layout.tsx` — Drawer opens with overlay but doesn't trap tab focus inside, unlike the image preview modal which does.

**#212** | Low | Keyboard shortcuts don't show on mobile (no discoverable affordance)
`?` shortcut only works with physical keyboard. Mobile users have no way to discover navigation shortcuts.

**#213** | Info | Gap timeline visualization doesn't handle edge case of single gap spanning full range
The green background is always shown under gaps, which is confusing when coverage is 0%.

**#214** | Info | DonutChart SVG text doesn't scale well at very small sizes
`frontend/src/components/System/DonutChart.tsx` — Font size is hardcoded at 18px regardless of container size.

---

## Priority Summary

### Critical: 0
### High: 1
- **#193** WebSocket bypasses API key auth

### Medium: 11
- #155 Untyped bulk download payload
- #157 Duplicated output listing logic
- #160 No pagination on presets
- #163 Misplaced docstring
- #168 initialParams prop ignored
- #177 No Alembic migrations
- #181 No security scanning in CI
- #184 No tests for GOES tasks
- #185 No tests for download router
- #202 Zip creation loads into memory
- #206 asyncio.run() in Celery task
- #207 No time range limit on GOES fetch

### Low: 25
### Info: 10

---

## Top 10 Recommended Actions

1. **Fix WebSocket auth bypass (#193)** — Add API key check to WebSocket handshake
2. **Add time range limit to GOES fetch (#207)** — Cap at e.g. 24 hours per request
3. **Implement `initialParams` in ProcessingForm (#168)** — Presets don't actually load
4. **Add Alembic migrations (#177)** — Essential before any schema changes in production
5. **Add security scanning to CI (#181)** — Trivy for Docker images, pip-audit for deps
6. **Write tests for download router and GOES tasks (#184, #185)** — Key untested surfaces
7. **Fix the `configure_processor` docstring bug (#163)** — Docstring after code statement
8. **Include `goes_tasks` in Celery autodiscovery (#162)** — Explicit is better
9. **Stream zip responses for bulk download (#202)** — Prevent OOM on large outputs
10. **Run thumbnail generation in thread (#204)** — Stop blocking the async event loop

---

*Total findings: 60 (#155–#214)*
*Overall grade: **B+** — A solid, well-architected application with good UI polish. The codebase has matured significantly. Main gaps are in test coverage for new features, a WebSocket auth hole, and some rough edges in the GOES integration.*
