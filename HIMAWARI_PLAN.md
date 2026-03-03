# Himawari-9 Support — Implementation Plan

**Decisions (confirmed by Justin):**
- All 16 bands + TrueColor composite
- All sectors (FLDK, Japan, Target) — same coverage as GOES does for its regions
- Same storage budget/retention as GOES
- Rename API from `/api/goes/` → `/api/satellite/` (keep `/api/goes/` as backward-compat alias)

---

## Overview

Add **Himawari-9** (JMA's geostationary satellite at 140.7°E) alongside existing GOES support. Covers East Asia, Australia, and Western/Central Pacific.

**Data source:** AWS S3 `noaa-himawari9` (free, no auth, same as GOES buckets)

---

## GOES vs Himawari Quick Reference

| | GOES (ABI) | Himawari (AHI) |
|---|---|---|
| **Satellites** | GOES-16, 18, 19 | Himawari-9 (H-8 backup) |
| **Bands** | 16 (C01–C16) + GEOCOLOR | 16 (B01–B16) + TrueColor (composite) |
| **Data format** | NetCDF4 (.nc) | HSD binary (.DAT.bz2) |
| **S3 bucket** | `noaa-goes16/18/19` | `noaa-himawari9` |
| **S3 path** | `ABI-L2-CMIPF/YYYY/DDD/HH/` | `AHI-L1b-FLDK/YYYY/MM/DD/HHMM/` |
| **Path dates** | Day-of-year (DDD) | Calendar (MM/DD) |
| **Sectors** | FullDisk, CONUS, Meso1, Meso2 | FLDK, Japan, Target |
| **Full disk cadence** | 10 min | 10 min |
| **Regional cadence** | CONUS 5min, Meso 1min | Japan 2.5min, Target 0.5min |
| **Files per band/timestamp** | 1 file | 10 segments (must stitch) |
| **True color** | Pre-made GEOCOLOR (CDN) | Must composite B03+B02+B01 |
| **CDN images** | Yes (cdn.star.nesdis.noaa.gov) | **No CDN** — must process from raw |
| **Band 4 difference** | C04 = 1.38µm (Cirrus) | B02 = 0.51µm (**Green** for true color) |

---

## Complete Inventory of GOES-Coupled Code

### Backend — Files That Must Change

| File | Lines | GOES Coupling | Required Change |
|------|-------|---------------|-----------------|
| `services/goes_fetcher.py` | 635 | `SATELLITE_BUCKETS`, `SATELLITE_AVAILABILITY`, `SECTOR_PRODUCTS`, `VALID_BANDS`, S3 prefix builder (day-of-year), NetCDF parser, band/sector matchers | Extract to satellite registry; add Himawari equivalents |
| `services/catalog.py` | 232 | Imports all from `goes_fetcher`, GOES filename regex, CDN URL builder, GOES-only S3 prefix | Dispatch by satellite type; add Himawari catalog functions |
| `routers/goes_catalog.py` | ~250 | Prefix `/api/goes`, hardcoded GOES satellite list, CDN sector map, GOES band descriptions | Rename prefix, use registry for products |
| `routers/goes_fetch.py` | ~230 | Prefix `/api/goes`, validates only GOES satellites, GOES-only composite recipes | Rename prefix, dispatch fetcher by satellite |
| `routers/goes_browse.py` | ~80 | Prefix `/api/goes` | Rename prefix |
| `routers/goes_frames.py` | ~200 | Prefix `/api/goes` | Rename prefix |
| `routers/goes_collections.py` | ~150 | Prefix `/api/goes` | Rename prefix |
| `routers/goes_tags.py` | ~80 | Prefix `/api/goes` | Rename prefix |
| `routers/_goes_shared.py` | ~140 | `BAND_DESCRIPTIONS` (C01-C16 only), `BAND_METADATA`, `COMPOSITE_RECIPES`, `SECTOR_DISPLAY_NAMES` | Add Himawari bands/sectors/composites |
| `routers/goes.py` | ~30 | Re-export module | Update imports |
| `models/goes.py` | ~130 | `GoesFetchRequest` validates satellite ∈ {GOES-16/18/19}, sector ∈ {FullDisk/CONUS/Meso}, band ∈ {C01-C16}; `FetchCompositeRequest` same | Use registry for validation |
| `tasks/fetch_task.py` | ~200 | Calls `goes_fetcher` functions, creates "GOES Fetch" collection names | Dispatch by satellite type |
| `tasks/composite_task.py` | ~120 | Loads from `GoesFrame`, hardcoded GOES band names (C01/C02/C03) | Add Himawari band mapping for composites |
| `tasks/goes_tasks.py` | ? | GOES-specific task logic | Review and extend |
| `tasks/scheduling_tasks.py` | ~80 | Creates `goes_fetch` job type, uses preset satellite/sector/band | Works if registry validates |
| `db/models.py` | GoesFrame | Table name `goes_frames` — columns are generic (satellite/sector/band strings) | **No schema change needed** — just new values |

### Backend — Files That Are Already Satellite-Agnostic ✅

| File | Why It's Fine |
|------|--------------|
| `db/models.py` (GoesFrame) | Columns are generic strings — accepts any satellite/sector/band |
| `services/storage.py` | File storage — satellite-agnostic |
| `services/thumbnail.py` | Image processing — satellite-agnostic |
| `services/cache.py` | Redis cache — satellite-agnostic |
| `routers/animations.py` | Works with any GoesFrame records |
| `routers/jobs.py` | Job management — satellite-agnostic |
| `routers/health.py` | Health checks |
| `routers/stats.py` | Queries GoesFrame table generically |

### Frontend — Files That Must Change

| File | GOES Coupling | Required Change |
|------|---------------|-----------------|
| `LiveTab/LiveTab.tsx` | Queries `/goes/products`, `/goes/latest`, `/goes/catalog/latest`; defaults `sector='CONUS'`, `band='GEOCOLOR'` | Update API paths; dynamic defaults per satellite |
| `LiveTab/liveHelpers.ts` | `FRIENDLY_BAND_NAMES` only has C01-C16; `buildCdnUrl` via `resolveImageUrls` | Add B01-B16 names; handle no-CDN for Himawari |
| `liveTabUtils.ts` | `FRIENDLY_BAND_NAMES` (C01-C16 + GEOCOLOR only) | Add Himawari band names |
| `utils/sectorHelpers.ts` | `buildCdnUrl()` hardcodes NOAA CDN path, GOES sector mapping, `C` band prefix | Return null for Himawari (no CDN); `isGeocolorAvailable` → satellite-aware |
| `FetchTab/FetchTab.tsx` | Queries `/goes/products`, posts to `/goes/fetch`; defaults `sector='FullDisk'` | Update API paths; dynamic defaults |
| `FetchTab/QuickFetchSection.tsx` | Hardcoded GOES quick fetch presets (CONUS, C02, etc.) | Add Himawari presets or make dynamic |
| `AnimateTab/AnimateTab.tsx` | 7 refs to `/goes/` endpoints; defaults `sector='CONUS'` | Update API paths; dynamic defaults |
| `AnimateTab/QuickStartChips.tsx` | Hardcoded GOES presets (Hurricane Watch CONUS C13, etc.) | Add Himawari presets |
| `Animation/types.ts` | `SECTORS = ['FullDisk', 'CONUS', 'Meso1', 'Meso2']` hardcoded | Make dynamic from products API |
| `monitorPresets.ts` | Only GOES presets (CONUS, Full Disk, Mesoscale) | Add Himawari presets |
| `hooks/useLiveFetchJob.ts` | Posts to `/goes/fetch`; blocks GEOCOLOR; hardcoded `C01-C16` message | Update API path; handle TrueColor for Himawari |
| `BandPicker.tsx` | Queries `/goes/band-availability`, posts to `/goes/fetch` | Update API paths |
| `FrameGallery.tsx` | Queries `/goes/frames/stats` | Update API path |
| `CompareView.tsx` | 4 refs to `/goes/` endpoints | Update API paths |
| `CollectionsTab.tsx` | 6 refs to `/goes/` endpoints | Update API paths |
| `CompositesTab.tsx` | 4 refs to `/goes/` endpoints; GOES composite recipes | Update paths; add Himawari recipes |
| `CleanupTab.tsx` | 7 refs to `/goes/` endpoints | Update API paths |
| `GapsTab.tsx` | 3 refs to `/goes/` endpoints | Update API paths |
| `OverviewTab.tsx` | 3 refs to `/goes/` endpoints | Update API paths |
| `StatsTab.tsx` | 1 ref to `/goes/` endpoint | Update API path |
| `pages/Settings.tsx` | 1 ref to `/goes/` endpoint | Update API path |
| `pages/Dashboard.tsx` | Hardcoded `sector: 'CONUS'` | Dynamic default |
| `api/client.ts` | 404 suppression for `/goes/` paths | Update path check |
| `App.tsx` | Route naming references GOES | Update if needed |
| `Layout.tsx` | Navigation labels | May need "Satellite Data" vs "GOES Data" |

### Frontend — Files That Are Already Generic ✅

| File | Why It's Fine |
|------|--------------|
| `BandPillStrip.tsx` | Takes satellite/sectors/bands as props — fully generic |
| `ImageViewer.tsx` | Pure image viewer — satellite-agnostic |
| `BrowseTab.tsx` | Only 1 ref to `/goes/` — mostly queries frames generically |
| `AddToCollectionModal.tsx` | Generic |
| `AnimationPlayer.tsx` | Generic |
| `FramePreviewModal.tsx` | Generic |
| `TagModal.tsx` | Generic |

---

## Technical Decisions

### 1. HSD Format Parsing → Lightweight Custom Parser
- HSD = binary header (fixed structure) + uint16 data block + bz2 compression
- Parse header for dimensions, calibration tables, observation metadata
- Read data block as numpy uint16 array → apply calibration → float32
- Segment assembly: 10 latitude strips → `np.vstack()` → full disk
- **No satpy dependency** — keep it lightweight, ~200 lines of code
- Upgrade to satpy later only if we need advanced composites/resampling

### 2. True Color Composite → B03 (R) + B02 (G) + B01 (B)
- Himawari has a real green band (B02 at 0.51µm) — GOES doesn't!
- True color is straightforward RGB composite, no synthetic green needed
- Store as virtual band "TrueColor" in GoesFrame table
- Fetch all 3 bands (30 segments), composite in Celery task
- Same pattern as GOES `fetch_composite_data` task

### 3. No CDN → Pre-fetch on Schedule + DB-Only Serving
- GOES Live Tab falls back to NOAA CDN for instant images
- Himawari has **no CDN** — all images must come from our pipeline
- Solution: scheduled Celery beat task every 10 min fetches latest FLDK
- Live Tab serves from local DB (GoesFrame records)
- First-time load: up to 10 min delay until first fetch completes
- `resolveImageUrls()` in `liveHelpers.ts`: CDN fallback returns null for Himawari → always uses local

### 4. API Rename → `/api/satellite/` with `/api/goes/` Alias
- 8 router files with `prefix="/api/goes"` → change to `/api/satellite`
- Add backward-compat redirect middleware: `/api/goes/*` → `/api/satellite/*`
- Frontend: update ~60 API path references across 20 files
- This is a large but mechanical change — good candidate for a single dedicated PR

### 5. Database → Reuse `goes_frames` Table As-Is
- No schema migration needed
- `satellite="Himawari-9"`, `sector="FLDK"`, `band="B01"` — just new string values
- Table name `goes_frames` is misleading but harmless
- All existing browse/compare/animate queries work automatically
- Optional: rename table in a future major version

---

## Implementation Phases

**Ordering rationale:** API rename is deferred to PR 9 — it's a large mechanical refactor that would cause merge conflicts if done first. Instead, we build Himawari support on the existing `/api/goes/` paths, then rename everything cleanly at the end. PRs 2 and 3 are independent and can run in parallel.

### Testing Strategy

**Every PR ships with its own tests.** No "tests at the end" dumping ground.

Current test surface with GOES-specific values:
- **Backend:** 45 of 91 test files reference GOES satellites/bands/sectors
- **Frontend:** 102 of 200 test files reference GOES values
- **E2E:** 29 spec files + `mock-api.ts` with hardcoded GOES responses

PR 11 is E2E integration tests + docs only — not a catch-all.

### Phase 1: Backend Foundation (3 PRs)

**PR 1: Satellite registry + dynamic products**
- Create `services/satellite_registry.py`:
  ```python
  @dataclass
  class SatelliteConfig:
      bucket: str
      format: str  # "netcdf" | "hsd"
      bands: list[str]
      sectors: dict[str, SectorConfig]
      availability: AvailabilityInfo
      band_descriptions: dict[str, str]
      band_metadata: dict[str, dict]
      cadence_minutes: dict[str, float]  # per sector
  ```
- Register GOES-16/18/19 and Himawari-9 configs
- Move constants from `goes_fetcher.py` and `_goes_shared.py` → registry
- Update `validate_params()` to use registry
- Update `/api/goes/products` to return all satellites dynamically
- Update `models/goes.py` validators to use registry
- **Himawari appears in satellite dropdown but can't fetch yet**
- **Tests:**
  - Update `test_goes_config_matrix.py` — extend matrix to Himawari-9/FLDK/Japan/Target/B01-B16
  - Update `test_goes_fetcher.py` — `validate_params()` accepts Himawari values
  - Update `test_api_contracts.py` — `/api/goes/products` returns Himawari-9
  - Update `test_config.py` — satellite validation accepts Himawari
  - Update `models/goes.py` validator tests — accept Himawari satellite/sector/band
  - New: `test_satellite_registry.py` — registry lookup, config validation, all satellites registered

**PR 2: HSD parser + image conversion** _(can run in parallel with PR 3)_
- `services/himawari_reader.py`:
  - `parse_hsd_header(data: bytes) → HSDHeader` (band, time, dimensions, calibration)
  - `parse_hsd_data(data: bytes, header: HSDHeader) → np.ndarray` (calibrated float32)
  - `assemble_segments(segments: list[np.ndarray]) → np.ndarray` (vstack 10 strips)
  - `hsd_to_png(segments: list[bytes], output: Path) → Path`
- bz2 decompression wrapper
- Unit tests with real sample HSD data (download one segment for test fixtures)
- **Independent of other PRs — can develop and test in isolation**
- **Tests (all new):**
  - `test_himawari_reader.py` (~20-30 tests):
    - Header parsing: correct band, time, dimensions, calibration extraction
    - Data block: uint16 → calibrated float32 conversion
    - Segment assembly: 10 segments → correct vstack, dimension validation
    - Full pipeline: bz2 → decompress → parse → assemble → PNG
    - Edge cases: corrupt header, truncated data, wrong segment count, missing segments
    - VIS vs IR resolution handling (R10=1km vs R20=2km)
  - Test fixture: download 1 real HSD segment from S3 (~5MB compressed)
  - Validation: compare output against JMA reference image

**PR 3: Himawari S3 catalog** _(can run in parallel with PR 2)_
- `services/himawari_catalog.py`:
  - `_build_himawari_prefix(sector, dt)` → `AHI-L1b-FLDK/YYYY/MM/DD/HHMM/`
  - `_parse_himawari_filename(key)` → extract band, sector, segment, time
  - `_list_himawari_timestamps(bucket, sector, band, date)` → available scans
- Extend `catalog.py` to dispatch GOES vs Himawari based on satellite name
- `catalog_latest()` works for Himawari (finds most recent FLDK timestamp)
- Depends on PR 1 (registry for satellite dispatch)
- **Live Tab can now show "latest available" timestamp for Himawari (no image yet)**
- **Tests:**
  - Update `test_catalog.py` (20 GOES refs) — add Himawari catalog dispatch tests
  - Update `test_goes_catalog.py` (19 GOES refs) — extend with Himawari satellite dispatch
  - New: `test_himawari_catalog.py`:
    - Prefix building: `AHI-L1b-FLDK/YYYY/MM/DD/HHMM/` format
    - Filename parsing: extract band, sector, segment, time from `HS_H09_...` keys
    - Timestamp extraction from S3 listing
    - Sector dispatch: FLDK vs Japan vs Target paths
    - `catalog_latest()` for Himawari — finds most recent timestamp

### Phase 2: Fetch Pipeline (2 PRs)

**PR 4: Himawari fetch task**
- `tasks/himawari_fetch_task.py`:
  - Download 10 segments for a single band from S3
  - Decompress bz2 → parse HSD → assemble → convert to PNG
  - Create GoesFrame record (satellite="Himawari-9")
  - Create Collection record
- Wire into `/api/goes/fetch` endpoint — same POST body, dispatch by satellite
- Parallel segment download (ThreadPoolExecutor, 4 workers)
- Depends on PR 2 (parser) + PR 3 (catalog)
- **First time we can actually fetch Himawari images**
- **Tests:**
  - Update `test_goes_tasks.py` — extend with Himawari fetch dispatch
  - Update `test_goes_fetcher.py` / `test_goes_fetcher_errors.py` — S3 retry logic for Himawari bucket
  - New: `test_himawari_fetch.py`:
    - Segment download: mock S3 returns 10 segments, verify all downloaded
    - Assembly pipeline: segments → decompress → parse → assemble → PNG
    - GoesFrame record creation with satellite="Himawari-9"
    - Collection creation
    - Error handling: partial segment failure, S3 timeout, corrupt segment
    - Parallel download: verify ThreadPoolExecutor usage

**PR 5: True Color composite + scheduled fetch**
- Himawari TrueColor composite task:
  - Fetch B01 + B02 + B03 simultaneously (30 segments total)
  - Assemble each band → composite RGB → save as PNG
  - Store as band="TrueColor" in GoesFrame
- Composite recipe in `_goes_shared.py`: `"himawari_true_color": ["B03", "B02", "B01"]`
- Celery beat schedule: fetch latest FLDK TrueColor every 10 min
- Configurable via Settings page (same as GOES scheduled fetches)
- Depends on PR 4 (fetch task)
- **Live Tab has fresh Himawari images automatically**
- **Tests:**
  - Update `test_composites.py` — add Himawari true color recipe (B03+B02+B01)
  - Update `test_scheduling.py` + `test_scheduling_extended.py` + `test_scheduling_more.py` — scheduled Himawari fetch
  - New: Himawari composite integration test (3 bands → RGB → correct output)
  - New: scheduled fetch creates correct GoesFrame records on beat

### Phase 3: Frontend Integration (3 PRs)

**PR 6: Dynamic band names + sector helpers**
- `liveTabUtils.ts`: Make `FRIENDLY_BAND_NAMES` satellite-aware:
  ```typescript
  const HIMAWARI_BAND_NAMES: Record<string, string> = {
    B01: 'Visible Blue', B02: 'Visible Green', B03: 'Visible Red',
    B04: 'Near-IR Veggie', B05: 'Snow/Ice', B06: 'Cloud Particle',
    B07: 'Shortwave IR', B08: 'Upper Water Vapor', B09: 'Mid Water Vapor',
    B10: 'Lower Water Vapor', B11: 'Cloud-Top Phase', B12: 'Ozone',
    B13: 'Clean IR Longwave', B14: 'IR Longwave', B15: 'Dirty Longwave',
    B16: 'CO₂ Longwave', TrueColor: 'True Color (RGB)',
  };
  export function getFriendlyBandLabel(bandId, description?, format?, satellite?): string
  ```
- `sectorHelpers.ts`:
  - `buildCdnUrl()` returns null for Himawari (no CDN)
  - `isGeocolorAvailable()` → `isTrueColorBand(satellite, band)`
  - `isMesoSector()` → `isRegionalSector(satellite, sector)` (Meso for GOES, Japan/Target for Himawari)
- `Animation/types.ts`: Remove hardcoded `SECTORS` — fetch from products API
- Can start after PR 1 merges (products API returns Himawari data)
- **All band labels and sector helpers work for both satellites**
- **Tests:**
  - Update `bands.test.ts` — Himawari band labels (B01-B16 + TrueColor)
  - Update `BandPillStrip.test.tsx` (18 refs) — satellite-aware rendering, Himawari bands
  - Update `BandPicker.test.tsx` + `BandPickerExtended.test.tsx` (27 refs) — Himawari band selection
  - New: `sectorHelpers.test.ts` — `buildCdnUrl()` returns null for Himawari, `isRegionalSector()` logic
  - Update `Animation/types` tests — dynamic sectors from API instead of hardcoded

**PR 7: Live Tab satellite switching**
- LiveTab defaults: when satellite changes →
  - GOES: sector='CONUS', band='GEOCOLOR'
  - Himawari: sector='FLDK', band='TrueColor'
- `resolveImageUrls()`: skip CDN path for Himawari, always use local DB
- `useLiveFetchJob.ts`: handle TrueColor blocking (like GEOCOLOR — composite only)
- Compare mode works (just needs 2 local frames)
- Band swipe works with B01-B16
- Satellite selection persisted in localStorage
- `computeFreshness()`: works as-is (compares catalog vs local timestamps)
- Depends on PR 4-5 (fetch pipeline) so there's data to display
- **Tests (update 11 LiveTab test files):**
  - `LiveTabCombinations.test.tsx` (62 refs!) — add Himawari satellite/sector/band combos
  - `LiveTabFetch.test.tsx` (20 refs) — TrueColor blocking (like GEOCOLOR)
  - `LiveTabMeso.test.tsx` (10 refs) — Japan/Target sector equivalents
  - `LiveTabPolish.test.tsx` (19 refs) — satellite switching, defaults
  - `LiveTabUxRound3.test.tsx` (40 refs) — Himawari UX paths
  - All other LiveTab tests — verify no CDN fallback for Himawari
  - New: Himawari-specific Live Tab tests:
    - Default sector=FLDK, band=TrueColor when Himawari selected
    - CDN path returns null → uses local DB only
    - Satellite toggle persists in localStorage
    - Band swipe with B01-B16

**PR 8: Fetch, Animate, Browse, Presets**
- FetchTab: dynamic defaults per satellite, Himawari quick fetch presets
- QuickFetchSection: add Himawari presets ("FLDK B13 Last Hour", "Japan TrueColor")
- AnimateTab: Himawari animation support (works if frames exist in DB)
- QuickStartChips: add Himawari chips ("🌊 Pacific Watch", "🗾 Japan TrueColor")
- Monitor presets: add Himawari entries
  ```typescript
  { label: 'Japan True Color 2.5min', satellite: 'Himawari-9', sector: 'Japan', band: 'TrueColor', interval: 150000 },
  { label: 'FLDK IR every 10min', satellite: 'Himawari-9', sector: 'FLDK', band: 'B13', interval: 600000 },
  ```
- CompositesTab: add Himawari true_color recipe
- GapsTab, CleanupTab, StatsTab: work generically (no changes needed)
- **Tests:**
  - Update `FetchTab.test.tsx`, `FetchTabErrors.test.tsx` — Himawari fetch flow
  - Update `AnimateTab.test.tsx` — Himawari animation
  - Update `CompareView.test.tsx` — Himawari frame comparison
  - Update `CompositesTab.test.tsx` — Himawari true color recipe
  - Update `QuickStartChips` tests — Himawari presets render
  - Update `monitorPresets` tests — Himawari presets included

### Phase 4: Polish + Production (3 PRs)

**PR 9: API rename `/api/goes/` → `/api/satellite/`**
- Rename all 6 router prefixes
- Add backward-compat middleware for `/api/goes/*` → `/api/satellite/*`
- Update all frontend API paths (~60 references across 20 files)
- Update `api/client.ts` 404 suppression path
- Update test assertions
- **Done last to avoid merge conflict chaos — clean refactor after everything works**
- **Tests (largest test update — mechanical path changes):**
  - Backend: update ~45 test files with `/api/goes/` → `/api/satellite/` paths
  - Frontend: update ~102 test files with API path references
  - E2E: update `mock-api.ts` route patterns + 29 spec files
  - Verify backward-compat middleware: `/api/goes/*` still returns 200

**PR 10: Auto-prune + disk management**
- Same retention policy as GOES (configurable max age, max disk usage)
- Auto-prune old Himawari frames on schedule
- Health check: verify Himawari S3 bucket accessibility
- Monitoring: disk usage alerts if Himawari data grows faster than expected
- Japan sector at 2.5-min cadence could generate significant data — may need per-sector retention

**PR 11: E2E integration tests + docs**
- **NOT a catch-all** — unit/component tests ship with their respective PRs
- **E2E tests (new):**
  - Satellite switching flow: GOES → Himawari → verify UI updates (sector, bands, defaults)
  - Himawari fetch flow: select Himawari → pick band → fetch → verify frame appears
  - Himawari Live Tab: verify image loads from DB (no CDN), freshness indicator works
  - Himawari animation: create animation from Himawari frames
  - Update `mock-api.ts`: add Himawari mock responses for all endpoints
- **Docs:**
  - README: add Himawari to feature list, satellite comparison table
  - API docs: updated satellite/sector/band options, Himawari-specific notes
  - CONTRIBUTING.md: note about multi-satellite testing requirements

---

## Test Impact Summary

| PR | Backend Tests | Frontend Tests | New Test Files |
|----|--------------|----------------|----------------|
| PR 1 (Registry) | Update 6 files (config matrix, fetcher, contracts, config, validators) | — | `test_satellite_registry.py` |
| PR 2 (HSD Parser) | — | — | `test_himawari_reader.py` (~25 tests) |
| PR 3 (Catalog) | Update 2 files (catalog, goes_catalog) | — | `test_himawari_catalog.py` |
| PR 4 (Fetch) | Update 3 files (tasks, fetcher, fetcher_errors) | — | `test_himawari_fetch.py` |
| PR 5 (Composite) | Update 4 files (composites, scheduling ×3) | — | Composite integration test |
| PR 6 (Band Names) | — | Update 4 files (bands, BandPillStrip, BandPicker ×2) | `sectorHelpers.test.ts` |
| PR 7 (Live Tab) | — | Update 11 files (all LiveTab tests) | Himawari Live Tab tests |
| PR 8 (All UI) | — | Update ~8 files (Fetch, Animate, Compare, Composites, presets) | — |
| PR 9 (API Rename) | Update ~45 files (path changes) | Update ~102 files + 29 E2E specs | Backward-compat middleware test |
| PR 10 (Auto-prune) | — | — | `test_himawari_prune.py` |
| PR 11 (E2E + Docs) | — | — | 4-5 new E2E specs |
| **Total** | **~60 file updates** | **~125 file updates** | **~8 new test files** |

---

## Detailed Change Counts

### API Path Migration (PR 1)
**Backend:** 6 router files × prefix change = 6 edits + middleware
**Frontend:** ~60 API path references across 20 files:
- LiveTab: 4 paths
- FetchTab: 4 paths
- AnimateTab: 7 paths
- FrameGallery: 3 paths
- CompareView: 4 paths
- CollectionsTab: 6 paths
- CompositesTab: 4 paths
- CleanupTab: 7 paths
- GapsTab: 3 paths
- OverviewTab: 3 paths
- BandPicker: 2 paths
- StatsTab: 1 path
- Settings: 1 path
- useLiveFetchJob: 2 paths
- DashboardCharts: TBD
- AnimationPresets: 3 paths
- AnimationStudioTab: 7 paths
- client.ts: 1 path check

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| HSD parsing bugs | High — corrupted images | Test against JMA reference images; download real sample data for test fixtures |
| 160 files per timestamp | Medium — slow fetches | One band at a time (10 segments); parallel segment download |
| No CDN fallback | Medium — slower first Live Tab load | Pre-fetch on 10-min schedule; cache latest in DB |
| API rename breaks existing clients | Medium | Backward-compat middleware `/api/goes/*` → `/api/satellite/*` |
| Japan sector data volume | Medium — 2.5-min cadence = 576 images/day/band | Configurable per-sector retention; default to longer prune interval |
| Storage growth | Medium | Same auto-prune as GOES; monitor via health checks |
| Segment download failures | Low — partial S3 failures | Retry individual segments; fail gracefully if <10 segments available |
| Alembic migration | None — no schema change | Reusing existing table with new string values |

## Estimated Timeline

| Phase | PRs | Days | Dependency |
|-------|-----|------|-----------|
| Phase 1: Backend foundation | PRs 1-3 | 3-4 | None (PRs 2+3 parallel) |
| Phase 2: Fetch pipeline | PRs 4-5 | 2-3 | Phase 1 |
| Phase 3: Frontend | PRs 6-8 | 3-4 | PR 1 (band names), PRs 4-5 (Live Tab) |
| Phase 4: Polish + production | PRs 9-11 | 2-3 | Phase 3 |
| **Total** | **11** | **10-14 days** | |

### Dependency Graph
```
PR 1 (registry) ──┬──→ PR 3 (catalog) ──┐
                   │                      ├──→ PR 4 (fetch) ──→ PR 5 (composite) ──→ PR 7 (Live Tab)
PR 2 (HSD parser) ─────────────────────┘                                            │
                                                                                      ↓
PR 1 (registry) ──→ PR 6 (band names) ──────────────────────────────────→ PR 8 (all UI)
                                                                                      ↓
                                                                              PR 9 (API rename)
                                                                              PR 10 (auto-prune)
                                                                              PR 11 (tests+docs)
```

---

## HSD Binary Format Reference

```
HSD File Structure:
├── Block 1: Basic Info (282 bytes)
│   - Satellite name, observation time, band number
│   - Block number, total blocks, observation area
├── Block 2: Data Info (50 bytes)
│   - Number of columns, lines, bits per pixel
├── Block 3: Projection Info (127 bytes)
│   - Sub-satellite point, CFAC/LFAC/COFF/LOFF
├── Block 4: Navigation Info (139 bytes)
├── Block 5: Calibration Info (variable)
│   - Count-to-radiance conversion table
│   - Radiance-to-brightness-temp (IR) or reflectance (VIS)
├── Blocks 6-11: Inter-calibration, segment, etc.
└── Block 12: Data Block
    - uint16 raw counts, row-major order
    - Apply calibration from Block 5
```

Each segment file contains 1/10th of the full disk (latitude strip).
Segments S01 (north) through S10 (south), stacked vertically = full disk.

VIS bands (B01-B04): 11000 columns, 1100 lines per segment (R10 = 1km)
IR bands (B05-B16): 5500 columns, 550 lines per segment (R20 = 2km)
