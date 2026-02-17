# GOES Data Page UX Overhaul — Implementation Plan

## Priority Order (per Justin)
All items approved. Order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9+10

---

## PR #1: Catalog Browser — "What's Available"
**Goal:** Show available imagery on AWS before fetching. Clean, mobile-first, effortless.

### Backend
- New endpoint: `GET /api/goes/catalog` — queries NOAA S3 (`noaa-goes16/18/19`) for available files
  - Params: `satellite`, `sector`, `band`, `date` (optional, defaults today)
  - Returns: list of available capture times with file sizes
  - Cache aggressively (5 min TTL) — S3 listing is cheap but no need to repeat
  - Use `s3fs` or `boto3` with unsigned requests (public bucket, no credentials needed)
- New endpoint: `GET /api/goes/catalog/latest` — just the most recent available frame per satellite/sector
  - Lightweight: only checks last 2 hours of S3 listings

### Frontend (FetchTab overhaul)
- Replace current form-dump with a **3-step mobile wizard**:
  1. **Pick source**: Satellite cards (GOES-16/18/19) with status badge (active/historical)
  2. **Pick what**: Sector + Band/True Color toggle (see PR #3)
  3. **Pick when**: Calendar/timeline showing available times (green = available, gray = gap)
- Timeline scrubber component — horizontal scrollable, shows available frames as dots
- "Fetch Latest" one-tap button always visible at top
- Responsive: wizard steps stack vertically on mobile, side-by-side on desktop

### Tests
- Backend: catalog endpoint tests (mock S3 responses)
- Frontend: FetchTab wizard flow E2E test
- Update mock-api.ts with `/api/goes/catalog` mock

---

## PR #2: Mesoscale Support + Smart Sector Picker
**Goal:** Make Meso1/Meso2 discoverable with context. Resource-smart.

### Frontend
- Sector picker becomes visual cards instead of dropdown:
  - **Full Disk** — "Entire hemisphere, 10 min cadence, ~12MB/frame"
  - **CONUS** — "Continental US, 5 min cadence, ~4MB/frame"
  - **Mesoscale 1** — "Storm tracking, 1 min cadence, ~500KB/frame"
  - **Mesoscale 2** — "Secondary target, 1 min cadence, ~500KB/frame"
- Show estimated storage per hour for each sector+band combo
- Warning when selecting Meso with large time range ("1 hour = ~60 frames, ~30MB")

### Backend
- Add `cadence_minutes` and `typical_file_size_kb` to `/api/goes/products` sector response
- No new endpoints needed

### Resource-smart
- Default fetch limit capped at 100 frames for Meso (vs 200 for others)
- Show "this will fetch ~X frames (~Y MB)" estimate before confirming
- Auto-suggest shorter time ranges for high-cadence sectors

---

## PR #3: True Color One-Click
**Goal:** Fetch all bands + auto-composite without manual steps. Smart about resources.

### Frontend
- Add "Image Type" toggle at top of fetch flow: **Single Band** | **True Color** | **Natural Color**
- When True Color selected:
  - Band picker disappears (auto-selects C01+C02+C03)
  - Show info: "Fetches 3 bands and composites automatically"
  - Estimated size = 3x single band
- When Natural Color selected:
  - Auto-selects C02+C06+C07

### Backend
- New endpoint: `POST /api/goes/fetch-composite` — fetches required bands + queues composite
  - Takes: satellite, sector, recipe (true_color/natural_color), time range
  - Fetches bands sequentially (not parallel) to be resource-friendly
  - Auto-queues composite task when all bands complete
  - Returns job ID for tracking
- Resource guard: max 50 composite frames per request

### Tests
- Backend: fetch-composite endpoint + task chaining
- Frontend: toggle interaction tests

---

## PR #4: Smart Landing Dashboard
**Goal:** Replace empty Browse tab with useful "what's happening" view.

### Frontend
- New component: `GoesOverview` — shown when Browse tab is empty OR as new default tab
- Shows:
  - **Latest frame per satellite** (thumbnail + capture time + "X min ago")
  - **Local storage summary** (total frames, disk usage, by satellite pie chart)
  - **Quick actions**: "Fetch Last Hour CONUS", "Fetch Latest FullDisk", "True Color Now"
  - **Recent activity**: last 5 fetch jobs with status
- Replaces current WelcomeCard (which is only shown when 0 frames exist)

### Tests
- Overview component unit tests
- Update E2E dashboard/browse tests

---

## PR #5: Live Tab — Real Latest, Not Just Local
**Goal:** Show what's available NOW, not just what you've downloaded.

### Frontend
- Split Live tab into two sections:
  - **Available Now** — latest frame from AWS catalog API (with "Fetch" button)
  - **Your Latest** — latest frame you have locally
- Auto-refresh from catalog API (configurable interval, default 5 min)
- Side-by-side comparison: what's available vs what you have (shows freshness gap)
- "Auto-fetch new" toggle — automatically download new frames as they appear

### Backend
- Uses `/api/goes/catalog/latest` from PR #1
- New optional: `POST /api/goes/auto-fetch` — subscribe to a satellite/sector/band for auto-polling
  - Celery periodic task checks for new frames every N minutes
  - Configurable via settings

---

## PR #6: Tab Consolidation (12 → 7)
**Goal:** Reduce cognitive load. Fix applicable tests.

### Changes
- **Merge "Animate" + "Animation"** → single "Animate" tab with both quick-animate and studio
- **Move "Presets"** → into Fetch tab as a collapsible section / saved presets dropdown
- **Move "Cleanup"** → into Settings page as a "Storage" section
- **Move "Stats"** → into a collapsible panel in Browse tab header or the new Overview
- **Keep**: Browse, Gallery, Live, Map, Fetch, Animate, Collections (7 tabs)
- **Remove tab groups** (Data/Tools/Manage labels) — 7 tabs don't need grouping

### Tab layout (final):
| Tab | Purpose |
|-----|---------|
| Overview | Dashboard + quick actions (from PR #4) |
| Browse | Grid/list of downloaded frames |
| Gallery | Full-screen image viewer |
| Live | Real-time latest + auto-fetch |
| Fetch | Wizard + catalog browser + presets |
| Animate | Quick animate + studio combined |
| Map | Geographic view |

### Tests
- Update ALL E2E tests for new tab structure
- Remove references to deleted tabs
- Update mock-api if needed

---

## PR #7: Visual Band Picker
**Goal:** Make band selection intuitive, not just "C02 - Red (0.64µm)".

### Frontend
- Replace band dropdown with visual grid/cards:
  - **Visible** group: C01 (Blue), C02 (Red), C03 (Veggie), C04 (Cirrus), C05 (Snow/Ice), C06 (Cloud Particle)
  - **Near-IR** group: C07 (Shortwave IR)
  - **Infrared** group: C08-C16 (Upper/Mid/Low troposphere, Ozone, Water Vapor, etc.)
- Each card shows:
  - Band ID + common name
  - Wavelength
  - Thumbnail example image (static asset, ~20KB each)
  - One-line use case ("Best for: storm tracking", "Best for: fog detection")
- Mobile: horizontal scroll within each group
- Desktop: 4-column grid
- Quick filter buttons: "Weather", "Storms", "Vegetation", "All"

### Assets needed
- 16 example thumbnails (one per band) — can pull from NOAA examples or generate from existing frames
- Band metadata JSON with descriptions, use cases, wavelengths

### Backend
- Enhance `/api/goes/products` bands response to include:
  - `wavelength_um`, `common_name`, `category` (visible/near_ir/infrared), `use_case`
- Or hardcode in frontend constants (simpler, data doesn't change)

---

## PR #8: Fetch Queue + Progress Bar
**Goal:** Persistent visibility into active fetches.

### Frontend
- Fixed bottom bar (like a music player) showing:
  - Active fetch job name ("GOES-19 CONUS C02")
  - Progress: "47/200 frames (23%)"
  - ETA: "~3 min remaining"
  - Cancel button
- Expandable to show all active/recent jobs
- Uses existing WebSocket job monitoring (JobMonitor component)
- Collapses to a small pill when no active jobs

### Backend
- Enhance job progress reporting: add `frames_completed` / `frames_total` to job status
- May already exist — check goes_tasks.py progress updates

---

## PR #9+10: Quick Compare + Mobile Wizard Polish
**Goal:** Easy side-by-side comparison + final mobile refinements.

### Quick Compare (from Browse/Gallery)
- Multi-select frames → "Compare" button
- Opens split view (2 frames) or small multiples (3-4 frames)
- Sync zoom/pan across compared frames
- Time-lapse button: auto-animate selected frames
- Resurface existing ComparisonModal with better discoverability

### Mobile Polish
- Touch-friendly frame selection (long-press to multi-select)
- Swipe between tabs
- Pull-to-refresh on Browse/Live tabs
- Bottom sheet for filters instead of sidebar
- Thumb-zone-optimized action buttons

---

## Implementation Notes
- Each PR is independent and mergeable on its own
- PR #1 is foundational (catalog API used by #4, #5)
- PR #6 (tab consolidation) should happen AFTER #4 (adds Overview tab)
- PR #7 (band picker) can happen anytime, no dependencies
- All PRs include test updates
- Estimate: 8-10 PRs total, each 1-2 sub-agent sessions
