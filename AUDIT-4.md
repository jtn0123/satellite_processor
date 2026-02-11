# Satellite Processor — Audit Report #4

**Date:** 2026-02-11  
**Commit:** `a2073c9` (main)  
**Auditor:** Claude (automated)  
**Previous:** AUDIT-3 found 76 issues; 53 were fixed in PR #15. This audit reviews the 23 remaining + does a fresh pass.

---

## Part 1: Status of 23 Remaining AUDIT-3 Findings (#33–39, #56–69)

### Testing (#33–39)

| # | Finding | Status | Notes |
|---|---------|--------|-------|
| 33 | No test for WebSocket endpoint | **Still open** | No WebSocket test exists in `backend/tests/`. The WS handler in `main.py` remains untested. |
| 34 | No test for Celery tasks | **Still open** | `backend/app/tasks/processing.py` has no unit tests. Tasks are only tested indirectly through job endpoint tests with mocked `celery_app.send_task`. |
| 35 | Frontend lint failures ignored (`\|\| true`) | **Fixed** ✅ | `.github/workflows/test.yml` now runs `npm run lint || true` — wait, this is still `|| true`. **Still open.** |
| 36 | Coverage threshold is 35% | **Partially fixed** | Root `pyproject.toml` still has `fail_under = 35`. Backend `pyproject.toml` has `fail_under = 45`. Improvement but still low. |
| 37 | No integration test for Docker compose | **Still open** | No smoke test for the full stack. |
| 38 | E2E tests run against built static files only | **Still open** | Playwright config starts only the frontend (`npm run preview`), no backend. E2E tests can only test client-side routing. |
| 39 | `test_health.py` is minimal | **Fixed** ✅ | Now tests both `/api/health` and `/api/health/detailed` with checks for all categories (database, redis, disk, storage). |

### Docker/DevOps (#56–62)

| # | Finding | Status | Notes |
|---|---------|--------|-------|
| 56 | No health check on API container | **Still open** | `docker-compose.yml` still has no `healthcheck` for `api` or `worker` services. |
| 57 | No non-root user in backend Dockerfile | **Still open** | `backend/Dockerfile` still runs as root. No `USER` directive. |
| 58 | No `.dockerignore` | **Fixed** ✅ | `.dockerignore` exists at repo root with sensible exclusions. Frontend also has `frontend/.dockerignore`. |
| 59 | Dev compose doesn't have Redis health check | **Still open** | `docker-compose.dev.yml` Redis service has no `healthcheck`. |
| 60 | Worker and API share same Dockerfile | **Still open** | Acknowledged design choice; worker image still includes uvicorn. Not critical. |
| 61 | No resource limits | **Still open** | No `mem_limit`, `cpus`, or `deploy` constraints on any service. |
| 62 | No log rotation configuration | **Still open** | Docker services still use default logging. |

### Documentation (#63–69)

| # | Finding | Status | Notes |
|---|---------|--------|-------|
| 63 | README references `app.py` desktop GUI | **Still open** | README still says "The original PyQt6 desktop application is still available" with `python app.py`. No `app.py` exists. |
| 64 | Health endpoints not documented | **Partially fixed** | Health endpoints still missing from the API table in README, though `/docs` link is in the sidebar. |
| 65 | No API schema/OpenAPI docs mention | **Fixed** ✅ | Layout sidebar includes "API Docs" link to `/docs`. Nginx proxies `/docs`, `/redoc`, `/openapi.json`. |
| 66 | No CONTRIBUTING.md | **Still open** | No contribution guidelines exist. |
| 67 | No CHANGELOG | **Still open** | No changelog. |
| 68 | `MODERNIZATION_PLAN.md` may be stale | **Still open** | Still references Phase 1/2/3/4 plan structure. Useful as historical context but should be marked as completed or archived. |
| 69 | Frontend README is boilerplate | **Still open** | `frontend/README.md` is still Vite default boilerplate. |

### Summary: 8 fixed, 15 still open from AUDIT-3

---

## Part 2: Fresh Audit Findings

### 1. Code Quality — Grade: B+

Previous issues #1 (duplicate parsing), #2 (duplicate processor config), #3 (dead ProcessorService), #4 (unused imports), #5 (deprecated utcnow), #8 (sys.path hacks), #9 (inconsistent type annotations), #10 (debug comments) were all addressed in the fix PR. Current state:

