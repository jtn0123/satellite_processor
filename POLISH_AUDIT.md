# Satellite Processor — UI/UX Polish Audit

**Date:** 2026-02-17  
**Auditor:** Claude (subagent)  
**Scope:** Full frontend codebase + backend API surface review

---

## 1. Bug Hunt

### 🔴 Critical

**1.1 Live Tab: `catalog/latest` only checks C02 band regardless of selection**  
- **File:** `backend/app/services/catalog.py` → `catalog_latest()` (line ~93)
- The `catalog_latest` function hardcodes `band = "C02"` and ignores the `band` query parameter. The frontend (`LiveTab.tsx` line ~88) passes `satellite` and `sector` params but the backend route (`goes.py` → `catalog_latest`) only accepts `satellite` and `sector` — **no `band` param**.
- **Impact:** The "Available Now" panel in Live tab always shows C02 data regardless of what band the user selected. Auto-fetch will fetch incorrect data.
- **Fix:** Add `band` query param to `/goes/catalog/latest` endpoint and pass it through to `catalog_latest()`.

**1.2 Live Tab: Auto-fetch uses wrong parameters from catalog response**  
- **File:** `frontend/src/components/GoesData/LiveTab.tsx` (line ~102)
- The auto-fetch posts `catalogLatest.band` (always "C02" per bug above) but falls back to user-selected `band`. Since `catalogLatest.band` is always populated, it will always use "C02" even if user selected C13.
- **Impact:** Auto-fetch downloads wrong band data silently.

**1.3 BrowseTab: Share endpoint URL construction assumes `/api/goes/frames/:id/share` exists**  
- **File:** `frontend/src/components/GoesData/BrowseTab.tsx` (line ~138)
- The share button calls `api.post(\`/goes/frames/${frameId}/share\`)` — this endpoint exists in `share.py` so this works. However, it constructs `${globalThis.location.origin}${res.data.url}` which gives `/shared/:token` — but the React route is `shared/:token` (no leading slash in route definition). **Actually, the route `path="shared/:token"` is relative to the BrowserRouter root, so it resolves to `/shared/:token`** — this works correctly.
- **Not a bug**, withdrawing.

### 🟠 High

**1.4 Live Tab: Freshness bar uses amber-300 text in light mode — nearly invisible**  
- **File:** `LiveTab.tsx` (line ~141)
- `text-amber-300` on light backgrounds is extremely low contrast. Should use `text-amber-600 dark:text-amber-300`.
- **Severity:** High (accessibility/readability)

**1.5 Live Tab: "Download Latest" button dispatches `switch-tab` to fetch tab but doesn't pre-fill parameters**  
- **File:** `LiveTab.tsx` (line ~162)
- Clicking "Download Latest" switches to Fetch tab but doesn't pass the satellite/sector/band context. User has to re-select everything.
- **Severity:** High (UX friction)

**1.6 Live Tab: Image overlay info positioned `absolute bottom-4 right-4` but parent lacks `relative`**  
- **File:** `LiveTab.tsx` (line ~200)
- The frame info overlay (`{frame && (<div className="absolute bottom-4 right-4 ...">`) is inside a div that only has `relative` positioning when in fullscreen mode (the container). In non-fullscreen mode, `absolute` positioning will anchor to the nearest positioned ancestor, which may not be the image container.
- **Severity:** High (visual bug — overlay may appear in wrong place)

**1.7 CleanupTab: `cleanup/run` endpoint used but no confirmation about active rules**  
- **File:** `CleanupTab.tsx` (line ~77)
- Uses `globalThis.confirm()` which is a browser native dialog — inconsistent with the rest of the UI which uses custom modals. Also no indication of what rules will execute.
- **Severity:** Medium

**1.8 MapTab: Default satellite is `GOES-16` (historical) instead of `GOES-19`**  
- **File:** `MapTab.tsx` (line ~51)
- `useState('GOES-16')` — should default to `GOES-19` for consistency with the rest of the app. Users will likely have no GOES-16 data if they're new.
- **Severity:** High

**1.9 CompositesTab: Default satellite is `GOES-16` instead of `GOES-19`**  
- **File:** `CompositesTab.tsx` (line ~50)
- Same issue as MapTab.
- **Severity:** High

