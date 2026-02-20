# Satellite Processor — Improvement Plan

**Generated:** 2026-02-20
**Based on:** Deep code review + live API testing against `http://10.27.27.99:8001`

## Rating System
- 🔴 Critical (breaks functionality or terrible UX)
- 🟠 High Value (noticeable improvement to user experience)
- 🟡 Medium Value (polish that makes the app feel professional)
- 🟢 Nice to Have (cherry on top)

---

## Category 1: Error Handling & Edge Cases

### #1 — No delete confirmation dialog 🔴
- **Impact:** Users can accidentally delete frames with no undo — data is permanently lost (files removed from disk)
- **Current behavior:** Clicking "Delete" in BrowseTab toolbar or FrameActionMenu immediately fires `deleteMutation.mutate()` with no confirmation
- **Desired behavior:** Show a confirmation modal ("Delete 3 frames? This cannot be undone.") before executing
- **Files:** `frontend/src/components/GoesData/BrowseTab.tsx` (lines with `deleteMutation.mutate`), `FloatingBatchBar.tsx`
- **Effort:** Small

### #2 — Single-frame delete has no confirmation either 🔴
- **Impact:** Right-click → Delete on a single frame card immediately deletes it
- **Current behavior:** `handleSingleDelete` calls `deleteMutation.mutate([frame.id])` directly
- **Desired behavior:** At minimum a toast with "Undo" for 5 seconds, or a confirmation modal
- **Files:** `frontend/src/components/GoesData/BrowseTab.tsx` (`handleSingleDelete`)
- **Effort:** Small

### #3 — Empty bulk delete request returns validation error, not friendly message 🟡
- **Impact:** If somehow an empty selection triggers delete, user sees raw Pydantic error
- **Current behavior:** API returns `{"detail":[{"type":"too_short","loc":["body","ids"]...}]}` — frontend doesn't parse this well
- **Desired behavior:** Frontend should guard against empty selection before calling API; API error should be user-friendly
- **Files:** `frontend/src/components/GoesData/BrowseTab.tsx`, `backend/app/models/goes_data.py`
- **Effort:** Small

### #4 — Share link uses `HTTPException` instead of `APIError` 🟡
- **Impact:** Inconsistent error response format — frontend may not handle share errors properly
- **Current behavior:** `share.py` uses `raise HTTPException(...)` which returns `{"detail": "..."}` vs `{"error": "...", "detail": "...", "status_code": ...}`
- **Desired behavior:** Use `APIError` consistently so frontend error parsing works everywhere
- **Files:** `backend/app/routers/share.py`
- **Effort:** Small

### #5 — Shared frame image endpoint has no path validation 🟠
- **Impact:** Security gap — `get_shared_image` serves `frame.file_path` via `FileResponse` without validating it stays within storage
- **Current behavior:** Trusts that `frame.file_path` from DB is safe — if DB is ever corrupted/tampered, arbitrary files could be served
- **Desired behavior:** Run `validate_safe_path(frame.file_path, settings.storage_path)` before serving
- **Files:** `backend/app/routers/share.py` (`get_shared_image`)
- **Effort:** Small

### #6 — Fetch mutation error parsing is fragile 🟡
- **Impact:** When fetch fails, user may see "Failed to create fetch job" instead of the actual validation error
- **Current behavior:** FetchTab's `onError` tries to parse `response.data.detail` but the casting chain is complex and may miss cases
- **Desired behavior:** Create a shared `parseApiError(err)` utility that handles both `APIError` format and Pydantic validation format
- **Files:** `frontend/src/components/GoesData/FetchTab.tsx`, new `frontend/src/utils/errorParser.ts`
- **Effort:** Small

### #7 — Collection/tag query errors silently fail 🟡
- **Impact:** If the collections or tags endpoints fail in BrowseTab, filter dropdowns are just empty — no error indication
- **Current behavior:** `useQuery` silently returns empty data on error
- **Desired behavior:** Show a subtle error state in the filter sidebar ("Failed to load filters") with retry
- **Files:** `frontend/src/components/GoesData/BrowseTab.tsx`
- **Effort:** Small

