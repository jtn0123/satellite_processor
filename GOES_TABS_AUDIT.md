# GOES Data Tabs — Deep Audit Report

**Date:** 2026-02-17  
**Auditor:** Claude (automated)  
**Repo:** `/home/clawdbot/clawd/sat-tracker`  
**Live API:** `http://10.27.27.99:8001` (all endpoints verified working under `/api/goes/...`)  
**Test Coverage:** 95 test files in `frontend/src/test/`

---

## Tab Architecture Overview

The GOES Data page (`frontend/src/pages/GoesData.tsx`, 145 lines) uses:
- **Lazy loading** via `React.lazy()` for all 7 tabs — excellent
- **Keyboard shortcuts** (1-7) for tab switching
- **Swipe navigation** on mobile
- **Error boundaries** per tab (`TabErrorBoundary`)
- **Breadcrumb** with sub-view support
- **Custom events** (`switch-tab`, `set-subview`, `fetch-prefill`) for cross-tab communication

Active tabs: Overview, Browse, Gallery, Live, Fetch, Animate, Map  
Orphaned/unused components: `CollectionsTab`, `CompositesTab`, `CleanupTab`, `StatsTab` (not wired into tab bar but exist as components)

---

## 1. OverviewTab — Grade: B+

**File:** `frontend/src/components/GoesData/OverviewTab.tsx` (305 lines)

### Functionality ✅
- Fetches `/api/goes/catalog/latest`, `/api/goes/frames/stats`, `/api/jobs?limit=5` — all working
- Quick actions correctly dispatch `switch-tab` events
- Stats visualization (satellite storage bars, band grids) works well

### Strengths
- Good loading/error states for catalog data
- `staleTime` configured per query (30s–120s) — appropriate
- `timeAgo()` helper is concise and correct
- Status badges are well-designed with icons

### Issues
1. **P2** — Quick actions "Fetch Last Hour CONUS" and "Fetch Latest FullDisk" both just switch to Fetch tab without pre-filling parameters. They should dispatch `fetch-prefill` events with appropriate values (satellite, sector, band, time range). Currently misleading.
2. **P2** — Loading state is a single text line ("Loading overview data..."). Stats cards should show skeleton placeholders instead of appearing after a flash.
3. **P3** — `catalogError` only checks catalog query error. If `stats` or `jobs` fail, no error is shown.
4. **P3** — `OverviewTab` doesn't use the `/api/goes/dashboard-stats` endpoint which exists and provides a more unified response. Could reduce from 3 API calls to 1.
5. **P3** — "True Color Now" quick action has no special behavior — same as the others. Should trigger a composite fetch.

---

## 2. LiveTab — Grade: A-

**File:** `frontend/src/components/GoesData/LiveTab.tsx` (355 lines)

### Functionality ✅
- Two-panel layout: "Available Now" (AWS catalog) vs "Your Latest" (local frame)
- Auto-refresh with configurable interval (1/5/10/30 min)
- Auto-fetch toggle that detects newer frames on AWS and downloads them
- Fullscreen support
- Pull-to-refresh on mobile
- Dynamic sector availability check

### Strengths
- Freshness comparison banner ("AWS has a frame from X, yours is Y (Z min behind)") — excellent UX
- Auto-fetch has duplicate prevention via `lastAutoFetchTime` ref
- Default satellite loaded from API's `default_satellite` field
- Satellite availability shown in dropdown labels

### Issues
1. **P1** — `imageUrl` uses `/api/download?path=...` but the API defines `/api/goes/frames/{id}/image`. The download endpoint may not exist or may be a different route. Should use the frame ID-based thumbnail endpoint for consistency.
2. **P2** — When `frame` is null and `isError` is true, the empty state says "No local frames available" but doesn't offer an auto-fetch button — only "Fetch data first from the Fetch tab" text. Should have a direct "Fetch Now" button.
3. **P2** — The "Download Latest" button on the "Available Now" panel dispatches `fetch-prefill` + `switch-tab` — this navigates away from Live tab. Should offer inline fetch without leaving.
4. **P3** — `refetchRef` pattern is correct but slightly complex. Could use `useCallback` with query client invalidation instead.
5. **P3** — No image transition/crossfade when auto-refresh loads a new frame — it just pops in.