- **#8 partially remains:** `sys.path.insert` still exists in `backend/app/tasks/processing.py:14` and `backend/app/services/processor.py:10`. These are needed as a workaround because `satellite_processor` isn't installed as a package.
- **#9 partially remains:** Core module files still use old-style `typing.List`, `typing.Dict`, `typing.Optional` (7 files). Backend code uses modern syntax. Cosmetic but inconsistent.
- **#4 partially remains:** `Layout.tsx` still imports `FlaskConical` and `FileText` — but `FlaskConical` is now used in `Dashboard.tsx` (not Layout), and `FileText` is used for the API Docs link in Layout. So `FlaskConical` is unused in Layout but imported. Minor.

**77.** **`ProcessingForm` sends params that fail backend validation** — The frontend `ProcessingForm` sends `crop`, `false_color`, `timestamp`, `scale`, `video` as param keys. The backend `JobCreate.validate_params()` has `ALLOWED_PARAM_KEYS` that does NOT include `crop`, `false_color`, `timestamp`, `scale`, or `video`. This means submitting a job from the Process page will return a 422 error. The frontend and backend param schemas are out of sync. **Severity: High — core workflow is broken.**

**78.** **`useImages` and `useJobs` hooks don't handle paginated response** — Backend returns `{ items, total, page, limit }` but `useImages()` returns `r.data` directly. Components like `Dashboard` do `(images as unknown[]).length` which would be wrong since `data` is now the pagination wrapper, not the array. `ImageGallery` does `(images as SatImage[]).map(...)` — this would fail at runtime since `images` is the paginated object. **Severity: High — frontend is broken after pagination was added.**

**79.** **`useJobs` same pagination mismatch** — `useJobs()` returns the paginated wrapper but `Dashboard` and `JobList` treat it as an array. `JobList` does `(jobs as Job[]).slice(0, limit)` on the paginated object.  **Severity: High.**

**80.** **Test data in workspace but not gitignored explicitly** — `backend/data/uploads/` contains 106 test files locally. These aren't currently tracked by git (good), but there's no `backend/data/` entry in `.gitignore` — they're excluded by the root `.dockerignore` `data/` rule only. A stray `git add .` could commit them. **Severity: Low.**

**81.** **`.env` file committed with default password** — `.env` contains `POSTGRES_PASSWORD=sat`. While docker-compose now uses `${POSTGRES_PASSWORD:?...}` (requiring it to be set), the `.env` file provides it with an insecure default. The `.env` should not be in the repo. **Severity: High (security).**

**82.** **`api` client doesn't send API key** — `frontend/src/api/client.ts` creates an axios instance with no `X-API-Key` header. If `API_KEY` env var is set on the backend, all frontend API calls will get 401. No mechanism exists to configure or pass the API key from the frontend. **Severity: Medium.**

**83.** **`conftest.py` at repo root is missing** — Root `pyproject.toml` references `testpaths = ["satellite_processor/core/tests", "backend/tests"]` but there's no root `conftest.py` (it was removed per AUDIT-3 #7). Running `pytest` from root will find both test suites but backend tests require `pytest-asyncio` and specific fixtures from `backend/tests/conftest.py` — this works because each test dir has its own conftest. No issue currently, but noted.

**84.** **`requirements-api.txt` at root includes dev deps** — Root `requirements-api.txt` includes `httpx`, `pytest`, `pytest-asyncio`, `pytest-cov` alongside production deps. This file seems vestigial — `backend/requirements.txt` is what the Dockerfile uses. **Severity: Low.**

**85.** **`BATCH-PLAN.md` committed** — Internal planning document `BATCH-PLAN.md` is committed. Should be removed or moved to a docs folder. **Severity: Low.**

**86.** **Thumbnail endpoint doesn't close PIL Image on error path** — In `images.py` `get_thumbnail()`, `img = PILImage.open(fp)` is used without `with` statement. If `img.thumbnail()` or `img.convert().save()` throws, the file handle leaks. **Severity: Low (original #12 partially fixed — upload uses `with`, but thumbnail still doesn't).**

**87.** **`bulk_delete_images` and `bulk_delete_jobs` accept raw `dict` instead of Pydantic model** — These endpoints take `payload: dict` with no validation model. While not as critical as settings (which was fixed with `SettingsUpdate`), it's inconsistent and allows arbitrary payloads. **Severity: Low.**