---

## Category 2: Loading & Empty States

### #8 — Generic LoadingSpinner for all route transitions 🟠
- **Impact:** When navigating between pages, user sees a tiny spinner centered on screen — feels like the app is broken
- **Current behavior:** `App.tsx` `Suspense` fallback is a generic spinner (`<LoadingSpinner />`)
- **Desired behavior:** Use skeleton screens matching each page's layout, or at least a full-page branded loading state
- **Files:** `frontend/src/App.tsx`
- **Effort:** Medium

### #9 — Dashboard has no loading skeleton 🟡
- **Impact:** Dashboard loads data from multiple endpoints; user sees blank space until everything resolves
- **Current behavior:** OverviewTab likely renders empty until queries complete
- **Desired behavior:** Show skeleton cards matching the dashboard layout (stat cards, recent jobs, storage breakdown)
- **Files:** `frontend/src/components/GoesData/OverviewTab.tsx`
- **Effort:** Small

### #10 — AnimateTab empty state when no frames exist 🟠
- **Impact:** If user goes to Animate before fetching any data, they see form fields but submitting will create an empty animation
- **Current behavior:** Animation form allows submission even with 0 matching frames
- **Desired behavior:** Show "No frames match your criteria" before submission, or validate and show error after
- **Files:** `frontend/src/components/Animation/AnimateTab.tsx`
- **Effort:** Small

### #11 — StatsTab empty state 🟡
- **Impact:** Stats page with 0 frames shows empty charts/tables
- **Current behavior:** Likely renders chart components with no data
- **Desired behavior:** Show EmptyState component directing user to fetch data first
- **Files:** `frontend/src/components/GoesData/StatsTab.tsx`
- **Effort:** Small

### #12 — Collections/Tags empty states need better CTAs 🟡
- **Impact:** Empty collections list should guide user to create one, not just say "no collections"
- **Current behavior:** Likely generic empty state
- **Desired behavior:** "Create your first collection to organize frames" with a prominent button
- **Files:** `frontend/src/components/GoesData/CollectionsTab.tsx`
- **Effort:** Small

---

## Category 3: Mobile Polish

### #13 — Toast notifications overlap mobile bottom nav 🔴
- **Impact:** On mobile, toasts appear at `bottom-4 right-4` which sits directly on top of the bottom navigation bar
- **Current behavior:** `ToastContainer` is `fixed bottom-4 right-4` — no awareness of mobile nav height (~64px)
- **Desired behavior:** On mobile, position toasts above the bottom nav (`bottom-20` or use `safe-bottom` class), or position at top
- **Files:** `frontend/src/components/Toast.tsx`
- **Effort:** Small

### #14 — BrowseTab toolbar buttons overflow on mobile 🟠
- **Impact:** When frames are selected, the toolbar shows Delete/Collection/Tag/Process/Compare/Share/Export/Grid/List — this overflows on small screens
- **Current behavior:** Buttons wrap messily or overflow horizontally
- **Desired behavior:** On mobile, collapse batch actions into a bottom sheet or overflow menu; show only 2-3 primary actions inline
- **Files:** `frontend/src/components/GoesData/BrowseTab.tsx` (toolbar section)
- **Effort:** Medium

### #15 — Bottom sheet filter doesn't include Tag filter 🟡
- **Impact:** Mobile users can't filter by tag — the bottom sheet filters omit it
- **Current behavior:** Bottom sheet has Satellite, Band, Sector, Collection, Sort — but no Tag filter
- **Desired behavior:** Add Tag filter to mobile bottom sheet, matching desktop sidebar
- **Files:** `frontend/src/components/GoesData/BrowseTab.tsx` (BottomSheet section)
- **Effort:** Small

### #16 — Bottom sheet filter doesn't include Sort Order 🟡
- **Impact:** Mobile users can't switch between ascending/descending
- **Current behavior:** Bottom sheet has Sort By but no Order selector
- **Desired behavior:** Add Order toggle (Newest/Oldest) to bottom sheet
- **Files:** `frontend/src/components/GoesData/BrowseTab.tsx`
- **Effort:** Small