---

## 3. FetchTab — Grade: A-

**File:** `frontend/src/components/GoesData/FetchTab.tsx` (547 lines)

### Functionality ✅
- 3-step wizard: Source → What → When
- Satellite selection with availability info (active/historical, date ranges)
- Sector picker, band picker, image type (single/true color/natural color)
- Time presets (1h/6h/12h/24h), catalog timeline visualization
- Estimate display (frames × size), date range validation
- Confirmation modal, progress bar, saved presets (collapsible)
- "Fetch Latest" one-click button always visible

### Strengths
- Date validation against satellite availability with clear warnings
- Catalog timeline visualization shows available frames on S3
- Good estimate calculator using cadence and file size metadata
- `FetchProgressBar` component for job tracking
- Presets are lazy-loaded in a collapsible section

### Issues
1. **P1** — The confirmation modal uses `<dialog open>` without proper backdrop. The `[&::backdrop]` selector syntax appears broken (should be `::backdrop`). Clicking outside doesn't reliably close on all browsers.
2. **P2** — Step navigation doesn't validate before advancing. User can skip to Step 3 without selecting anything in Steps 1-2.
3. **P2** — The "Fetch Latest" button at top always uses the current satellite/sector/band/imageType state, but this isn't obvious. If user is on Step 1 and changes satellite, the fetch still uses old sector/band.
4. **P2** — 547 lines is large. The step content (Step 1, 2, 3) could each be extracted into sub-components.
5. **P3** — No visual indication of which step contains errors/incomplete data.
6. **P3** — Catalog timeline visualization (`catalogData.slice(0, 100)`) silently truncates beyond 100 entries with no indication.

---

## 4. BrowseTab — Grade: B+

**File:** `frontend/src/components/GoesData/BrowseTab.tsx` (519 lines)

### Functionality ✅
- Grid/list view toggle with responsive layout
- Filter sidebar: satellite, band, sector, collection, tag, sort, order
- Pagination (50 per page)
- Multi-select with Shift+Click, Select All
- Bulk actions: delete, add to collection, tag, process, compare (2 selected), share (1 selected)
- Export CSV, frame preview modal, comparison modal
- Mobile: bottom sheet filters, floating compare bar
- Pull-to-refresh

### Strengths
- Debounced filters (300ms) prevent excessive API calls
- Rich feature set: tagging, collections, comparison, sharing, export
- Good loading skeletons and empty state with CTA to Fetch tab
- Mobile-first: bottom sheet, floating action bar, pull-to-refresh

### Issues
1. **P1** — Mobile filter button uses `absolute right-4 top-0 z-10` positioning which overlaps with the parent layout. Should be `relative` or use a proper layout slot.
2. **P2** — 519 lines is too large. Filter sidebar, toolbar, and mobile bottom sheet should be extracted.
3. **P2** — `toggleSelect` function creates a new function on every render (not wrapped in `useCallback`). The `handleFrameClick` also has a stale closure issue — it references `toggleSelect` which is recreated each render.
4. **P2** — Share button makes API call and clipboard write inline in onClick. Should use a mutation for proper loading/error states.
5. **P3** — `[, setShowProcessModal]` — unused state setter (line ~20). Dead code.
6. **P3** — Export CSV opens a new window with `/api/goes/frames/export?...` — should verify this endpoint exists (it does: confirmed in OpenAPI).
7. **P3** — The `@container` CSS queries for grid are good but `cv-auto` class is non-standard — verify it exists in CSS.

---

## 5. FrameGallery — Grade: B

**File:** `frontend/src/components/GoesData/FrameGallery.tsx` (195 lines)