### 🟡 Medium

**1.10 FrameGallery: No default satellite set from API — uses empty string**  
- **File:** `FrameGallery.tsx` (line ~11)
- `useState('')` for satellite/band. Works as "All" but inconsistent with other tabs that try to set a default.

**1.11 BrowseTab: Filter sidebar hidden on mobile, toggle button uses `absolute right-4 top-0` positioning**  
- **File:** `BrowseTab.tsx` (line ~126)
- The "Filters" mobile button is absolutely positioned which may overlap with other elements depending on scroll position.

**1.12 BrowseTab: Export CSV doesn't respect collection or tag filters**  
- **File:** `BrowseTab.tsx` (line ~169)
- Export only passes satellite, band, sector. Missing collection_id and tag filter params.

**1.13 BrowseTab: `setShowProcessModal(false)` — the state setter exists but `showProcessModal` is never read**  
- **File:** `BrowseTab.tsx` (line ~32)
- `const [, setShowProcessModal] = useState(false)` — destructured but first element discarded. Dead state.

**1.14 WebSocket hook: No error event handler**  
- **File:** `hooks/useWebSocket.ts`
- Missing `ws.onerror` handler. Errors will still trigger `onclose` but won't be logged/surfaced.

**1.15 FetchTab: Confirmation dialog uses `<dialog open>` but positioned with `fixed inset-0`**  
- **File:** `FetchTab.tsx` (line ~188)
- Uses `dialog` element with `open` attribute directly (not `.showModal()`). This means no native backdrop, no Escape-to-close, no focus trapping. The manual backdrop implementation via onClick is fragile.

### 🟢 Low

**1.16 CollectionsTab: Export button opens CSV in new tab but the backend endpoint `/goes/frames/export` doesn't support `collection_id` filter**  
- **File:** `CollectionsTab.tsx` (line ~100)  
- Actually checking the backend: `list_frames` route does accept `collection_id`. But `export_frames` route does NOT accept collection_id. So exporting from collection view exports ALL frames.
- **Severity:** Upgraded to **Medium** — data mismatch.

**1.17 OverviewTab: Quick actions all just switch tabs, no actual pre-filling**  
- Quick actions like "Fetch Last Hour CONUS" just switch to the Fetch tab. They don't pre-fill the form with CONUS/1hr params.

---

## 2. Live Tab — Deep Dive

### Current Data Flow

```
LiveTab.tsx
  ├── GET /api/goes/products → static list of satellites, sectors, bands
  ├── GET /api/goes/latest?satellite=X&sector=Y&band=Z → latest LOCAL frame from DB
  ├── GET /api/goes/catalog/latest?satellite=X&sector=Y → latest on AWS S3 (C02 only!)
  └── POST /api/goes/fetch → triggers download job (auto-fetch mode)
```

### Core Problem: Dropdowns Show All Options, Not What's Available

The `/goes/products` endpoint returns a **static** list of all possible satellites, sectors, and bands. It doesn't check:
1. Which satellites actually have data on S3 right now
2. Which sectors are active for a given satellite
3. Which bands have recent captures

For example, Mesoscale sectors are repositioned constantly — the static list doesn't tell users where Mesoscale1/2 are currently pointing.

### Proposed Fix: Dynamic Availability Endpoint

#### Backend Changes

**New endpoint: `GET /api/goes/catalog/available`**

```python
# backend/app/routers/goes.py

@router.get("/catalog/available")
@limiter.limit("10/minute")
async def catalog_available(
    request: Request,
    satellite: str = Query("GOES-19"),
):
    """Check which sectors and bands have recent data (last 2 hours) on S3."""
    from ..services.catalog import catalog_available as _catalog_available
    
    cache_key = make_cache_key(f"catalog-available:{satellite}")
    
    async def _fetch():
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: _catalog_available(satellite))
    
    return await get_cached(cache_key, ttl=120, fetch_fn=_fetch)
```