### #17 — LiveTab controls overflow on small mobile screens 🟠
- **Impact:** The top control bar has 4 dropdowns + checkboxes + buttons — on 375px screens they wrap poorly
- **Current behavior:** Controls wrap onto multiple lines, some hidden behind `hidden sm:flex`
- **Desired behavior:** On mobile, move satellite/sector/band selection into a compact popover or bottom sheet; keep only refresh/fullscreen in the overlay
- **Files:** `frontend/src/components/GoesData/LiveTab.tsx`
- **Effort:** Medium

### #18 — LiveTab height calculation has conflicting values 🟡
- **Impact:** Possible layout jank on some devices
- **Current behavior:** `h-[calc(100dvh-4rem)] md:h-[calc(100dvh-4rem)] max-md:h-[calc(100dvh-8rem)]` — the md and non-md values seem inconsistent/redundant
- **Desired behavior:** Clean up to account for header (4rem) + mobile bottom nav (4rem) properly
- **Files:** `frontend/src/components/GoesData/LiveTab.tsx`
- **Effort:** Small

### #19 — Fetch tab "Advanced Fetch" wizard not optimized for mobile 🟡
- **Impact:** Step indicators are tiny chips that are hard to tap; date inputs are small
- **Current behavior:** Steps are small rounded pills; datetime-local inputs use default styling
- **Desired behavior:** Bigger step indicators with clear active/completed states; larger touch targets for date inputs
- **Files:** `frontend/src/components/GoesData/FetchTab.tsx`
- **Effort:** Small

---

## Category 4: Data Validation & Safety

### #20 — Frontend download uses raw path from API response 🟠
- **Impact:** `handleDownload` constructs URL with `frame.file_path` which is an absolute server path — this works because `/api/download` validates it, but it's fragile
- **Current behavior:** `const url = '/api/download?path=' + encodeURIComponent(frame.file_path)` — uses absolute paths like `/app/data/goes/...`
- **Desired behavior:** Use the `image_url`/`thumbnail_url` from the API response, or a dedicated download endpoint by frame ID
- **Files:** `frontend/src/components/GoesData/BrowseTab.tsx` (`handleDownload`)
- **Effort:** Small

### #21 — Bulk tag uses SQLite-specific INSERT 🟠
- **Impact:** App breaks if migrated to PostgreSQL (which it runs in production Docker!)
- **Current behavior:** `from sqlalchemy.dialects.sqlite import insert as sqlite_insert` in `goes_data.py` — but Docker uses PostgreSQL
- **Desired behavior:** Use `from sqlalchemy.dialects.postgresql import insert` or use dialect-agnostic approach
- **Files:** `backend/app/routers/goes_data.py` (lines with `sqlite_insert`)
- **Effort:** Small

### #22 — Fetch time validation: start > end not caught frontend-side 🟡
- **Impact:** User can set start time after end time and submit; error only caught by API
- **Current behavior:** Frontend disables Fetch button only if `!startTime || !endTime || dateWarning`, but `dateWarning` doesn't check start > end
- **Desired behavior:** Add frontend validation: "Start time must be before end time"
- **Files:** `frontend/src/components/GoesData/FetchTab.tsx`
- **Effort:** Small

### #23 — No rate limit feedback to user 🟠
- **Impact:** When user hits rate limit (e.g., 5/min on fetch), they get a generic error — no indication they should wait
- **Current behavior:** SlowAPI returns 429 with a message, but frontend error handler shows generic "Failed to create fetch job"
- **Desired behavior:** Detect 429 status and show "Too many requests — please wait a moment" toast
- **Files:** `frontend/src/utils/errorParser.ts` (new), `frontend/src/api/client.ts`
- **Effort:** Small

### #24 — Collection name uniqueness not enforced 🟡
- **Impact:** User can create multiple collections with identical names — confusing
- **Current behavior:** `create_collection` doesn't check for existing name
- **Desired behavior:** Check uniqueness and return 409 if name exists (like tags do)
- **Files:** `backend/app/routers/goes_data.py` (`create_collection`)
- **Effort:** Small

---