**88.** **`delete_job` doesn't actually delete the job** — `delete_job()` sets `job.status = "cancelled"` but never calls `db.delete(job)`. The job persists in the DB. `bulk_delete_jobs` does call `db.delete(job)`. Inconsistent behavior — single delete cancels, bulk delete actually deletes. **Severity: Medium.**

**89.** **No staging directory cleanup** — `_resolve_image_ids()` creates symlink staging directories under `temp_dir` (`job_staging_*`). These are never cleaned up after job completion/failure. Over time they'll accumulate. **Severity: Medium.**

**90.** **`ProcessingForm` sends `null` values for disabled options** — When crop/false_color/etc are disabled, the form sends `null` values (e.g., `"crop": null`). These would be passed to `ALLOWED_PARAM_KEYS` check and fail validation. (Related to #77.) **Severity: Medium.**

**91.** **`docker-compose.yml` password uses env var but `.env` supplies insecure default** — The compose file correctly uses `${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in .env}` but the committed `.env` provides `sat`. The error message implies security, but the file defeats it. **Severity: Medium (related to #81).**

**92.** **`frontend/test-results/` is tracked in git** — Test failure artifacts (`frontend/test-results/dashboard-stats-cards-render-chromium/error-context.md`) are committed. Should be gitignored and removed from tracking. **Severity: Low.**

**93.** **No Alembic migrations** — `alembic` is listed in requirements but no `alembic/` directory or migration files exist. Schema changes rely on `Base.metadata.create_all()` which can't handle column additions/removals on existing databases. **Severity: Medium.**

**94.** **`settings.py` form fields don't match backend schema** — Frontend Settings page has fields `output_dir`, `max_workers`, `default_codec` which are NOT in the backend `SettingsUpdate` Pydantic model. Backend accepts: `default_crop`, `default_false_color`, `timestamp_enabled`, `timestamp_position`, `video_fps`, `video_codec`, `video_quality`. The frontend settings form is disconnected from reality. **Severity: Medium.**

**95.** **Worker PYTHONPATH set differently between compose files** — Production `docker-compose.yml` worker has `PYTHONPATH` not set (no explicit env var), but relies on `sys.path.insert`. Dev compose also doesn't set it. The CI workflow sets `PYTHONPATH: ${{ github.workspace }}`. Inconsistent. **Severity: Low.** — Actually, prod compose DOES have `PYTHONPATH=/app` on worker. API service does not. Inconsistent between services.

**96.** **`storage_service.list_uploads()` excludes TIFF files** — `StorageService.list_uploads()` only matches `.png`, `.jpg`, `.jpeg` but the upload endpoint accepts `.tif`, `.tiff`. TIFF uploads won't appear in `list_uploads()`. However, this method appears unused (listing goes through DB now), so it's dead code. **Severity: Low.**

**97.** **`multiprocessing.Pool` created per stage (AUDIT-3 #32)** — This core processor issue wasn't in the "unfixed 23" range but is worth noting as still present in `satellite_processor/core/processor.py`. **Severity: Low (core module wasn't part of the web modernization scope).**

---

### 2. Error Handling — Grade: B+

Most error handling issues from AUDIT-3 were fixed. The structured `APIError` system works well. WebSocket now has `json.loads` in a try/except on the client side (`useWebSocket.ts`), though the server-side `writer()` still doesn't wrap `json.loads(msg["data"])` in try/except.

**98.** **WebSocket server-side `json.loads` still unwrapped** — `main.py` `writer()` does `data = json.loads(msg["data"])` without try/except. A malformed Redis message crashes the WebSocket. (AUDIT-3 #13 — was supposedly fixed but the code still lacks the guard.) **Severity: Medium.**

---

### 3. Security — Grade: B

Major improvements: API key auth middleware added (#21), CORS restricted to specific methods/headers (#19), settings endpoint validated with Pydantic (#20), path validation added for image serving (#23), rate limiting on delete endpoints (#24), debug defaults to `False` (#18), production env template created (#74).

Remaining concerns:

- **#81** `.env` with password committed (see above)
- **#82** Frontend can't pass API key
- **#57** Container runs as root

---

### 4. Performance — Grade: B+

Good improvements: pagination added (#26, #27, #48), `cpu_percent` runs in executor (#28), `virtual_memory()` called once (#29), DB writes throttled to 5% intervals (#30).

No new performance issues found.

---

### 5. Testing — Grade: B-

Good test suite for backend with 12 test files covering endpoints, edge cases, error formats. Coverage threshold raised to 45% for backend.

Still missing: WebSocket tests (#33), Celery task tests (#34), Docker integration test (#37), meaningful E2E tests (#38), frontend lint enforced (#35).

---

### 6. Frontend — Grade: B

Nice improvements: page titles with `usePageTitle` (#46), delete confirmations with `window.confirm` (#41), modal has Escape/focus trap/ARIA (#42), video player has error state (#47), image fallback shows "Image unavailable" (#43), toast notifications on settings save (#40).

Key regression: **#78/#79 pagination response mismatch makes the frontend non-functional with the current backend.**

---

### 7. Backend API — Grade: B+

Good improvements: pagination, PATCH endpoint (#50), bulk delete (#53), validated settings (#54), consistent response formats (#49), output path stored on job (#52).

Key issue: **#77 param key validation blocks the frontend's processing form.**

---

### 8. Docker/DevOps — Grade: B-

Improvements: hardcoded password replaced with env var requirement (#17), `.dockerignore` added (#58), production env template (#74).

Still open: no API health check (#56), runs as root (#57), no resource limits (#61), no log rotation (#62), no Redis health check in dev (#59).

---

### 9. Documentation — Grade: C+

Still has stale desktop GUI reference (#63), missing health endpoints in API table (#64), no CONTRIBUTING.md (#66), no CHANGELOG (#67), stale MODERNIZATION_PLAN.md (#68), boilerplate frontend README (#69).

---

### 10. Configuration — Grade: B

Improvements: env var warning for SQLite in prod (#70), dev deps split to `requirements-dev.txt` (#6), both test paths in `pyproject.toml` (#72), production env template (#74), pre-commit documented in README (#76).

Remaining: inconsistent `line-length` between ruff.toml (120) and pyproject.toml black (120) — actually these match now. `ruff.toml` ignores E501 so line length is advisory. Root `requirements-api.txt` is vestigial (#84).

---

## Summary

| Category | Grade | Trend | Key Issues |
|----------|-------|-------|------------|
| Code Quality | B+ | ↑ | Param schema mismatch (#77), sys.path hacks remain |
| Error Handling | B+ | ↑ | WS server json.loads unwrapped (#100) |
| Security | B | ↑↑ | `.env` committed (#81), no API key flow for frontend (#82) |
| Performance | B+ | ↑ | No new issues |
| Testing | B- | → | WS/Celery untested, lint not enforced, no Docker smoke test |
| Frontend | B | ↓ | **Pagination mismatch breaks all list views (#78, #79)** |
| Backend API | B+ | ↑ | Param validation blocks frontend (#77) |
| Docker/DevOps | B- | → | No API healthcheck, runs as root, no limits |
| Documentation | C+ | → | Stale references, missing docs |
| Configuration | B | ↑ | Vestigial req files, committed test data |

**Overall: B**  (up from B-)

### 🚨 Critical Issues (fix immediately)

1. **#77 / #90** — Frontend ProcessingForm sends params (`crop`, `false_color`, `timestamp`, `scale`, `video`) that backend rejects. **Core workflow is broken.** Fix: add these keys to `ALLOWED_PARAM_KEYS` or restructure validation.

2. **#78 / #79** — Frontend hooks return paginated wrapper `{ items, total, page, limit }` but components treat it as a raw array. **All list views are broken.** Fix: update `useImages()`/`useJobs()` to return `r.data.items` or update components to access `.items`.

3. **#81** — `.env` file with `POSTGRES_PASSWORD=sat` committed to git. Remove from repo, add to `.gitignore`.

### Top 5 Priority Fixes

1. **Fix frontend/backend param schema mismatch** (#77, #90)
2. **Fix pagination response handling in frontend** (#78, #79)
3. **Remove `.env` and test data from repo** (#80, #81)
4. **Add API container health check** (#56)
5. **Add non-root user to Dockerfile** (#57)

### New findings: #77–98 (22 new issues)
### Still open from AUDIT-3: 15 issues (#33–35, #36 partial, #37–38, #56–57, #59–63, #66–69)
### Total open: ~37 issues
