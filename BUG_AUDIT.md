# Bug & Polish Audit — Round 2

_Beyond PR #169's 20 fixes. Found 2026-02-19._

## Issues

### 1. Global events WebSocket lacks per-IP connection tracking — Grade: C
- **File:** `backend/app/main.py:218-248`
- **Type:** Resource Leak
- **Description:** The `/ws/events` and `/ws/status` WebSocket endpoints don't use `_ws_track()` for per-IP connection limiting, unlike `/ws/jobs/{job_id}`. A malicious client can open unlimited event/status WebSocket connections.
- **Impact:** Potential denial-of-service via connection exhaustion on the event bus.
- **Recommended Fix:** Add `_ws_track(client_ip, 1)` / `_ws_track(client_ip, -1)` to both `global_events_websocket` and `status_websocket`, mirroring the pattern in `job_websocket`.

### 2. `_ws_connections` dict is not thread/async-safe — Grade: C
- **File:** `backend/app/main.py:168-176`
- **Type:** Race Condition
- **Description:** `_ws_connections` is a plain `dict` mutated from concurrent async tasks. While CPython's GIL prevents corruption, the read-modify-write pattern (`get` + `+delta` + assign) can lose updates under concurrent WebSocket connects/disconnects.
- **Impact:** Connection count may drift, allowing over-limit connections or leaving stale entries.
- **Recommended Fix:** Use an `asyncio.Lock` around `_ws_track` or use `collections.defaultdict(int)` with atomic-style updates.

### 3. `localStorage` access without try/catch in Layout.tsx — Grade: D
- **File:** `frontend/src/components/Layout.tsx:45,61,68,84`
- **Type:** Bug
- **Description:** Multiple `localStorage.getItem`/`setItem` calls in the theme initializer and version check are not wrapped in try/catch. In private browsing or with storage quota exceeded, these throw and crash the app on load.
- **Impact:** App fails to render entirely in restricted browser contexts.
- **Recommended Fix:** Wrap all `localStorage` calls in Layout.tsx with try/catch, similar to the pattern already used in LiveTab.tsx:71.

### 4. `refetchRef` used before assignment in LiveTab — Grade: B
- **File:** `frontend/src/components/GoesData/LiveTab.tsx:113-116,173`
- **Type:** Bug
- **Description:** The `useEffect` at line 113 references `refetchRef.current?.()` but `refetchRef` is declared at line 173 (`const refetchRef = useRef<...>(null)`). Due to hoisting of `const`, this works at runtime (ref is `null` initially), but `handlePullRefresh` at line 167 also captures `refetchRef` before its declaration line—confusing and fragile.
- **Impact:** If the wsLastEvent fires before the query mounts, the refetch silently no-ops. The code is correct by accident but breaks if refactored.
- **Recommended Fix:** Move `refetchRef` declaration above all effects and callbacks that reference it (e.g., line ~100).

### 5. `usePullToRefresh` touchmove handler doesn't prevent native scroll — Grade: C
- **File:** `frontend/src/hooks/usePullToRefresh.ts:38-43`
- **Type:** UX
- **Description:** The `touchmove` listener is registered with `{ passive: true }`, which means `e.preventDefault()` cannot be called. While the hook doesn't call preventDefault, the pull gesture competes with native scroll, causing janky behavior—the page scrolls AND shows the pull indicator.
- **Impact:** Unreliable pull-to-refresh on mobile, double-scrolling artifacts.
- **Recommended Fix:** Register `touchmove` with `{ passive: false }` and call `e.preventDefault()` when actively pulling (dy > 0 and scrollTop <= 0).

### 6. `useFocusTrap` queries focusable elements only once — Grade: D
- **File:** `frontend/src/hooks/useFocusTrap.ts:14-17`
- **Type:** Bug
- **Description:** The `focusable` NodeList is captured once on mount. If the modal content changes dynamically (e.g., loading states, conditional buttons), the trap operates on stale elements—Tab cycling breaks when buttons appear/disappear.
- **Impact:** Focus escapes the trap or cycles to removed elements in dynamic modals.
- **Recommended Fix:** Re-query `focusable` inside the `keydown` handler rather than caching it.