## Category 5: Visual Polish & Consistency

### #25 — Inconsistent button styles across tabs 🟡
- **Impact:** Some buttons use `btn-primary-mix`, others use inline Tailwind classes — visual inconsistency
- **Current behavior:** FetchTab uses `btn-primary-mix`, BrowseTab uses custom bg/text classes, LiveTab uses `bg-primary`
- **Desired behavior:** Create shared button component or consistent utility classes for primary/secondary/danger actions
- **Files:** Multiple component files
- **Effort:** Medium

### #26 — Frame count display flickers during loading 🟡
- **Impact:** "X frames" text shows a skeleton placeholder, then jumps to the actual count — slight jank
- **Current behavior:** `{infiniteData ? totalFrames + ' frames' : <skeleton />}` — the skeleton is inline and different height
- **Desired behavior:** Use a consistent-height skeleton that matches the text size
- **Files:** `frontend/src/components/GoesData/BrowseTab.tsx`
- **Effort:** Small

### #27 — SharedFrame page uses hardcoded yellow accent 🟡
- **Impact:** The shared frame page uses `bg-yellow-500` and `bg-gray-950` which doesn't match the app's primary color theme
- **Current behavior:** Download button is yellow, background is near-black — doesn't match the rest of the app
- **Desired behavior:** Use the app's `primary` color and dark mode classes
- **Files:** `frontend/src/pages/SharedFrame.tsx`
- **Effort:** Small

### #28 — FrameCard badges (satellite/band) use hardcoded black overlay 🟢
- **Impact:** Badges look good on light images but may clash on dark satellite imagery
- **Current behavior:** `bg-black/60 text-white` regardless of image content
- **Desired behavior:** Consider adding a subtle text shadow or outline for legibility on any background
- **Files:** `frontend/src/components/GoesData/FrameCard.tsx`
- **Effort:** Small

### #29 — CompareSlider labels overlap on narrow screens 🟡
- **Impact:** "Previous" and "Current" labels at top-left and top-right overlap on mobile
- **Current behavior:** Labels are `absolute top-2 left-2` and `absolute top-2 right-2` — they can overlap when screen is narrow
- **Desired behavior:** Stack labels or use smaller text on mobile; or position them at bottom-left/bottom-right
- **Files:** `frontend/src/components/GoesData/CompareSlider.tsx`
- **Effort:** Small

---

## Category 6: Performance & Responsiveness

### #30 — No image error fallback in LazyImage 🟠
- **Impact:** If an image fails to load (404, network error), LazyImage shows a blank space forever
- **Current behavior:** `<img>` loads but no `onError` handler — if it fails, `isLoaded` stays false, showing invisible image
- **Desired behavior:** Add `onError` handler showing a broken image placeholder with retry button
- **Files:** `frontend/src/components/GoesData/LazyImage.tsx`
- **Effort:** Small

### #31 — BrowseTab re-renders entire grid on selection change 🟡
- **Impact:** Selecting/deselecting a frame re-renders all FrameCards because `selectedIds` is a new Set each time
- **Current behavior:** `selectedIds` state change triggers full grid re-render; FrameCard is memoized but receives `isSelected` prop
- **Desired behavior:** This is mostly fine due to `memo` on FrameCard, but verify with React DevTools; consider `useCallback` for `isSelected` check
- **Files:** `frontend/src/components/GoesData/BrowseTab.tsx`
- **Effort:** Small

### #32 — Bulk download creates entire ZIP in memory 🟡
- **Impact:** Large exports could OOM the server — documented as TODO in code
- **Current behavior:** `_zip_stream` builds entire ZIP in BytesIO then yields chunks (comment says "TODO: Replace with zipstream-ng")
- **Desired behavior:** Use `zipstream-ng` for true streaming ZIP generation
- **Files:** `backend/app/routers/download.py`
- **Effort:** Medium

### #33 — Dashboard stats not cached aggressively enough 🟢
- **Impact:** Dashboard makes multiple queries on every visit; 30s cache TTL means frequent DB hits
- **Current behavior:** `dashboard-stats` cached for 30s
- **Desired behavior:** Cache for 60-120s; data doesn't change that fast. Add manual refresh button for users who want fresh data
- **Files:** `backend/app/routers/goes_data.py` (`dashboard_stats`)
- **Effort:** Small