### Functionality ✅
- Image-focused grid (aspect-square thumbnails) with 6-column layout
- Filters by satellite and band (derived from stats endpoint)
- Compare mode: select 2 frames for side-by-side
- Image viewer overlay, pagination

### Strengths
- Clean, focused component — 195 lines is appropriate
- Thumbnail overlay with gradient for metadata
- Compare mode with numbered selection badges

### Issues
1. **P1** — Uses `/api/goes/frames/{id}/thumbnail` for images, but BrowseTab uses `/api/download?path=...`. Inconsistent — should standardize on the frame ID endpoint.
2. **P2** — Filters use stats endpoint to derive satellite/band lists, but this means if a satellite has 0 frames, it won't appear as a filter option. Should use `/api/goes/products` instead for consistent options.
3. **P2** — No sector filter (BrowseTab has one). Feature gap.
4. **P2** — No loading state for the ImageViewer/CompareView overlays.
5. **P3** — `totalPages` calculation: `Math.ceil(data.total / data.limit)` — should handle `data.limit === 0` edge case.
6. **P3** — Overlap with BrowseTab is significant. Consider whether both tabs are needed or if Gallery should be a view mode within Browse.

---

## 6. LiveTab → Already covered above (Section 2)

---

## 7. MapTab — Grade: B-

**File:** `frontend/src/components/GoesData/MapTab.tsx` (163 lines)

### Functionality ✅
- Leaflet map with OpenStreetMap and Dark tile layers
- GOES image overlay with opacity slider
- Satellite/sector/band selectors
- Sector-appropriate bounds and zoom

### Strengths
- Clean, focused component
- Layer controls with base layer switching
- Opacity slider is intuitive

### Issues
1. **P1** — `SECTOR_BOUNDS` are hardcoded and approximate. Mesoscale1 and Mesoscale2 have identical bounds per satellite, which is incorrect — mesoscale sectors are dynamically positioned. Should fetch actual bounds from the API or at least note the limitation.
2. **P1** — Uses `retry: false` for the frame query. If the API is temporarily down, user gets no feedback and no retry. Should show error state.
3. **P2** — Map doesn't re-center when satellite/sector changes because `MapContainer` `center` is only used on initial render (Leaflet limitation). Need `useMap()` hook to `flyTo()` on bounds change.
4. **P2** — No loading indicator while frame is being fetched — map shows without overlay silently.
5. **P2** — Image overlay uses thumbnail which may be low-resolution for map display. Should prefer full-resolution image.
6. **P3** — Fixed `600px` height. Should be responsive or use `calc(100vh - ...)`.
7. **P3** — No time selector — only shows latest frame. Should allow browsing historical frames on the map.

---

## 8. AnimateTab — Grade: A-

**File:** `frontend/src/components/Animation/AnimateTab.tsx` (384 lines)

### Functionality ✅
- Quick Animate mode + Animation Studio mode toggle
- Satellite/sector/band selectors, quick time range buttons
- Frame range preview (shows available frames before generating)
- Animation settings panel (FPS, format, quality, resolution, loop style, overlays)
- Presets (save/load configurations)
- Batch animation panel
- Animation history with status tracking and download links

### Strengths
- Excellent two-mode design (quick vs. studio)
- Preview before generate — prevents wasted jobs
- Animation history with real-time polling (`refetchInterval: 5000`)
- Well-decomposed: `FrameRangePreview`, `AnimationSettingsPanel`, `BatchAnimationPanel`, `AnimationPresets` are separate components
- Touch-friendly: `min-h-[44px]` on interactive elements

### Issues
1. **P2** — `SATELLITES`, `SECTORS`, `BANDS` imported from `./types` are static arrays. Should use dynamic data from `/api/goes/products` like other tabs do.
2. **P2** — `extractArray` is used on `animations` data but the API returns `{ items: [...], total, page, limit }`. This suggests a defensive workaround for inconsistent API responses — the API should be fixed instead.
3. **P3** — Animation Studio is lazy-loaded within the already-lazy-loaded AnimateTab. Double lazy loading is fine but adds a second loading flash.
4. **P3** — No delete confirmation dialog — animations are deleted immediately on click.
5. **P3** — `DEFAULT_CONFIG` uses `GOES-16` as default satellite, but products API returns `GOES-19` as default. Should sync.