```python
# backend/app/services/catalog.py

def catalog_available(satellite: str) -> dict:
    """Check which sectors/bands have data in the last 2 hours."""
    validate_params(satellite, "CONUS", "C02")  # just validates satellite
    bucket = SATELLITE_BUCKETS[satellite]
    s3 = _get_s3_client()
    now = datetime.now(UTC)
    
    available_sectors = {}
    for sector in SECTOR_PRODUCTS:
        # Check C02 (most common) for each sector
        for hours_ago in range(2):
            dt = now - timedelta(hours=hours_ago)
            prefix = _build_s3_prefix(satellite, sector, "C02", dt)
            try:
                resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=1)
                if resp.get("Contents"):
                    available_sectors[sector] = True
                    break
            except Exception:
                pass
    
    return {
        "satellite": satellite,
        "available_sectors": list(available_sectors.keys()),
        "checked_at": now.isoformat(),
    }
```

#### Frontend Changes

```typescript
// LiveTab.tsx — add availability query
const { data: availability } = useQuery({
  queryKey: ['goes-available', satellite],
  queryFn: () => api.get('/goes/catalog/available', { params: { satellite } }).then(r => r.data),
  enabled: !!satellite,
  staleTime: 120000,
});

// Filter sectors dropdown to only show available ones
const availableSectors = availability?.available_sectors ?? [];
// In the sector <select>:
{(products?.sectors ?? []).map((s) => (
  <option key={s.id} value={s.id} disabled={availableSectors.length > 0 && !availableSectors.includes(s.id)}>
    {s.name} {availableSectors.length > 0 && !availableSectors.includes(s.id) ? '(unavailable)' : ''}
  </option>
))}
```

#### Fix `catalog/latest` to accept band parameter

```python
# backend/app/routers/goes.py — modify catalog_latest
@router.get("/catalog/latest")
@limiter.limit("30/minute")
async def catalog_latest(
    request: Request,
    satellite: str = Query("GOES-19"),
    sector: str = Query("CONUS"),
    band: str = Query("C02"),  # ADD THIS
):
    from ..services.catalog import catalog_latest as _catalog_latest
    cache_key = make_cache_key(f"catalog-latest:{satellite}:{sector}:{band}")
    async def _fetch():
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: _catalog_latest(satellite, sector, band))
    result = await get_cached(cache_key, ttl=60, fetch_fn=_fetch)
    if not result:
        raise APIError(404, "not_found", "No recent frames found")
    return result
```

```python
# backend/app/services/catalog.py — modify catalog_latest to accept band
def catalog_latest(satellite: str, sector: str, band: str = "C02") -> dict | None:
    validate_params(satellite, sector, band)
    # ... rest of function uses the band parameter instead of hardcoded "C02"
```

---

## 3. Animation/Preview Feature Gap

### Problem
When selecting satellite imagery options (bands, sectors), users see text labels but have no visual sense of what each option looks like. This is especially confusing for band selection (C01-C16).

### Proposed Solution: Thumbnail Previews in Selectors

#### Architecture

```
User opens BandPicker → component fetches preview thumbnails → inline display

Data flow:
  GET /api/goes/preview/thumbnails?satellite=X&sector=Y
  → Returns { "C01": "/api/goes/preview/thumb/C01?...", "C02": "...", ... }
  → Or: Returns pre-generated thumbnail URLs for each band
```

#### Backend: Preview Thumbnail Endpoint

```python
# backend/app/routers/goes.py

@router.get("/preview/band-samples")
@limiter.limit("10/minute")
async def band_sample_thumbnails(
    request: Request,
    satellite: str = Query("GOES-19"),
    sector: str = Query("CONUS"),
    db: AsyncSession = Depends(get_db),
):
    """Return thumbnail URLs for the latest frame of each band.
    Uses locally stored frames if available, otherwise returns null.
    """
    results = {}
    for band in VALID_BANDS:
        result = await db.execute(
            select(GoesFrame.id, GoesFrame.thumbnail_path)
            .where(
                GoesFrame.satellite == satellite,
                GoesFrame.sector == sector,
                GoesFrame.band == band,
            )
            .order_by(GoesFrame.capture_time.desc())
            .limit(1)
        )
        row = result.first()
        if row and row.thumbnail_path:
            results[band] = f"/api/goes/frames/{row.id}/thumbnail"
        else:
            results[band] = None
    
    return {
        "satellite": satellite,
        "sector": sector,
        "thumbnails": results,
    }
```