### #34 — Products endpoint does unnecessary async sleep 🟢
- **Impact:** Minor — adds tiny latency to every products request
- **Current behavior:** `async def _fetch(): await asyncio.sleep(0); return products` — the sleep(0) is unnecessary
- **Desired behavior:** Just return the products dict directly
- **Files:** `backend/app/routers/goes.py` (`list_products`)
- **Effort:** Small

---

## Category 7: Accessibility

### #35 — FrameCard grid/list containers lack ARIA roles 🟠
- **Impact:** Screen readers can't identify the frame grid as a list of items
- **Current behavior:** Grid is a plain `<div className="grid ...">` with no `role` or ARIA attributes
- **Desired behavior:** Add `role="list"` on container, `role="listitem"` on each card wrapper
- **Files:** `frontend/src/components/GoesData/BrowseTab.tsx` (`renderFrameGrid`)
- **Effort:** Small

### #36 — CompareSlider hidden range input needs better labeling 🟡
- **Impact:** Screen reader users can interact with the slider but don't know what the current value means
- **Current behavior:** `aria-label="Compare frames slider"` — no indication of what left/right means
- **Desired behavior:** Add `aria-valuetext` like "Showing 60% current frame, 40% previous frame"
- **Files:** `frontend/src/components/GoesData/CompareSlider.tsx`
- **Effort:** Small

### #37 — Modal backdrop is a `<button>` with no visual indication 🟡
- **Impact:** The click-to-close backdrop is a `<button>` element — keyboard users might tab to it and be confused
- **Current behavior:** `<button className="fixed inset-0 w-full h-full bg-transparent cursor-default" ... tabIndex={-1} />` — good that it has `tabIndex={-1}` in FetchTab but Modal.tsx doesn't set tabIndex
- **Desired behavior:** Add `tabIndex={-1}` to the backdrop button in Modal.tsx
- **Files:** `frontend/src/components/GoesData/Modal.tsx`
- **Effort:** Small

### #38 — BottomSheet dialog lacks Escape key handling 🟡
- **Impact:** Mobile users with external keyboards can't close the bottom sheet with Escape
- **Current behavior:** No keydown handler for Escape on the BottomSheet
- **Desired behavior:** Add Escape key listener to close the sheet
- **Files:** `frontend/src/components/GoesData/BottomSheet.tsx`
- **Effort:** Small

### #39 — Skip-to-content link missing 🟡
- **Impact:** Keyboard users must tab through the entire sidebar navigation to reach main content
- **Current behavior:** No skip link
- **Desired behavior:** Add hidden "Skip to main content" link that appears on focus, jumps to `<main>` area
- **Files:** `frontend/src/components/Layout.tsx`
- **Effort:** Small

### #40 — LazyImage alt text is generic 🟡
- **Impact:** Screen readers announce "GOES-19 C02" without context like sector, capture time
- **Current behavior:** `alt={frame.satellite + ' ' + frame.band}` in FrameCard
- **Desired behavior:** Include sector and time: "GOES-19 C02 CONUS frame from Feb 19, 2026 12:26 UTC"
- **Files:** `frontend/src/components/GoesData/FrameCard.tsx`
- **Effort:** Small

---

## Category 8: Test Infrastructure

### #41 — Coverage gates set to 0% 🟠
- **Impact:** Tests could be deleted and CI would still pass
- **Current behavior:** `--cov-fail-under=0` in all CI test jobs
- **Desired behavior:** Set backend to 75%, frontend to 65% minimum
- **Files:** `.github/workflows/test.yml`
- **Effort:** Small

### #42 — E2E tests exist but never run in CI 🟠
- **Impact:** 24 Playwright specs provide zero value since they're never executed
- **Current behavior:** Playwright specs exist in `frontend/e2e/` but no CI job runs them
- **Desired behavior:** Add a CI job that runs Playwright against `docker-compose.test.yml`
- **Files:** `.github/workflows/test.yml`, possibly new workflow file
- **Effort:** Medium

