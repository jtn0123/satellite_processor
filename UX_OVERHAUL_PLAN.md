# SatTracker UX Overhaul Plan

## Vision
GOES satellite data is the hero. Manual upload/process stays as a power-user capability.
The app should feel like looking at Earth from space — clean, dark, immersive.
Mobile-first thinking. One-click to see imagery. Power features accessible but not in the way.

---

## Phase 1: Foundation & Fix What's Broken
*Get the basics working before rearranging furniture*

### PR A — Fix Live View + Add Tests (`fix/live-view-broken`)
- **Audit why Live tab is broken** — identify missing endpoints, broken API calls
- Fix `/api/goes/bands`, `/api/goes/live`, `/api/goes/status` (all 404 currently)
- Ensure Live tab loads, displays latest frame, auto-refreshes
- Add comprehensive tests:
  - Live tab: render, satellite/sector/band selection, image display, refresh, stale data, error states
  - Fetch tab: full wizard flow, quick fetch, validation, preset loading, error handling
  - At least 20 new frontend tests, 10 backend tests for live/fetch endpoints
- Fix empty catch blocks in JobMonitor (5 instances — add toast errors)

### PR B — One-Click Fetch + Quick Actions (`feat/quick-fetch`)
- Add "Fetch Latest" button to Dashboard — pre-filled GOES-19 CONUS C02, last 1 hour
- Add "Fetch Latest" to Live tab header (already has "Fetch Now" but verify it works)
- Simplify Fetch tab: default to "Quick Mode" (satellite + sector + band + "Last N hours" dropdown + GO button)
- Keep full wizard as "Advanced" toggle within the same tab
- Add fetch presets as quick-action chips (e.g., "CONUS Last Hour", "Full Disk 6hr")
- Tests for quick fetch flow

---

## Phase 2: Navigation Restructure
*Make GOES the primary experience, clean up the information architecture*

### PR C — Restructure Sidebar + Reduce Tabs (`refactor/nav-restructure`)
**Sidebar (7 → 6 items):**
- Dashboard (GOES-focused, one-click fetch)
- Live View (promoted from tab to top-level)
- Browse & Fetch (combined — fetch is how you get frames, browse is where you see them)
- Animate (single unified experience)
- Jobs (job monitoring, stays as-is)
- Settings (cleanup rules, composites config, manual upload/process as sections)

**GOES tabs (10 → 4) inside Browse & Fetch:**
- Browse (frames grid + filters + collections inline)
- Fetch (quick + advanced, presets inline)
- Map (geo overlay of frames)
- Stats (storage, coverage, gaps — merged)

**Where things move:**
- Overview → merged into Dashboard
- Gallery → removed (redundant with Browse, was old ImageGallery)
- Live → promoted to sidebar top-level
- Collections → section within Browse (filter by collection, manage in panel)
- Composites → section within Settings or Browse actions
- Cleanup → section within Settings
- Presets (sidebar) → merged into Fetch tab + Settings

**Manual Upload/Process:**
- Settings page gets "Manual Processing" section with Upload zone + ProcessingForm
- Or: separate "Tools" page (Upload, Process, Manual Import) for power users
- Not removed — just not front-and-center for the common workflow

### PR D — Mobile Bottom Nav + Responsive Polish (`feat/mobile-nav`)
- Bottom tab bar (mobile only, md:hidden): Live, Browse, Fetch, Animate, More
- "More" opens sheet with: Jobs, Settings, Dashboard
- Remove hamburger drawer on mobile (replaced by bottom nav)
- Fix tab overflow on GOES page — with 4 tabs this is less of an issue
- Audit touch targets, spacing, information density on mobile
- Simplified mobile frame cards (2-3 actions visible, rest in ⋯ menu)

---

## Phase 3: Visual Design Overhaul
*Make it look like a satellite app, not a SaaS dashboard*

