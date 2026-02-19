# Bug Audit Round 3 — Comprehensive Investigation

_Found 2026-02-19. Tested against live app (API: http://10.27.27.99:8001, Frontend: http://10.27.27.99:3001) + full code review._

## Bugs Found

### 1. PUT /api/settings Still Returns 500 — Functional
- **Severity:** Critical
- **Location:** `backend/app/routers/settings.py` → `_save_to_db()`
- **Description:** Settings cannot be saved. `PUT /api/settings` consistently returns HTTP 500 with any valid payload. GET works fine.
- **Evidence:** `curl -X PUT -H "X-API-Key: ..." -H "Content-Type: application/json" http://10.27.27.99:8001/api/settings -d '{"video_fps":24}'` → `{"error":"internal_error","detail":"An unexpected error occurred"}`
- **Impact:** All settings changes from the UI silently fail. Users see "Failed to save settings" but the root cause is masked by the generic 500 handler.
- **Recommended Fix:** The `_save_to_db` function loads ALL settings (including nested dicts from the DB like `default_crop`), then re-saves them. The issue is likely that `_load_from_db` returns JSON values that SQLAlchemy can't re-serialize properly on upsert — specifically, when the `value` column stores a dict (like `default_crop: {x:0,y:0...}`), `flag_modified` + commit may fail. Add explicit `logger.exception()` before the `db.rollback()` in the except block to capture the actual traceback, and ensure all values are JSON-serializable before writing.

### 2. /api/goes/frames/export Route Shadowed by /frames/{frame_id} — Functional
- **Severity:** High
- **Location:** `backend/app/routers/goes_data.py:249,339`
- **Description:** The `/frames/{frame_id}` route (line 249) is registered before `/frames/export` (line 339). FastAPI matches routes in registration order, so `/api/goes/frames/export` is interpreted as `frame_id="export"`, returning a 404 UUID validation error.
- **Evidence:** `curl -H "X-API-Key: ..." .../api/goes/frames/export?format=json&limit=2` → `{"error":"not_found","detail":"Resource not found (invalid frame_id)","status_code":404}`
- **Impact:** Frame export functionality is completely broken. CSV and JSON exports from the Browse tab don't work.
- **Recommended Fix:** Move the `/frames/export` route definition ABOVE `/frames/{frame_id}` in `goes_data.py`, or rename it to `/frames-export` to avoid the conflict.

### 3. StorageSection TypeScript Interface Mismatches API Response — UI/UX
- **Severity:** Medium
- **Location:** `frontend/src/pages/Settings.tsx:17-22` vs `backend/app/routers/goes_data.py:211`
- **Description:** The `StorageBreakdown` interface expects `by_satellite` and `by_band` to have `{count: number; size: number}` shape, and properties `total_size_bytes` and `total_frames`. The actual `/api/goes/frames/stats` response matches this shape, BUT `formatBytes(storage.total_size_bytes)` and `storage.total_frames.toLocaleString()` are called — if the API response structure ever changes or returns `null`, these will throw. More critically, the `by_satellite` bar chart uses `info.size / maxSatSize` which works only if there's at least one satellite.
- **Impact:** StorageSection renders fine when data exists but will crash with a division-by-zero or undefined access in edge cases (e.g., empty database returns all zeros).
- **Recommended Fix:** Add null checks: `const maxSatSize = Math.max(...satEntries.map(([, v]) => v?.size ?? 0), 1);` and guard `storage.total_frames?.toLocaleString() ?? '0'`.

### 4. Server-Side File Paths Exposed in Multiple API Responses — Security
- **Severity:** High
- **Location:** `backend/app/routers/goes.py:500-512` (`/api/goes/latest`), `goes.py:618-630` (`/api/goes/composites`), `goes_data.py:249` (`/api/goes/frames/{id}`), `animations.py:383` (`/frames/preview-range`)
- **Description:** Multiple endpoints return `file_path` and `thumbnail_path` containing absolute server paths like `/app/data/output/goes_xxx/...`. This leaks internal directory structure.
- **Evidence:** `curl .../api/goes/latest?satellite=GOES-19&sector=CONUS&band=C02` returns `"file_path": "/app/data/output/goes_6fa1e466-.../GOES-19_CONUS_C02_20260219T122617.png"`
- **Impact:** Attackers learn the internal directory structure, container paths, and job ID patterns, which aids path traversal and other attacks.
- **Recommended Fix:** Strip `file_path` and `thumbnail_path` from all public API responses. Replace with `/api/goes/frames/{id}/image` and `/api/goes/frames/{id}/thumbnail` URLs. For composites, add a `/api/goes/composites/{id}/image` endpoint.

### 5. Gap Detection Ignores sector Filter — Functional
- **Severity:** Medium
- **Location:** `backend/app/services/gap_detector.py:get_coverage_stats()` line ~130
- **Description:** `get_coverage_stats()` accepts `satellite` and `band` parameters but does NOT pass `sector` to `find_gaps()`. The `/api/goes/gaps` endpoint accepts `satellite` and `band` query params but not `sector`. Since the same satellite+band may have different cadences for different sectors (CONUS=5min, FullDisk=10min), gap detection across mixed sectors produces incorrect results.
- **Evidence:** Code review: `get_coverage_stats` signature has no `sector` param. `find_gaps` accepts `sector` but it's never passed from the router or coverage stats function.
- **Impact:** Gap detection reports false positives when frames from different sectors (with different cadences) are mixed together. A 5-minute CONUS cadence misidentified as a gap in 10-minute FullDisk data.
- **Recommended Fix:** Add `sector` parameter to `get_coverage_stats()` and pass it from the `/api/goes/gaps` router endpoint.

### 6. Animation `false_color` Stored as Integer but Typed as Boolean — Code Quality
- **Severity:** Low
- **Location:** `backend/app/routers/animations.py:107` and `backend/app/tasks/animation_tasks.py`
- **Description:** `_create_animation_from_frames` sets `false_color=1 if false_color else 0` (storing as int), but `_build_anim_response` reads `bool(anim.false_color)` and the `AnimationCreate` model types it as `bool`. The DB column type should be Boolean but it's Integer. This works but is a type inconsistency.
- **Evidence:** Code: `false_color=1 if false_color else 0` in animations.py:107
- **Impact:** Minor — functional but confusing for maintainers.
- **Recommended Fix:** Use `Boolean` column type in the DB model, or at minimum be consistent (always store as int and convert on read).

### 7. `_zip_stream` BytesIO Seek/Truncate Doesn't Actually Stream — Performance
- **Severity:** Medium
- **Location:** `backend/app/routers/download.py:32-52`
- **Description:** The `_zip_stream` function tries to yield incremental chunks by seeking/truncating a BytesIO buffer after each file. However, `ZipFile` in ZIP_STORED mode writes the entire file entry at once via `zf.write()`, so after the first yield the buffer position is wrong. The seek(0)/truncate(0) after yield resets the buffer, but the ZipFile's internal position tracking uses `tell()` which will now return 0, corrupting the ZIP central directory offsets.
- **Evidence:** Code review: After `zf.write(abs_path, arc_name)`, `buf.getvalue()` gets all bytes, yields them, then `buf.seek(0); buf.truncate(0)` resets. But the ZipFile object still thinks it wrote N bytes, so subsequent entries get wrong offsets.
- **Impact:** Downloads of multi-file ZIP archives may produce corrupted ZIP files. Single-file ZIPs work because there's only one entry before the central directory.
- **Recommended Fix:** Use `zipstream-ng` for true streaming, or build the entire ZIP in BytesIO without the seek/truncate/yield dance (just yield the complete buffer at the end).

### 8. Bulk Frame Tag Endpoint Makes N×M Individual Queries — Performance
- **Severity:** Medium
- **Location:** `backend/app/routers/goes_data.py:290-305`
- **Description:** `bulk_tag_frames` does a SELECT for each (frame_id, tag_id) pair to check existence before inserting. For 50 frames × 3 tags = 150 individual queries.
- **Evidence:** Code: `for frame_id in payload.frame_ids: for tag_id in payload.tag_ids: existing = await db.execute(select(FrameTag)...)`
- **Impact:** Tagging many frames is slow — O(N×M) queries instead of O(1) bulk insert with `ON CONFLICT DO NOTHING`.
- **Recommended Fix:** Use `INSERT ... ON CONFLICT DO NOTHING` via SQLAlchemy's `insert().on_conflict_do_nothing()`.

### 9. Collection Frame Add Also N+1 — Performance
- **Severity:** Medium
- **Location:** `backend/app/routers/goes_data.py:541-549`
- **Description:** `add_frames_to_collection` does individual SELECT per frame_id to check for duplicates. Same N+1 pattern as bulk tagging.
- **Evidence:** Code: `for frame_id in payload.frame_ids: existing = await db.execute(select(CollectionFrame)...)`
- **Impact:** Adding many frames to a collection is unnecessarily slow.
- **Recommended Fix:** Bulk insert with conflict handling.

### 10. `_get_frames_to_cleanup` Loads ALL Frames Into Memory — Performance
- **Severity:** High
- **Location:** `backend/app/routers/scheduling.py:_collect_age_deletions()` and `_collect_storage_deletions()`
- **Description:** Both functions execute `select(GoesFrame)` with only a `.where()` filter — loading ALL matching frame objects into memory. `_collect_storage_deletions` specifically loads ALL frames sorted by creation date to calculate which to delete.
- **Evidence:** Code: `res = await db.execute(select(GoesFrame).order_by(GoesFrame.created_at.asc()))` — no limit, loads every frame.
- **Impact:** With thousands of frames, cleanup preview/run will consume excessive memory and be slow. Could OOM the API process.
- **Recommended Fix:** Use streaming/batched queries, or better: use a subquery to get IDs only, then batch delete.

### 11. Composite Response Leaks `file_path` — No Download Endpoint — Functional
- **Severity:** Medium
- **Location:** `backend/app/routers/goes.py:598-630`
- **Description:** Composites have `file_path` in the response but there's no `/api/goes/composites/{id}/image` endpoint to actually serve the file. The frontend CompositesTab has a download button that constructs `api.get('/download', { params: { path: composite.file_path } })` — but this uses the absolute server path, which only works because the `/api/download` endpoint exists. However, the download endpoint validates the path against `storage_root` which may not match `/app/data/output/composites/`.
- **Evidence:** Composite `file_path` is `/app/data/output/composites/0769d40f-...png`. The download endpoint validates against `settings.storage_path`.
- **Impact:** Composite downloads may fail if the storage_path doesn't encompass the composites output directory.
- **Recommended Fix:** Add a dedicated `/api/goes/composites/{id}/image` endpoint (like frames have), and stop exposing raw file_path.

### 12. `fetch /api/health/version` in Layout.tsx Bypasses API Key Auth — Security
- **Severity:** Low
- **Location:** `frontend/src/components/Layout.tsx:78`
- **Description:** `fetch('/api/health/version')` uses raw `fetch()` without the API key header. It works because `/api/health` is in `AUTH_SKIP_PREFIXES`, but this bypasses the configured axios client and its interceptors/timeout.
- **Evidence:** Code: `fetch('/api/health/version').then((r) => r.json())...`
- **Impact:** If the health prefix is ever removed from the skip list, the version check will break. Also inconsistent with the rest of the app's API usage pattern.
- **Recommended Fix:** Use `api.get('/health/version')` (already configured with base URL and headers).

### 13. `AnimationPlayer` interval Not Cleared on Unmount — Code Quality
- **Severity:** Low
- **Location:** `frontend/src/components/GoesData/AnimationPlayer.tsx:30,59`
- **Description:** `intervalRef` is used for animation playback but the cleanup in the effect may miss edge cases where the component unmounts while playing.
- **Evidence:** Code review shows `intervalRef.current = setInterval(...)` at line 59, and cleanup in an effect, but if the play state changes and the component unmounts simultaneously, the interval may leak.
- **Impact:** Minor memory leak if AnimationPlayer unmounts during playback.
- **Recommended Fix:** Clear interval in a cleanup return of the effect that sets it, not in a separate effect.

### 14. JobMonitor `setInterval` for Elapsed Time Never Cleared on Job Completion — Code Quality
- **Severity:** Low
- **Location:** `frontend/src/components/Jobs/JobMonitor.tsx:299`
- **Description:** `setInterval(() => setNow(Date.now()), 1000)` is set up to update elapsed time display but the cleanup depends on the effect's dependency array. If the job completes while the interval is running, it continues ticking unnecessarily.
- **Evidence:** Code: `const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t);`
- **Impact:** Minor — interval continues after job completes until component unmounts. Wastes CPU on re-renders.
- **Recommended Fix:** Only start the interval when `job.status` is `pending` or `processing`.

### 15. `preview_frame_range` Loads ALL Matching Frames Into Memory — Performance
- **Severity:** Medium
- **Location:** `backend/app/routers/animations.py:399-413`
- **Description:** The preview endpoint loads ALL frames matching the time range just to pick first/middle/last. For a large time range (e.g., 7 days of Mesoscale data = 10,080 frames), this loads everything into memory.
- **Evidence:** Code: `result = await db.execute(frames_q)` then `all_frames = result.scalars().all()` — no LIMIT.
- **Impact:** Slow response and excessive memory usage for large time ranges.
- **Recommended Fix:** Use three separate queries: `LIMIT 1` ordered ASC for first, `OFFSET total/2 LIMIT 1` for middle, `LIMIT 1` ordered DESC for last.

### 16. `remove_frames_from_collection` Returns `len(payload.frame_ids)` Not Actual Count — Functional
- **Severity:** Low
- **Location:** `backend/app/routers/goes_data.py:623`
- **Description:** Returns `{"removed": len(payload.frame_ids)}` regardless of how many were actually in the collection. If you request removal of 10 IDs but only 3 were in the collection, it still reports 10 removed.
- **Evidence:** Code: `return {"removed": len(payload.frame_ids)}` — doesn't check `result.rowcount`.
- **Impact:** Misleading response. UI may show incorrect counts.
- **Recommended Fix:** Use the DELETE statement's `rowcount`: `result = await db.execute(delete(...)); return {"removed": result.rowcount}`.

### 17. `bulk_delete_frames` Doesn't Delete CollectionFrame/FrameTag Join Records — Functional
- **Severity:** Medium
- **Location:** `backend/app/routers/goes_data.py:264-282`
- **Description:** `bulk_delete_frames` deletes GoesFrame records directly via `delete(GoesFrame).where(...)` but doesn't first delete related `CollectionFrame` and `FrameTag` records. If there's no `CASCADE` on the foreign keys, this will fail with a foreign key constraint error.
- **Evidence:** Code deletes files, then `await db.execute(delete(GoesFrame).where(GoesFrame.id.in_(payload.ids)))` — no cleanup of join tables.
- **Impact:** Bulk frame deletion may fail with FK constraint violations if frames are in collections or have tags.
- **Recommended Fix:** Delete from `CollectionFrame` and `FrameTag` first, then delete `GoesFrame` records. Or ensure `CASCADE` is set on the FK relationships.

### 18. `catalog_list` and `catalog_latest` Run Synchronous S3 Calls in Thread Executor — Performance
- **Severity:** Medium
- **Location:** `backend/app/routers/goes.py:127-131,156-159`
- **Description:** S3 catalog operations use `loop.run_in_executor(None, lambda: ...)` with the default thread pool. The default `ThreadPoolExecutor` has a limited number of workers. Under concurrent catalog requests, threads can be exhausted, blocking the event loop.
- **Evidence:** Code uses `loop.run_in_executor(None, ...)` — None means default executor which shares threads with all other `run_in_executor` calls.
- **Impact:** Under load, catalog requests can queue up and time out because the default thread pool is saturated.
- **Recommended Fix:** Use a dedicated `ThreadPoolExecutor` for S3 operations, or better, use an async S3 client (aioboto3).

### 19. `dashboard_stats` Cache Function Captures DB Session — Code Quality
- **Severity:** Medium
- **Location:** `backend/app/routers/goes_data.py:55-107`
- **Description:** The `_fetch` closure inside `dashboard_stats` captures the `db` session from the outer scope. When the result is cached by Redis, subsequent calls skip `_fetch` entirely. But if the cache misses and `_fetch` is called, it uses the `db` session from the current request — this is correct. However, if the cache write fails and `_fetch` is called again in a different request, the old `db` reference would be stale. This is a subtle issue because `get_cached` always calls `_fetch` with a fresh closure per request.
- **Evidence:** Actually on closer review this is fine since `_fetch` is defined fresh each call. **Downgrading** — but note that the `_fetch` function makes ~6 separate DB queries that could be combined.
- **Impact:** 6 sequential DB queries for dashboard stats on every cache miss.
- **Recommended Fix:** Combine queries where possible, e.g., satellite counts and storage in one query with `GROUP BY`.

### 20. No CSRF Protection on State-Changing Endpoints — Security
- **Severity:** Medium
- **Location:** `backend/app/main.py` (middleware stack)
- **Description:** The API uses API key auth via `X-API-Key` header, which provides some CSRF protection (browsers don't add custom headers in simple requests). However, the API key is also accepted via cookies (`websocket.cookies.get("api_key", "")` in WS auth), and the frontend sends it via a custom header. If a user's API key is stored in a cookie, state-changing POST/PUT/DELETE requests could be forged via CSRF.
- **Evidence:** WS auth at `main.py:194` accepts `websocket.cookies.get("api_key", "")`.
- **Impact:** If the API key is ever set as a cookie (e.g., for WS auth from browser), CSRF attacks become possible.
- **Recommended Fix:** Remove cookie-based API key acceptance, or add SameSite=Strict + CSRF tokens.

### 21. `_create_fetch_records` Creates Duplicate Collections on Re-fetch — Functional
- **Severity:** Medium
- **Location:** `backend/app/tasks/goes_tasks.py:43-96`
- **Description:** Every fetch job creates a new Collection with the same name pattern (e.g., "GOES Fetch GOES-19 C02 CONUS"). Re-fetching the same satellite/band/sector creates duplicate collections with identical names but different IDs.
- **Evidence:** Code: `collection = Collection(id=str(uuid.uuid4()), name=f"GOES Fetch {results[0]['satellite']} ...")` — no check for existing collection with same name.
- **Impact:** Users see many duplicate collections in the Collections tab, making it hard to organize data.
- **Recommended Fix:** Check for existing collection with the same name and reuse it, or append the job date to make names unique.

### 22. Animation Preset Save Sends Extra Fields Backend Doesn't Expect — Functional
- **Severity:** Low
- **Location:** `frontend/src/components/Animation/AnimationPresets.tsx:33-36`
- **Description:** The save mutation sends `{ name: ..., config: presetConfig }` but the backend `AnimationPresetCreate` model expects individual fields (`satellite`, `sector`, `band`, `fps`, etc.), not a nested `config` object. The preset is created but the config fields are all null/default.
- **Evidence:** Frontend: `api.post('/goes/animation-presets', { name: newName || 'Untitled Preset', config: presetConfig })`. Backend model doesn't have a `config` field — it expects flat fields.
- **Impact:** Saved animation presets lose all their configuration (satellite, sector, band, fps, etc.). Loading a preset fills in defaults instead of saved values.
- **Recommended Fix:** Flatten the config: `api.post('/goes/animation-presets', { name: newName, ...presetConfig })`.

### 23. `CompositesTab` Download Button Uses Raw `file_path` — Security/Functional
- **Severity:** Medium
- **Location:** `frontend/src/components/GoesData/CompositesTab.tsx` (download button logic)
- **Description:** The composite download constructs a URL using the raw `file_path` from the API response, which is an absolute server path like `/app/data/output/composites/xxx.png`. This is passed to the `/api/download?path=...` endpoint. If the storage root doesn't include the composites directory, the path validation will reject it.
- **Evidence:** The `/api/download` endpoint validates paths against `settings.storage_path`. If composites are stored outside that root, downloads fail.
- **Impact:** Composite image downloads may silently fail.
- **Recommended Fix:** Add a dedicated `/api/goes/composites/{id}/image` endpoint.

### 24. `get_coverage_stats` Coverage Calculation Is Wrong for Mixed Satellite/Band Data — Functional
- **Severity:** Medium
- **Location:** `backend/app/services/gap_detector.py:130-145`
- **Description:** When no satellite or band filter is provided, gap detection runs across ALL frames from ALL satellites/bands/sectors. The coverage percentage assumes a uniform `expected_interval` across heterogeneous data. A mix of 1-minute Mesoscale and 10-minute FullDisk frames produces nonsensical coverage stats.
- **Evidence:** The `/api/goes/gaps` endpoint defaults to no satellite/band filter, meaning it analyzes all 218 frames together regardless of their different cadences.
- **Impact:** Dashboard gap statistics are misleading when multiple satellite/band combinations exist.
- **Recommended Fix:** Either require satellite+sector+band filters, or auto-detect groups and compute coverage per group.

## Summary by Category
- UI/UX: 2 (#3, #12)
- Performance: 5 (#7, #8, #9, #15, #18)
- Functional: 9 (#1, #2, #5, #11, #16, #17, #21, #22, #24)
- Security: 3 (#4, #20, #23)
- Code Quality: 5 (#6, #10, #13, #14, #19)
