# Live Bug Report — Production Investigation

_Tested against live app on 2026-02-19 ~13:40 UTC_
_API: http://10.27.27.99:8001 | Frontend: http://10.27.27.99:3001_

## Confirmed Bugs (things that ARE broken)

### Bug 1: PUT /api/settings returns 500 — Settings Cannot Be Saved
- **Severity:** Critical
- **Endpoint/Feature:** `PUT /api/settings`
- **Steps to Reproduce:** Send any valid settings update: `curl -X PUT -H "Content-Type: application/json" -H "X-API-Key: ..." http://10.27.27.99:8001/api/settings -d '{"video_fps":24}'`
- **Actual Result:** `HTTP 500 {"error":"internal_error","detail":"An unexpected error occurred"}`
- **Expected Result:** Settings should be saved and returned
- **Evidence:** Consistently returns 500 with any valid payload. GET works fine.
- **Root Cause:** `backend/app/routers/settings.py` — `_save_to_db()` or the DB session likely fails during upsert. Possibly the `select` + modify + `commit` pattern has a session/transaction issue with the JSON column, or `onupdate=utcnow` conflicts with the manual commit.
- **Fix:** Add error logging to the PUT handler to capture the actual exception. Likely needs `await db.flush()` before commit or the upsert logic needs `merge()` instead of manual select+modify.

### Bug 2: Settings Page StorageSection Calls Non-Existent Endpoint
- **Severity:** High
- **Endpoint/Feature:** `GET /api/goes/stats` (called by Settings page `StorageSection`)
- **Steps to Reproduce:** Open Settings page → Storage section always fails silently
- **Actual Result:** `HTTP 404 {"detail":"Not Found"}`
- **Expected Result:** Should return storage breakdown data
- **Evidence:** `frontend/src/pages/Settings.tsx:55` calls `api.get('/goes/stats')` — this endpoint does not exist in the backend. The correct endpoint is `/api/goes/frames/stats` (returns similar but different schema) or `/api/stats/storage/breakdown`.
- **Root Cause:** `frontend/src/pages/Settings.tsx:55` — wrong endpoint path
- **Fix:** Change to `api.get('/goes/frames/stats')` or `api.get('/stats/storage/breakdown')` and align the `StorageBreakdown` TypeScript interface with the actual response schema.

### Bug 3: Notification Mark-as-Read Uses Wrong HTTP Method
- **Severity:** High
- **Endpoint/Feature:** Mark notification as read
- **Steps to Reproduce:** Click to mark a notification as read in the UI
- **Actual Result:** `HTTP 405 Method Not Allowed`
- **Expected Result:** Notification should be marked as read
- **Evidence:** Frontend (`frontend/src/components/NotificationBell.tsx:31`) sends `PATCH /api/notifications/{id}/read` but backend (`backend/app/routers/notifications.py`) registers `POST /{notification_id}/read`.
- **Root Cause:** HTTP method mismatch — frontend uses PATCH, backend expects POST
- **Fix:** Change frontend to use `api.post(...)` or change backend to `@router.patch(...)`. POST is more correct semantically.

### Bug 4: Animation Preset Rename Uses Wrong HTTP Method
- **Severity:** High
- **Endpoint/Feature:** Rename animation preset
- **Steps to Reproduce:** Try to rename an animation preset in the Animation tab
- **Actual Result:** `HTTP 405 Method Not Allowed`
- **Expected Result:** Preset should be renamed
- **Evidence:** Frontend (`frontend/src/components/Animation/AnimationPresets.tsx:43`) sends `PATCH /api/goes/animation-presets/{id}` but backend (`backend/app/routers/animations.py:500`) registers `PUT /animation-presets/{preset_id}`.
- **Root Cause:** HTTP method mismatch — frontend uses PATCH, backend expects PUT
- **Fix:** Change frontend to `api.put(...)` or change backend to accept PATCH.

### Bug 5: /api/goes/latest Defaults to GOES-16 But Only GOES-19 Data Exists
- **Severity:** Medium
- **Endpoint/Feature:** `GET /api/goes/latest` (without parameters)
- **Steps to Reproduce:** `curl -H "X-API-Key: ..." http://10.27.27.99:8001/api/goes/latest`
- **Actual Result:** `HTTP 404 {"error":"not_found","detail":"No frames found for the given parameters"}`
- **Expected Result:** Should return the latest frame across any satellite, or default to GOES-19
- **Evidence:** `backend/app/routers/goes.py` — `get_latest_frame()` defaults `satellite="GOES-16"` but all stored frames are GOES-19. The catalog endpoint defaults to GOES-19 — inconsistent defaults.
- **Root Cause:** Hardcoded default satellite is stale (GOES-16 was replaced by GOES-19 as GOES-East)
- **Fix:** Change default to `GOES-19` or make the endpoint return the latest frame across all satellites when no filter is specified.

### Bug 6: /api/frames Returns 404 — No Top-Level Frames Endpoint
- **Severity:** Medium
- **Endpoint/Feature:** `GET /api/frames`
- **Steps to Reproduce:** `curl -H "X-API-Key: ..." http://10.27.27.99:8001/api/frames`
- **Actual Result:** `HTTP 404 {"detail":"Not Found"}`
- **Expected Result:** Should list frames or redirect to `/api/goes/frames`
- **Evidence:** The route simply doesn't exist. Frames are only under `/api/goes/frames`. Any external integration expecting `/api/frames` will fail.
- **Root Cause:** No router registered at `/api/frames` — only `/api/goes/frames` and `/api/images`
- **Fix:** Either add a redirect/alias or document that frames are only under the `/api/goes/` prefix.