#### Frontend: Enhanced BandPicker with Previews

```typescript
// BandPicker.tsx — add preview thumbnails

interface BandPickerProps {
  value: string;
  onChange: (band: string) => void;
  disabled?: boolean;
  satellite?: string;  // NEW
  sector?: string;     // NEW
}

export default function BandPicker({ value, onChange, disabled, satellite, sector }: BandPickerProps) {
  const { data: previews } = useQuery({
    queryKey: ['band-previews', satellite, sector],
    queryFn: () => api.get('/goes/preview/band-samples', {
      params: { satellite, sector }
    }).then(r => r.data),
    enabled: !!satellite && !!sector,
    staleTime: 300000, // 5 min cache
  });

  // In each band card, add:
  // {previews?.thumbnails?.[bandId] && (
  //   <img
  //     src={previews.thumbnails[bandId]}
  //     alt={`${bandId} preview`}
  //     className="w-full h-16 object-cover rounded mt-2 opacity-80"
  //     loading="lazy"
  //   />
  // )}
}
```

#### SectorPicker with Previews

Similar approach — show a small thumbnail for each sector using the latest C02 frame:

```typescript
// SectorPicker.tsx — add sector preview thumbnails
// Each sector card gets a small background image showing the latest capture
```

#### Caching Strategy
- Backend: Use existing Redis cache with 5-min TTL for thumbnail lookups
- Frontend: React Query `staleTime: 300000` (5 min)
- Images: Browser cache via `Cache-Control: public, max-age=86400` (already set on thumbnail endpoint)
- Loading state: Show a subtle shimmer placeholder in the band card where the thumbnail would go

#### UX Flow
1. User navigates to Fetch tab → Step 2 (What to Fetch)
2. BandPicker loads → fires `GET /preview/band-samples?satellite=GOES-19&sector=CONUS`
3. While loading: band cards show without thumbnails (current behavior)
4. Once loaded: thumbnail images fade in at bottom of each band card
5. User can see at a glance what each band captures (clouds, vegetation, IR heat, etc.)

---

## 4. General Polish Inventory

### Styling & Spacing

| Issue | File | Severity |
|-------|------|----------|
| Dark mode hover states inconsistent: `dark:hover:bg-gray-100` in LiveTab refresh button (should be `dark:hover:bg-slate-700`) | `LiveTab.tsx` line ~183 | Medium |
| `text-shadow-overlay` class used but not defined in any CSS I can see | `LiveTab.tsx` line ~204 | Low |
| `glass-card` class used in OverviewTab/StatsTab — assumes custom CSS exists | Multiple | Low |
| `btn-primary-mix` custom class used in FetchTab, CompositesTab — verify it exists | Multiple | Low |
| `glow-primary` class on active tab — verify it exists | `GoesData.tsx` line ~96 | Low |
| `content-fade-in` and `animate-fade-in` used — verify keyframes exist | `GoesData.tsx` | Low |
| `focus-ring` custom class used throughout Layout — verify definition | `Layout.tsx` | Low |

### Missing Hover/Active/Focus States

| Issue | File | Severity |
|-------|------|----------|
| Dropdown `<select>` elements lack consistent focus ring styling — some have `focus:ring-2 focus:ring-primary/50`, some don't | Multiple | Medium |
| BandPicker filter buttons lack `focus:ring` | `BandPicker.tsx` | Medium |
| FrameCard click area lacks visible focus indicator for keyboard users | `FrameCard.tsx` | Medium |

### Accessibility