### 7. `generate_animation` task doesn't clean up `work_dir` on failure — Grade: C
- **File:** `backend/app/tasks/animation_tasks.py:163-164`
- **Type:** Resource Leak
- **Description:** `shutil.rmtree(work_dir)` only runs in the success path (line 163). The `except` block at line 165 raises without cleanup, leaving potentially large temp directories (`anim_{id}/` with rendered PNG frames) on disk.
- **Impact:** Failed animation jobs accumulate temporary files, consuming disk space.
- **Recommended Fix:** Move `shutil.rmtree(work_dir, ignore_errors=True)` into the `finally` block.

### 8. Backfill task doesn't create `GoesFrame` records — Grade: B
- **File:** `backend/app/tasks/goes_tasks.py:183-199`
- **Type:** Bug
- **Description:** `_create_backfill_image_records` creates `Image` records but NOT `GoesFrame` records. The regular `_create_fetch_records` creates both. Backfilled frames won't appear in the GOES data browser, animation frame picker, or gap detection—defeating the purpose of backfilling.
- **Impact:** Backfilled data is invisible to the application. Users think gaps are filled but the frames don't show up.
- **Recommended Fix:** Create `GoesFrame` records in `_create_backfill_image_records` matching the pattern in `_create_fetch_records`, including thumbnails.

### 9. `eslint-disable react-hooks/exhaustive-deps` masks stale closure in GoesData tab sync — Grade: C
- **File:** `frontend/src/pages/GoesData.tsx:84`
- **Type:** Bug
- **Description:** The `eslint-disable` suppression hides that `activeTab` is missing from the dependency array. If `tabFromUrl` changes to the current `activeTab` value and then changes again, the effect may not re-run correctly because the comparison `tabFromUrl !== activeTab` uses a stale `activeTab`.
- **Impact:** Tab may not sync with URL after certain navigation sequences.
- **Recommended Fix:** Add `activeTab` to deps or restructure to avoid the stale closure.

### 10. Animation task uses `session.query()` (sync ORM) inside sync Celery task without proper session lifecycle — Grade: C
- **File:** `backend/app/tasks/animation_tasks.py:125-175`
- **Type:** Resource Leak
- **Description:** The task uses a single sync session for the entire duration (potentially minutes for large animations). If any intermediate commit or flush fails, the session is left in a broken state. Also, `_mark_animation_failed` opens its own session but the outer session may hold stale data.
- **Impact:** Database connection pool exhaustion under concurrent animation jobs; potential inconsistent state on partial failures.
- **Recommended Fix:** Use shorter-lived sessions with explicit `session.begin()` blocks, or at minimum add `session.rollback()` in the except block before `_mark_animation_failed`.

### 11. `_zip_stream` doesn't truly stream — builds entire ZIP in memory — Grade: C
- **File:** `backend/app/routers/download.py:32-52`
- **Type:** Performance
- **Description:** Despite the docstring claiming "stream zip creation without buffering," the implementation writes all files into a `BytesIO`-backed `ZipFile`. The `yield` inside the context manager only yields partial buffers, but `zf.write()` may buffer internally. For large jobs with many output files, this can consume significant memory.
- **Impact:** Memory spike when downloading large job outputs; potential OOM for bulk downloads.
- **Recommended Fix:** Use a streaming ZIP library (e.g., `zipstream-ng`) or write to a temp file and stream from disk.

### 12. `useImageZoom` onTouchStart reads stale state — Grade: C
- **File:** `frontend/src/hooks/useImageZoom.ts:58-78`
- **Type:** Bug
- **Description:** `onTouchStart` has `state.scale`, `state.translateX`, `state.translateY` in its dependency array, causing it to be recreated on every zoom change. This is correct for reading state but causes the handler to be re-registered frequently. More critically, the pan initialization at line 74 captures `state.translateX/Y` in closure, but by the time `onTouchMove` reads `panRef.current`, the state may have changed.
- **Impact:** Panning can jump/glitch when the user starts a pan gesture right after zooming.
- **Recommended Fix:** Read current translate values from a ref instead of state in the touch handlers.

### 13. `fetch_composite_data` re-lists S3 to find capture times instead of using fetched frames — Grade: D
- **File:** `backend/app/tasks/goes_tasks.py:310-330`
- **Type:** Performance
- **Description:** After fetching all bands, the task calls `list_available()` again to get capture times for composite generation. This makes an unnecessary S3 round-trip. The frames were already fetched and their capture times stored in the DB.
- **Impact:** Wasted S3 API calls and added latency; also the re-listed times may differ from what was actually fetched.
- **Recommended Fix:** Query `GoesFrame` records from the DB (filtered by `source_job_id=job_id`) instead of re-listing S3.