### PR E — Color Scheme + Visual Hierarchy (`design/color-overhaul`)
**New palette concept — "Deep Space":**
- Background: deeper, richer navy (`#060d1b` → `#0a1628` gradient)
- Primary: shift from cyan to a more distinctive teal-blue (`#0ea5e9` sky-500 range)
- Accent: warm amber/gold for actions and CTAs (`#f59e0b`)
- Success/error stay green/red but muted to match
- Cards: subtle glass-morphism with backdrop-blur, gradient borders
- Active states: glow effects on primary color (box-shadow with primary/30)

**Visual hierarchy improvements:**
- Hero cards (Live image, main stats) get more visual weight — larger, subtle glow
- Secondary cards get less prominence
- Typography scale: bigger headings, more contrast between levels
- Satellite imagery thumbnails get subtle rounded corners + shadow on hover

**Light mode:**
- Clean white with blue-gray accents (not pure gray)
- Primary actions use the teal-blue
- Cards get subtle blue-tinted shadows

### PR F — Imagery as Hero + Polish (`design/imagery-hero`)
- Live View: full-bleed satellite image with controls overlay (like a photo viewer, not a dashboard)
- Dashboard: latest satellite image as a subtle background/hero section
- Browse: larger thumbnails, hover preview, smooth transitions
- Frame cards: show capture time prominently, satellite/band as subtle badges
- Loading states: skeleton shimmer that matches the dark theme
- Composites showcase: gallery of color composite previews (true color, vegetation, etc.)
- Empty states: illustrated with satellite imagery snippets

---

## Phase 4: Workflow Polish
*Make common tasks frictionless*

### PR G — Unified Animation Experience (`refactor/animation-merge`)
- Merge "Quick Animate" and "Animation Studio" into one flow
- Default: pick frames (by filter or collection) → preview → settings panel → generate
- Remove the mode toggle — it's one experience with progressive disclosure
- Settings panel slides in from the right (or bottom on mobile)
- Show animation preview inline (not separate page)
- Animation presets as quick-start chips

### PR H — Progressive Disclosure + Frame Actions (`ux/frame-actions`)
- Frame cards show: thumbnail, capture time, satellite badge
- Primary actions (visible): View, Download
- Secondary actions (⋯ menu): Compare, Tag, Add to Collection, Share, Delete
- Batch actions: select multiple → floating action bar (already exists, polish it)
- Image lazy loading with intersection observer
- Infinite scroll or "Load More" instead of pagination on Browse

### PR I — Monitor Mode + Smart Fetch (`feat/monitor-mode`)
- "Watch" button on Live view: auto-fetches new frames at interval
- Ties together: fetch schedule + live refresh + notification when new frame arrives
- Schedule presets: "Watch CONUS every 10 min", "Full Disk hourly"
- Visual indicator when monitoring is active (pulsing dot in nav)
- WebSocket push when new frames are ingested

---

## Phase 5: Testing & Hardening
*Runs parallel with all phases*

### PR J — Comprehensive Test Suite (`test/ux-overhaul-coverage`)
- Target: 90%+ new code coverage on all new components
- E2E tests for critical flows:
  - New user → Dashboard → Fetch Latest → see image
  - Live View → auto-refresh → fetch new → compare
  - Browse → select frames → create animation → play
  - Mobile: bottom nav → browse → view frame → back
- Accessibility audit: keyboard nav through new layouts, screen reader testing
- Performance: lighthouse scores before/after for mobile + desktop

---

## Priority Order
1. **PR A** — Fix Live + testing (unblocks everything)
2. **PR B** — Quick fetch (immediate UX win)
3. **PR C** — Nav restructure (biggest structural change)
4. **PR D** — Mobile nav (biggest mobile win)
5. **PR E** — Color scheme (visual transformation)
6. **PR G** — Animation merge (workflow clarity)
7. **PR F** — Imagery hero (delight)
8. **PR H** — Frame actions (polish)
9. **PR I** — Monitor mode (power feature)
10. **PR J** — Testing throughout (parallel)

## Notes
- Manual upload/process capability stays — moved to Settings or dedicated "Tools" page
- Each PR should be self-contained and mergeable independently
- Sub-agents handle all code work, main session stays responsive
- CodeRabbit + SonarQube must pass before merge (no --admin bypass)
- Testing is not a separate phase — every PR includes tests for what it touches