### #43 — CoverageBoost test files are low-value 🟡
- **Impact:** Inflated test count without proportional confidence
- **Current behavior:** Files like `CoverageBoost.test.tsx`, `CoverageBoost2.test.tsx`, `CoverageBoost3.test.tsx` likely test trivial branches
- **Desired behavior:** Audit and replace with meaningful integration tests; delete pure coverage-farming
- **Files:** `frontend/src/test/CoverageBoost*.test.tsx`
- **Effort:** Medium

### #44 — Frontend tests mock everything — no integration tests 🟡
- **Impact:** Tests verify component rendering but not actual data flow
- **Current behavior:** All API calls are mocked; TanStack Query behavior is mocked
- **Desired behavior:** Add a handful of integration tests using MSW (Mock Service Worker) that exercise real query/mutation flows
- **Files:** `frontend/src/test/` (new integration test files)
- **Effort:** Large

---

## Category 9: Backend Robustness

### #45 — SQLite dialect used in PostgreSQL production 🔴
- **Impact:** `sqlite_insert` with `on_conflict_do_nothing()` may silently fail or error in PostgreSQL
- **Current behavior:** `from sqlalchemy.dialects.sqlite import insert as sqlite_insert` in `goes_data.py` (bulk tag and collection frame add)
- **Desired behavior:** Use `from sqlalchemy.dialects.postgresql import insert` or detect dialect at runtime
- **Files:** `backend/app/routers/goes_data.py` (two occurrences)
- **Effort:** Small

### #46 — No pagination on tag deletion cascade 🟡
- **Impact:** Deleting a tag with thousands of frame associations could be slow
- **Current behavior:** `await db.delete(tag)` relies on cascade — could be slow for popular tags
- **Desired behavior:** Explicitly batch-delete `FrameTag` entries before deleting the tag
- **Files:** `backend/app/routers/goes_data.py` (`delete_tag`)
- **Effort:** Small

### #47 — Animation batch endpoint has no limit 🟠
- **Impact:** User could POST 100 animations at once, overwhelming the Celery worker
- **Current behavior:** `create_animation_batch` iterates over `payload.animations` with no size limit
- **Desired behavior:** Limit batch size to 10-20 animations per request
- **Files:** `backend/app/routers/animations.py`, `backend/app/models/animation.py`
- **Effort:** Small

### #48 — Cleanup rules endpoint missing from router check 🟡
- **Impact:** Minor — cleanup preview/execution endpoints should validate rule existence
- **Current behavior:** Cleanup tab queries `/goes/cleanup-rules` and `/goes/cleanup/preview` — need to verify these handle empty rules gracefully
- **Desired behavior:** Return empty list / zero-count preview when no rules exist
- **Files:** Backend cleanup router (not reviewed in detail)
- **Effort:** Small

### #49 — No connection pool tuning for PostgreSQL 🟡
- **Impact:** Under concurrent load, DB connections may be exhausted
- **Current behavior:** Default SQLAlchemy async pool settings
- **Desired behavior:** Configure `pool_size=10`, `max_overflow=20`, `pool_recycle=3600` in `database.py`
- **Files:** `backend/app/db/database.py`
- **Effort:** Small

---

## Category 10: Security Hardening

### #50 — API key defaults to empty string (auth disabled) 🟠
- **Impact:** Easy to accidentally deploy without authentication
- **Current behavior:** `api_key: str = ""` in config — empty means no auth required
- **Desired behavior:** Log a warning at startup if `api_key` is empty; consider requiring it in production mode
- **Files:** `backend/app/config.py`, `backend/app/main.py`
- **Effort:** Small

### #51 — CSP allows unsafe-inline for scripts and styles 🟡
- **Impact:** Reduces XSS protection significantly
- **Current behavior:** `'unsafe-inline'` in both script-src and style-src CSP directives
- **Desired behavior:** Use nonces for inline scripts; Tailwind JIT generates classes at build time so styles should be safe to tighten
- **Files:** `backend/app/security.py`
- **Effort:** Medium