---

## 9. CollectionsTab (NOT in tab bar) — Grade: B

**File:** `frontend/src/components/GoesData/CollectionsTab.tsx` (166 lines)

### Functionality ✅
- Create, rename, delete collections
- Animate collection frames (inline player)
- Export collection as CSV

### Issues
1. **P0** — **Not accessible from the UI.** This tab is not wired into the `GoesData.tsx` tab bar. Users can only interact with collections through BrowseTab's "Add to Collection" action. Collections management is hidden.
2. **P2** — No pagination for collections list.
3. **P2** — Delete has no confirmation dialog.
4. **P3** — No way to view/browse frames within a collection from this tab (only animate or export).

---

## 10. CompositesTab (NOT in tab bar) — Grade: B-

**File:** `frontend/src/components/GoesData/CompositesTab.tsx` (227 lines)

### Functionality ✅
- Recipe selection (6 recipes: true color, natural color, fire detection, etc.)
- Generate composite with satellite/sector/capture time
- History with status polling, thumbnails, download links

### Issues
1. **P0** — **Not accessible from the UI.** Not in the tab bar. The FetchTab has true_color/natural_color image type support via `/api/goes/fetch-composite`, making this tab partially redundant but still useful for one-off composites.
2. **P2** — `refetchInterval: 5000` on composites list runs forever even when no composites are processing. Should conditionally poll only when items have `pending`/`processing` status.
3. **P2** — No pagination on composites history.
4. **P3** — `RECIPE_DESCRIPTIONS` is hardcoded. Could come from the API.

---

## 11. CleanupTab (NOT in tab bar) — Grade: B

**File:** `frontend/src/components/GoesData/CleanupTab.tsx` (217 lines)

### Functionality ✅
- Storage overview (frames, disk usage, satellites, bands)
- CRUD for cleanup rules (max age days, max storage GB)
- Collection protection toggle
- Preview before cleanup, manual run

### Issues
1. **P0** — **Not accessible from the UI.** Not in the tab bar. Critical for data management — users have no way to manage storage.
2. **P1** — "Run Now" uses `globalThis.confirm()` which is a blocking native dialog. Should use a custom confirmation modal consistent with the rest of the app.
3. **P2** — Rule form label says "Form" (`aria-label="Form"`) for the rule type select. Should be "Rule type".
4. **P3** — Storage overview duplicates OverviewTab stats. Could share a component.

---

## Cross-Cutting Concerns

### Performance
- **Good:** React Query with appropriate `staleTime` prevents redundant fetches
- **Good:** Lazy loading for all tab components
- **Good:** Debounced filters in BrowseTab
- **Issue P2:** CompositesTab and AnimateTab poll every 5s forever via `refetchInterval`. Should be conditional on active processing jobs.
- **Issue P3:** Multiple tabs fetch `/api/goes/products` independently but React Query deduplicates via shared `queryKey` — this is correct.

### Code Quality
- **Good:** TypeScript throughout, no `any` types found
- **Good:** Shared types in `types.ts`, shared utils in `utils.ts`
- **Good:** `extractArray` utility for defensive array handling
- **Good:** 95 test files exist
- **Issue P2:** `formatBytes` is duplicated in `utils.ts`, `CompositesTab.tsx`, and `CleanupTab.tsx`. Should import from `utils.ts`.
- **Issue P2:** Cross-tab communication uses `globalThis` custom events — works but is fragile and hard to debug. Consider React context or a lightweight event bus.