| Issue | File | Severity |
|-------|------|----------|
| CleanupTab: `<select aria-label="Form">` — vague label | `CleanupTab.tsx` line ~97 | Medium |
| Tab panel content has no `role="tabpanel"` or `aria-labelledby` | `GoesData.tsx` | Medium |
| Live tab image has generic alt text (`${satellite} ${band} ${sector}`) — better than nothing but could include timestamp | `LiveTab.tsx` | Low |
| Step indicators in FetchTab: step numbers rendered as text inside tiny circles — may be hard to read at small sizes | `FetchTab.tsx` | Low |
| Fullscreen button lacks keyboard shortcut (F11 is browser's, needs custom 'f' key) | `LiveTab.tsx` | Low |
| `<dialog open>` usage in FetchTab confirm modal doesn't trap focus or handle Escape natively | `FetchTab.tsx` | Medium |

### Loading/Empty/Error States

| Issue | File | Severity |
|-------|------|----------|
| MapTab: No loading state while frame loads — map shows without overlay, no indicator | `MapTab.tsx` | Medium |
| MapTab: No error state if `/goes/latest` fails (just shows blank map) | `MapTab.tsx` | Medium |
| CompositesTab: No loading skeleton while recipes/composites load | `CompositesTab.tsx` | Low |
| OverviewTab: Partial loading — shows "Loading overview data..." for all three queries simultaneously | `OverviewTab.tsx` | Low |
| CleanupTab: Preview query `enabled: false` then manual refetch — no visual affordance that preview is stale | `CleanupTab.tsx` | Low |

### Mobile Responsiveness

| Issue | File | Severity |
|-------|------|----------|
| BrowseTab filter sidebar: 264px fixed width doesn't collapse well on tablets | `BrowseTab.tsx` | Medium |
| Live tab two-panel layout: `lg:grid-cols-2` means on medium screens both panels stack, which is fine, but the panels are quite tall stacked | `LiveTab.tsx` | Low |
| FetchTab step indicators: horizontal scroll on very small screens? Appears wrapped in flex without overflow handling | `FetchTab.tsx` | Low |
| CollectionsTab action buttons (Edit/Animate/Export/Delete) wrap awkwardly on narrow cards | `CollectionsTab.tsx` | Low |

### Transitions & Animations

| Issue | File | Severity |
|-------|------|----------|
| Tab switching uses `animate-fade-in` but no exit animation — content just disappears and new content fades in | `GoesData.tsx` | Low |
| Live tab image swap has no crossfade — image just pops in when new data loads | `LiveTab.tsx` | Medium |
| Fullscreen toggle is instant — should have a brief scale transition | `LiveTab.tsx` | Low |

### Copy/Labels

| Issue | File | Severity |
|-------|------|----------|
| "Your Latest" panel in Live tab — "Your" is confusing for a server-side app (it's the server's latest, not the user's device) | `LiveTab.tsx` | Low |
| "Available Now" — could be "Latest on AWS" for clarity | `LiveTab.tsx` | Low |
| FetchTab step labels: "Source / What / When" — "Source" could be "Satellite" for clarity | `FetchTab.tsx` | Low |
| Quick actions: "Pre-fill fetch wizard" — the word "wizard" isn't used elsewhere, call it "Fetch form" | `OverviewTab.tsx` | Low |

### Dark Mode Specific

| Issue | File | Severity |
|-------|------|----------|
| `hover:bg-gray-200` used alongside `dark:hover:bg-slate-600` in several places — the light mode hover is too aggressive | BrowseTab toolbar buttons | Low |
| Freshness comparison bar uses `text-amber-300` which is great in dark mode, terrible in light mode | `LiveTab.tsx` | High (see bug 1.4) |
| `dark:hover:bg-gray-100` in LiveTab refresh/fullscreen buttons — `gray-100` in dark mode would be bright white | `LiveTab.tsx` line ~183 | Medium |

---

## 5. Backend Connection Map

| Frontend Feature | API Endpoint | Method | Notes |
|---|---|---|---|
| Products dropdown | `/api/goes/products` | GET | Static data, cached 300s |
| Latest local frame | `/api/goes/latest` | GET | Per satellite/sector/band |
| Latest on AWS | `/api/goes/catalog/latest` | GET | ⚠️ No band param |
| Catalog listing | `/api/goes/catalog` | GET | Per date |
| Fetch data | `/api/goes/fetch` | POST | Creates job |
| Fetch composite | `/api/goes/fetch-composite` | POST | Creates composite job |
| Frame listing | `/api/goes/frames` | GET | Paginated, filtered |
| Frame stats | `/api/goes/frames/stats` | GET | Aggregate stats |
| Frame export | `/api/goes/frames/export` | GET | ⚠️ Missing collection_id filter |
| Frame delete | `/api/goes/frames` | DELETE | Bulk delete |
| Frame tagging | `/api/goes/frames/tag` | POST | Bulk tag |
| Frame processing | `/api/goes/frames/process` | POST | Creates processing job |
| Frame image | `/api/goes/frames/{id}/image` | GET | Full resolution |
| Frame thumbnail | `/api/goes/frames/{id}/thumbnail` | GET | Thumbnail or full fallback |
| Frame share | `/api/goes/frames/{id}/share` | POST | Creates share token |
| Shared frame | `/api/shared/{token}` | GET | Public |
| Collections CRUD | `/api/goes/collections` | ALL | Full CRUD |
| Collection frames | `/api/goes/collections/{id}/frames` | GET/POST/DELETE | |
| Collection export | `/api/goes/collections/{id}/export` | GET | CSV/JSON |
| Tags CRUD | `/api/goes/tags` | ALL | Full CRUD |
| Composite recipes | `/api/goes/composite-recipes` | GET | Static |
| Composites CRUD | `/api/goes/composites` | GET/POST | |
| Cleanup rules | `/api/goes/cleanup-rules` | ALL | Full CRUD |
| Cleanup preview | `/api/goes/cleanup/preview` | GET | |
| Cleanup run | `/api/goes/cleanup/run` | POST | |
| Crop presets | `/api/goes/crop-presets` | ALL | Full CRUD |
| Gap detection | `/api/goes/gaps` | GET | |
| Backfill | `/api/goes/backfill` | POST | |
| Frame count estimate | `/api/goes/frame-count` | GET | |
| Preview frame | `/api/goes/preview` | GET | Returns PNG bytes |
| Dashboard stats | `/api/goes/dashboard-stats` | GET | Cached 30s |
| Quick fetch options | `/api/goes/quick-fetch-options` | GET | Static |
| Health/version | `/api/health/version` | GET | |
| File download | `/api/download` | GET | General file serving |
| Jobs | `/api/jobs` | GET | Paginated |
| WebSocket | `/ws/jobs/{id}` | WS | Job progress |
| Settings | `/api/settings` | GET/PUT | |
| System | `/api/system/info` | GET | |
| Notifications | `/api/notifications` | GET | |

### Endpoints unused by frontend (potentially):
- `/api/goes/quick-fetch-options` — OverviewTab has its own hardcoded quick actions
- `/api/goes/dashboard-stats` — Not used; OverviewTab uses `/goes/frames/stats` and `/jobs` instead

### Frontend assumptions that could break:
1. **`extractArray(r.data)`** used in several places to handle both `{items: [...]}` and `[...]` responses — if backend pagination envelope changes, this could silently return empty arrays
2. **`/api/download?path=...`** used for all image display — if path contains special characters or the backend path validation rejects them, images silently fail to load
3. **Collections query** returns paginated `{items, total, page, limit}` but `extractArray` extracts `.items` — if total > 50, only first page is shown with no pagination UI in CollectionsTab
4. **Tags query** same issue — only first page returned, no pagination

---

## Priority Summary

### Must Fix (Critical/High)
1. **`catalog/latest` ignores band parameter** — incorrect data shown and auto-fetched
2. **MapTab and CompositesTab default to GOES-16** instead of GOES-19
3. **Live tab freshness text invisible in light mode** — `text-amber-300`
4. **Live tab image overlay positioned incorrectly** — missing `relative` on parent
5. **Live tab "Download Latest" doesn't pass context** to Fetch tab
6. **Dark mode hover bug** — `dark:hover:bg-gray-100` on LiveTab buttons

### Should Fix (Medium)
7. Dropdowns show all options including unavailable ones (needs new availability endpoint)
8. Frame export missing collection_id filter
9. Collections/Tags only show first page
10. FetchTab confirmation dialog doesn't trap focus
11. MapTab missing loading/error states
12. BrowseTab mobile filter positioning
13. CleanupTab uses browser `confirm()` instead of custom modal

### Nice to Have (Low)
14. Band/Sector preview thumbnails
15. Tab transition animations
16. Image crossfade on live view update
17. Better copy/labels
18. Various minor accessibility improvements