### 14. `useMonitorWebSocket` reconnects infinitely without backoff — Grade: C
- **File:** `frontend/src/hooks/useMonitorWebSocket.ts:53-57`
- **Type:** Resource Leak
- **Description:** On WebSocket close, the hook reconnects after a fixed 5s delay with no maximum retry count and no exponential backoff. If the server is down, this creates an infinite reconnection loop making a new connection attempt every 5 seconds forever.
- **Impact:** Battery drain on mobile, unnecessary network traffic, console spam when server is offline.
- **Recommended Fix:** Add exponential backoff and a max retry count (e.g., 20 attempts), matching the pattern in `useWebSocket.ts`.

### 15. No input validation on `max_frames_per_fetch` setting from DB — Grade: C
- **File:** `backend/app/tasks/goes_tasks.py:22-36`
- **Type:** Security
- **Description:** `_read_max_frames_setting` reads from the DB and casts to `int`, but doesn't validate the range. A user could set `max_frames_per_fetch` to 999999 via the settings API, bypassing the intended safeguard against OOM/disk exhaustion.
- **Impact:** A misconfigured setting could trigger massive S3 downloads, exhausting disk space or memory.
- **Recommended Fix:** Clamp the value: `max_frames_limit = max(1, min(int(setting.value), 1000))`.

### 16. `_stale_job_checker` background task silently swallows all exceptions — Grade: D
- **File:** `backend/app/main.py:54-62`
- **Type:** Polish
- **Description:** The stale job checker catches all `Exception` and logs at `debug` level. If the database is misconfigured or the cleanup logic has a bug, it will silently fail every 5 minutes forever with no visibility.
- **Impact:** Stale jobs accumulate without any indication of why cleanup isn't working.
- **Recommended Fix:** Log at `warning` level for unexpected errors (not just debug), or at least log at `info` periodically to confirm the checker is running.

### 17. Animation `duration_seconds` truncated to int — Grade: F
- **File:** `backend/app/tasks/animation_tasks.py:158`
- **Type:** Polish
- **Description:** `anim.duration_seconds = int(duration_seconds)` truncates the duration. A 0.5-second animation (5 frames at 10fps) is stored as 0 seconds.
- **Impact:** Short animations display "0s" duration in the UI, which is confusing.
- **Recommended Fix:** Use `round(duration_seconds, 1)` or change the DB column to float.

### 18. Settings page doesn't validate `video_fps` or `video_quality` bounds — Grade: D
- **File:** `frontend/src/pages/Settings.tsx:193-213`
- **Type:** UX
- **Description:** While the HTML inputs have `min`/`max` attributes, these are trivially bypassed. The form state accepts any number. Setting FPS to 0 or -5, or CRF to 999, would create invalid processing jobs.
- **Impact:** Invalid settings are saved and cause downstream job failures with unclear error messages.
- **Recommended Fix:** Add validation in `handleSave` (or the backend PUT endpoint) to reject out-of-range values.

### 19. `_normalize_band` loses precision by casting to uint8 before resize — Grade: D
- **File:** `backend/app/tasks/goes_tasks.py:267-274`
- **Type:** Bug
- **Description:** When bands need resizing, `band_array` (float32) is cast to `uint8` BEFORE resizing via PIL BILINEAR interpolation, then back to float32 for normalization. This double-quantizes the data, losing precision in the composite.
- **Impact:** Subtle banding artifacts in composite images where bands have different resolutions.
- **Recommended Fix:** Resize in float32 space (use `np.array(PILImage.fromarray(...).resize(...))` with the float data, or use `cv2.resize` on the float array directly).

### 20. `catalog_latest` checks 3 hours but iterates newest-to-oldest without early exit — Grade: D
- **File:** `backend/app/services/catalog.py:72-96`
- **Type:** Performance
- **Description:** The function iterates `hours_ago in range(3)` (most recent first) but doesn't break early when a result is found. Even after finding the latest frame in hour 0, it still makes S3 API calls for hours 1 and 2.
- **Impact:** Up to 2 unnecessary S3 list operations per `catalog_latest` call, adding ~1-2s latency.
- **Recommended Fix:** Break out of the loop once `latest` is populated and no newer entries can exist (i.e., after processing the most recent hour that returned results).

## Summary
- Critical (A): 0
- Major (B): 2
- Moderate (C): 9
- Minor (D): 7
- Cosmetic (F): 2