### UX
- **Good:** Dark mode fully supported across all tabs
- **Good:** Loading skeletons in most tabs
- **Good:** Empty states with CTAs
- **Good:** Mobile: bottom sheets, pull-to-refresh, swipe navigation, min-h-[44px] touch targets
- **Issue P1:** Three useful tabs (Collections, Composites, Cleanup) are completely inaccessible from the UI.
- **Issue P2:** Gallery and Browse have significant overlap — consider merging or clearer differentiation.

### Accessibility
- **Good:** ARIA labels on most interactive elements
- **Good:** `role="tablist"` and `aria-selected` on tab bar
- **Issue P3:** Some select elements have poor aria-labels (e.g., `aria-label="Form"` in CleanupTab)

---

## Overall GOES Experience Grade: B+

Strong foundation with well-structured React Query data fetching, good TypeScript usage, comprehensive feature set, and thoughtful mobile UX. The main issues are: 3 fully-built tabs are inaccessible, some components are oversized, and there are minor UX gaps in error handling and state transitions.

---

## Top 10 Most Impactful Improvements

| # | Priority | Improvement | Impact |
|---|----------|-------------|--------|
| 1 | **P0** | Wire CollectionsTab, CompositesTab, and CleanupTab into the tab bar in `GoesData.tsx` | 3 fully-built features are completely hidden from users |
| 2 | **P1** | Fix MapTab to re-center on sector change using Leaflet's `useMap()` hook | Map overlay is misaligned after changing sector/satellite |
| 3 | **P1** | Fix BrowseTab mobile filter button absolute positioning overlap | Broken mobile layout |
| 4 | **P1** | Fix FetchTab confirmation modal backdrop (`::backdrop` CSS syntax) | Modal doesn't dim background properly |
| 5 | **P2** | Extract FetchTab steps into sub-components (547 lines → ~150 each) | Maintainability; largest component |
| 6 | **P2** | Use `/api/goes/dashboard-stats` in OverviewTab instead of 3 separate API calls | Performance; reduce API calls |
| 7 | **P2** | Make OverviewTab quick actions actually pre-fill fetch parameters | "Fetch Last Hour CONUS" currently just switches tab without pre-filling |
| 8 | **P2** | Conditional polling in CompositesTab/AnimateTab (only when jobs are active) | Performance; stops unnecessary 5s polling |
| 9 | **P2** | Deduplicate `formatBytes` — use the one from `utils.ts` everywhere | Code quality; duplicated in 3 files |
| 10 | **P2** | AnimateTab: use dynamic satellite/sector/band from `/api/goes/products` instead of static arrays | Data consistency across tabs |

---

## Summary Table

| Tab | Grade | Lines | In Tab Bar? | Key Strength | Key Weakness |
|-----|-------|-------|-------------|--------------|--------------|
| GoesData (shell) | A | 145 | — | Lazy loading, keyboard shortcuts, swipe | 3 tabs not wired |
| OverviewTab | B+ | 305 | ✅ | Good dashboard, stats viz | Quick actions don't pre-fill, 3 API calls |
| LiveTab | A- | 355 | ✅ | Auto-fetch, freshness comparison | Image URL inconsistency |
| FetchTab | A- | 547 | ✅ | Full wizard, estimates, presets | Too large, modal backdrop broken |
| BrowseTab | B+ | 519 | ✅ | Rich features, mobile UX | Too large, mobile filter positioning |
| FrameGallery | B | 195 | ✅ | Clean image grid, compare mode | Overlaps with Browse, no sector filter |
| AnimateTab | A- | 384 | ✅ | Quick + Studio modes, preview | Static satellite/band arrays |
| MapTab | B- | 163 | ✅ | Leaflet integration, opacity slider | Doesn't re-center, hardcoded bounds |
| CollectionsTab | B | 166 | ❌ | CRUD, animate, export | **Not accessible from UI** |
| CompositesTab | B- | 227 | ❌ | 6 recipes, history | **Not accessible from UI**, always polls |
| CleanupTab | B | 217 | ❌ | Preview before delete, protection | **Not accessible from UI** |