### Bug 7: POST /api/jobs Rejects `goes_fetch` Job Type
- **Severity:** Medium
- **Endpoint/Feature:** `POST /api/jobs` — generic job creation
- **Steps to Reproduce:** `curl -X POST -H "Content-Type: application/json" -H "X-API-Key: ..." http://10.27.27.99:8001/api/jobs -d '{"name":"test","job_type":"goes_fetch","params":{}}'`
- **Actual Result:** `HTTP 422` — `Input should be 'image_process' or 'video_create'`
- **Expected Result:** Should accept `goes_fetch` as a valid job type, or the enum should be documented
- **Evidence:** The `job_type` literal validation only allows `image_process` or `video_create`, but GOES fetch jobs exist in the system (created via `/api/goes/fetch`). The frontend's `useCreateJob` hook at `frontend/src/hooks/useApi.ts:56` posts to `/api/jobs` with arbitrary params — if anyone tries to create a GOES fetch job through this generic endpoint, it fails.
- **Root Cause:** `backend/app/routers/jobs.py` — `JobCreate` model has `job_type: Literal['image_process', 'video_create']` but GOES fetch jobs bypass this via the dedicated `/api/goes/fetch` endpoint
- **Fix:** Either add `goes_fetch` to the literal union, or document that GOES jobs must be created via `/api/goes/fetch`.

### Bug 8: Download Endpoint Path Traversal Check Too Aggressive
- **Severity:** Low
- **Endpoint/Feature:** `GET /api/download?path=nonexistent`
- **Steps to Reproduce:** Request any file by name: `curl -H "X-API-Key: ..." "http://10.27.27.99:8001/api/download?path=nonexistent"`
- **Actual Result:** `HTTP 403 {"error":"forbidden","detail":"Path traversal detected"}` even for non-traversal paths
- **Expected Result:** Should return 404 for non-existent files, 403 only for actual traversal attempts
- **Evidence:** The word "nonexistent" triggers the traversal check. This suggests the validation is overly strict or the path resolution logic treats any non-absolute path as traversal.
- **Root Cause:** `backend/app/routers/download.py` or `file_download.py` — path validation logic
- **Fix:** Only reject paths containing `..`, absolute paths, or paths that resolve outside the data directory.

### Bug 9: WebSocket Auth Fails Without Query Parameter (No Header Forwarding)
- **Severity:** Low
- **Endpoint/Feature:** WebSocket endpoints (`/ws/events`, `/ws/status`, `/ws/jobs/{id}`)
- **Steps to Reproduce:** Connect to WebSocket without `api_key` query parameter (e.g., relying on header auth)
- **Actual Result:** `HTTP 403` — connection rejected
- **Expected Result:** Should accept API key via header or query parameter
- **Evidence:** `backend/app/main.py:232` checks `websocket.query_params.get("api_key") or websocket.headers.get("x-api-key")` — headers work in theory, but the nginx proxy may strip custom headers from WebSocket upgrades. The frontend's `buildWsUrl()` correctly uses query params only when `VITE_API_KEY` is set; in production nginx injects the header. If nginx doesn't forward `X-API-Key` on WebSocket upgrade, connections fail.
- **Root Cause:** Depends on nginx config — if nginx adds API key as header for normal requests but not WebSocket upgrades, WS auth fails
- **Fix:** Verify nginx config forwards `X-API-Key` header for WebSocket upgrade requests, or always use query param auth for WebSocket.

### Bug 10: Catalog Endpoint Default Satellite Inconsistency
- **Severity:** Low
- **Endpoint/Feature:** Multiple `/api/goes/*` endpoints have different default satellites
- **Steps to Reproduce:** Compare defaults: `/api/goes/latest` defaults to GOES-16, `/api/goes/catalog` defaults to GOES-19, `/api/goes/catalog/available` defaults to GOES-19
- **Actual Result:** Different endpoints return different results for the "same" default query
- **Expected Result:** All endpoints should use consistent defaults
- **Evidence:** `get_latest_frame` uses `Query("GOES-16")` while `catalog_latest` and `catalog_available` use `Query("GOES-19")`
- **Root Cause:** Defaults were set at different times as GOES-16 was replaced by GOES-19
- **Fix:** Define a single `DEFAULT_SATELLITE` constant and use it across all endpoints.

## Architecture Recommendations

1. **Contract Testing Between Frontend/Backend** — The PATCH vs POST/PUT mismatches (Bugs 3, 4) would be caught by OpenAPI schema validation. Generate TypeScript types from the backend's OpenAPI spec (`/openapi.json`) instead of hand-writing interfaces. Tools like `openapi-typescript` can automate this.

2. **Centralized Constants for Defaults** — The satellite default inconsistency (Bug 5, 10) stems from hardcoded strings scattered across route handlers. Define `DEFAULT_SATELLITE`, `DEFAULT_SECTOR`, `DEFAULT_BAND` in a single config location and reference them everywhere.

3. **Integration Test Suite** — A simple test that hits every frontend API call path against the real backend would catch Bugs 2, 3, 4, 7 immediately. Even a shell script with curl commands (like this investigation) run in CI would help.

4. **Error Logging on 500s** — Bug 1 (settings 500) is impossible to debug without logs. The global error handler returns a generic message. Add structured error logging (with traceback) for all 500 responses, and consider a `/api/system/errors` endpoint for recent error inspection.

5. **Frontend API Client Code Generation** — Instead of manually writing `api.get('/goes/stats')`, generate a typed API client from the OpenAPI spec. This eliminates endpoint path typos and method mismatches at compile time.

6. **Health Check Should Validate Settings Write** — The `/api/health/detailed` endpoint checks DB connectivity but doesn't test write operations. Adding a settings write test would have caught Bug 1.

7. **Smoke Test on Deploy** — After each deployment, run a smoke test that exercises all major CRUD operations (create job, update settings, mark notification read). This catches integration-level breakage that unit tests miss.