### #52 — Share link expiry check is server-side only 🟡
- **Impact:** Frontend shows stale shared frame data even after link expires (until refresh)
- **Current behavior:** Expiry checked on API call; but if page was loaded before expiry, the image stays visible
- **Desired behavior:** Include `expires_at` in shared frame response; frontend shows countdown/expiry warning
- **Files:** `frontend/src/pages/SharedFrame.tsx`, `backend/app/routers/share.py`
- **Effort:** Small

### #53 — No CORS configuration visible in frontend requests 🟢
- **Impact:** If API and frontend are on different origins, CORS blocks may occur
- **Current behavior:** Frontend uses relative URLs (`/api/...`) which avoids CORS, but `CORS_ORIGINS` is configured in Docker env
- **Desired behavior:** Verify CORS is properly configured; document the expected origin setup
- **Files:** `backend/app/main.py`
- **Effort:** Small

---

## Category 11: UX Improvements

### #54 — No keyboard shortcut for common actions in BrowseTab 🟡
- **Impact:** Power users can't quickly select-all, delete, or navigate with keyboard
- **Current behavior:** `KeyboardShortcuts.tsx` exists but unclear what shortcuts are available in BrowseTab
- **Desired behavior:** Add `Ctrl+A` for select all, `Delete` for delete selected, `Escape` to clear selection
- **Files:** `frontend/src/components/GoesData/BrowseTab.tsx`, `frontend/src/components/KeyboardShortcuts.tsx`
- **Effort:** Small

### #55 — No "clear all filters" button 🟡
- **Impact:** After applying multiple filters, users must reset each one individually
- **Current behavior:** Each filter dropdown must be set back to "All" manually
- **Desired behavior:** Add a "Clear filters" button that appears when any filter is active
- **Files:** `frontend/src/components/GoesData/BrowseTab.tsx`
- **Effort:** Small

### #56 — Fetch progress not visible when navigating away from Fetch tab 🟠
- **Impact:** User starts a fetch, switches to Browse tab, has no idea if fetch is still running
- **Current behavior:** `FetchProgressBar` only shows on the Fetch tab
- **Desired behavior:** Show a persistent mini progress indicator in the sidebar or header when a fetch job is active
- **Files:** `frontend/src/components/Layout.tsx`, `frontend/src/components/GoesData/FetchProgressBar.tsx`
- **Effort:** Medium

### #57 — SharedFrame page doesn't use authenticated API client 🟡
- **Impact:** SharedFrame uses raw `axios` instead of the configured `api` client — won't attach API key
- **Current behavior:** `axios.get('/api/shared/${token}')` — this works because shared endpoints are public, but is inconsistent
- **Desired behavior:** Use the shared `api` client for consistency; shared endpoints should remain publicly accessible
- **Files:** `frontend/src/pages/SharedFrame.tsx`
- **Effort:** Small

### #58 — LiveTab "Download Latest" button missing 🟡
- **Impact:** Users viewing the live feed can't easily download the currently displayed frame
- **Current behavior:** No download button visible in the LiveTab overlay controls (only Refresh, Fullscreen, Monitor controls)
- **Desired behavior:** Add a download button to the bottom overlay controls
- **Files:** `frontend/src/components/GoesData/LiveTab.tsx`
- **Effort:** Small

---

## Summary

| Rating | Count | Key themes |
|--------|-------|------------|
| 🔴 Critical | 4 | Delete without confirmation, SQLite dialect in Postgres, toast overlapping nav |
| 🟠 High Value | 13 | Image error fallback, mobile toolbar overflow, rate limit UX, fetch progress visibility |
| 🟡 Medium Value | 31 | Accessibility, empty states, filter UX, visual consistency, validation |
| 🟢 Nice to Have | 4 | Performance tuning, minor polish |
| **Total** | **58** | |

### Recommended implementation order:
1. **Quick wins (1-2 days):** #1, #2, #5, #13, #21/#45, #30, #50
2. **High impact (3-5 days):** #8, #14, #17, #23, #41, #42, #56
3. **Polish pass (ongoing):** Accessibility items, empty states, visual consistency
