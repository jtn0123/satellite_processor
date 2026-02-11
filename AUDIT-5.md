# Audit #5 — Final Pre-Deployment Review

**Date:** 2026-02-11  
**Branch:** `fix/audit-4-all` (local, PR #16 pending)  
**Auditor:** Claude (fresh-eyes pass after 4 prior audits, ~90+ findings)  
**Scope:** Full codebase — backend, frontend, Docker, CI, config, tests, docs, security, performance

---

## Executive Summary

The codebase has improved dramatically across 4 audit passes. The architecture is sound — FastAPI + Celery + React is a good fit, Docker Compose is well-configured, CI covers lint/test/E2E, and most prior critical issues are fixed. **This is close to production-ready** with a handful of remaining items, most of which are low severity.

**Overall Grade: B+**

---

## Grades by Category

| Category | Grade | Notes |
|----------|-------|-------|
| Backend API | A- | Clean FastAPI, good validation, proper pagination |
| Backend Security | B+ | API key auth, path traversal protection, rate limiting |
| Database | B | Async SQLAlchemy, indexes, but no Alembic migrations |
| Celery/Tasks | B+ | Good progress tracking, cleanup, error handling |
| Frontend | A- | Modern React, lazy loading, good UX, accessible modals |
| Docker/Compose | A- | Non-root user, healthchecks, proper service deps |
| CI/CD | B+ | Test + lint + E2E + Docker build, good coverage |
| Tests | B | 1377 lines across backend/frontend/E2E, decent coverage |
| Documentation | B+ | Good README, CHANGELOG, CONTRIBUTING |
| Core Processor | C+ | Legacy code, works but needs future cleanup |
| Configuration | B | Good .env setup, but .env committed to repo |

---

## Previous Critical Fix Verification

| Fix | Status | Notes |
|-----|--------|-------|
| Param validation (#22) | ✅ Fixed | `ALLOWED_PARAM_KEYS` whitelist, path traversal checks |
| Pagination handling | ✅ Fixed | `PaginatedResponse[T]` with proper `page`/`limit`/`total` |
| Settings schema alignment (#20/#54) | ✅ Fixed | `SettingsUpdate` Pydantic model with Literal types |
| Path traversal protection (#23) | ✅ Fixed | `_validate_file_path()` resolves and checks against storage root |
| Streaming uploads | ✅ Fixed | Chunked upload with 500MB limit check |
| Rate limiting | ✅ Fixed | slowapi with per-endpoint and global limits |
| API key auth (#21) | ✅ Fixed | Optional middleware, skips health/docs/ws |
| Docker non-root (#70) | ✅ Fixed | `appuser` in backend Dockerfile |
| WebSocket reconnect | ✅ Fixed | Exponential backoff, terminal state detection |

All previously critical fixes are confirmed working.

---

## New Findings

### #99 — `.env` committed to repository with default credentials (Medium)
**File:** `.env`  
**Issue:** The `.env` file contains `POSTGRES_PASSWORD=sat` and is tracked in git. While `.gitignore` lists `.env`, the file was already committed.  
**Impact:** Credentials leak in repo history.  
**Fix:** `git rm --cached .env` and ensure it stays gitignored. Rotate any deployed credentials.

### #100 — No database migration tool (Low-Medium)
**File:** `backend/app/db/database.py`  
**Issue:** Uses `create_all()` for schema creation. No Alembic setup. Adding/changing columns in production will require manual intervention.  
**Impact:** Schema changes in production could cause data loss or downtime.  
**Fix:** Add Alembic with an initial migration. The TODO comment acknowledges this.

### #101 — `x-logging` anchor defined but never referenced (Cosmetic)
**File:** `docker-compose.yml`  
**Issue:** `x-logging: &default-logging` is defined but no service uses `logging: *default-logging`.  
**Fix:** Either apply it to services or remove the dead config.

### #102 — Backend `data/` directory with test artifacts committed (Low)
**Files:** `backend/data/uploads/*`, `backend/data/satellite_processor.db`, `data/`  
**Issue:** ~100+ test upload files (PNGs, EXEs, TXTs) and SQLite DB committed to repo. `.gitignore` has `data/` but these are already tracked.  
**Impact:** Bloats repo, leaks test data. The `.exe` files are particularly concerning for optics.  
**Fix:** `git rm -r --cached backend/data/ data/`

### #103 — WebSocket endpoint not covered by API key auth (Low)
**File:** `backend/app/main.py:52`  
**Issue:** `AUTH_SKIP_PATHS` skips `/ws/` prefixed paths from API key check. An attacker with a valid job ID can subscribe to progress without auth.  
**Impact:** Low — progress data is not sensitive, but inconsistent with API protection.  
**Fix:** Accept API key as WebSocket query param or first message if auth is enabled.

### #104 — Settings file vs settings endpoint schema mismatch (Low)
**Files:** `backend/app/routers/settings.py` vs `satellite_processor/core/settings_manager.py`  
**Issue:** The API settings (`default_crop`, `video_fps`, `video_codec`) are a separate file (`app_settings.json`) from the core processor settings (`settings.json` via `SettingsManager`). The `configure_processor()` bridge in `services/processor.py` maps between them, but the two schemas have drifted — e.g., API has `video_quality` as int (CRF 0-51), core has `video_quality` as string ("high"/"medium"/"low").  
**Impact:** Potential confusion; settings saved in the UI may not map correctly to processor behavior.  
**Fix:** Document the mapping or unify schemas.

### #105 — `ProcessingForm` sends `video` and `interpolation` as params but they're not in `ALLOWED_PARAM_KEYS` fully (Low)
**File:** `frontend/src/components/Processing/ProcessingForm.tsx`  
**Issue:** Frontend sends `video: {fps, codec, quality, interpolation}` nested in params. Backend `ALLOWED_PARAM_KEYS` includes `"video"` and `"interpolation"` so this passes validation. However, `configure_processor()` doesn't read the `video` key from params — it's only used in `create_video_task` which reads `params.get("video", {})`. For `image_process` jobs, the video settings are silently ignored.  
**Impact:** User confusion — they configure video settings for an `image_process` job type.  
**Fix:** Either separate the job creation flow (image processing vs video creation) or handle video params in both task types.

### #106 — `StorageService.save_upload()` is dead code (Cosmetic)
**File:** `backend/app/services/storage.py`  
**Issue:** `save_upload()` reads entire file into memory as bytes. The actual upload endpoint uses chunked streaming directly. `list_uploads()` is also documented as dead code.  
**Fix:** Remove dead methods or mark them clearly deprecated.

### #107 — Infinite retry potential in `VideoHandler.create_video` (Low)
**File:** `satellite_processor/core/video_handler.py`  
**Issue:** On "Temporary failure" or NVENC fallback, `create_video` recursively calls itself with no retry counter. Could stack overflow on persistent failures.  
**Impact:** Unlikely in practice but theoretically unbounded recursion.  
**Fix:** Add a retry counter parameter, max 2-3 retries.

### #108 — `creationflags=subprocess.HIGH_PRIORITY_CLASS` crashes on Linux (Low)
**File:** `satellite_processor/core/video_handler.py:_try_encode()`  
**Issue:** `HIGH_PRIORITY_CLASS` is Windows-only. On Linux, `subprocess.Popen` with this flag raises `ValueError`.  
**Impact:** `_try_encode()` is not called in the main `create_video` path (which uses `subprocess.run`), so this is only hit via legacy codepath. Low risk.  
**Fix:** Guard with `if os.name == 'nt'`.

### #109 — Frontend sends all settings fields on save including unchanged ones (Cosmetic)
**File:** `frontend/src/pages/Settings.tsx`  
**Issue:** `handleSave()` sends the entire `form` object. The backend `SettingsUpdate` model uses `exclude_none=True`, so this works but sends unnecessary data.  
**Impact:** None functionally.

### #110 — No HTTPS/TLS configuration documented (Medium for production)
**Issue:** No mention of TLS termination in docs or Docker setup. Production deployment behind a reverse proxy (Cloudflare, Traefik, etc.) is assumed but not documented.  
**Fix:** Add a "Production Deployment" section to README with TLS recommendations.

### #111 — `__pycache__` and `.coverage` committed (Cosmetic)
**Files:** Multiple `__pycache__` dirs, `.coverage`  
**Issue:** Build artifacts in repo.  
**Fix:** `git rm -r --cached` and verify `.gitignore` patterns.

### #112 — Frontend `dist/` committed to repo (Low)
**File:** `frontend/dist/*`  
**Issue:** Built frontend assets are tracked in git. Should be build-time only.  
**Fix:** `git rm -r --cached frontend/dist/` and add to `.gitignore`.

### #113 — `Makefile test` target doesn't run frontend tests (Low)
**File:** `Makefile`  
**Issue:** `make test` runs `npm run build` for frontend but not `npm test`. Should run unit tests.  
**Fix:** Add `npm test` before `npm run build` in the test target.

---

## What's Working Well

- **API design** is clean and RESTful with proper HTTP status codes
- **Error handling** is consistent via `APIError` + custom handler
- **Pagination** is properly implemented with `PaginatedResponse[T]`
- **File upload** uses chunked streaming with size limits
- **Docker Compose** production setup is solid — healthchecks, service dependencies, named volumes, non-root user
- **CI pipeline** covers backend lint/test, frontend lint/test/build, E2E with Playwright
- **WebSocket** implementation with Redis pub/sub + exponential backoff reconnection
- **Frontend** is modern, accessible (focus traps, ARIA labels), lazy-loaded, with good skeleton loading states
- **Rate limiting** on sensitive endpoints
- **Path traversal protection** on file serving endpoints

---

## Deployment Readiness

### ✅ Ready (with caveats)

The application is **deployable to a staging environment** today. For **production**, address these before launch:

#### Must-Fix Before Production (3 items)
1. **#99** — Remove `.env` from git history (credential leak)
2. **#102** — Remove committed `data/` directories and test artifacts
3. **#110** — Document TLS/HTTPS setup (or deploy behind a TLS-terminating proxy)

#### Should-Fix Soon After Launch (3 items)
4. **#100** — Set up Alembic for database migrations
5. **#112** — Remove `frontend/dist/` from git
6. **#104** — Align settings schemas between API and core processor

#### Nice-to-Have (remaining findings)
Everything else is cosmetic or low-impact.

### Production Checklist
- [ ] Remove committed secrets and data files from git
- [ ] Set strong `POSTGRES_PASSWORD` in production `.env`
- [ ] Set `API_KEY` if auth is desired
- [ ] Configure `CORS_ORIGINS` to actual domain
- [ ] Deploy behind TLS-terminating reverse proxy
- [ ] Set up log aggregation (JSON logging is already configured)
- [ ] Set up Alembic migrations before any schema changes
- [ ] Monitor disk usage (health endpoint checks for <1GB free)
- [ ] Set up backup for PostgreSQL volume

### Verdict

**Ship it.** 🚀 The 3 must-fix items are all git hygiene / deployment config — not code bugs. The application logic, API, and frontend are solid. Four audit passes have brought this from rough to production-quality.
