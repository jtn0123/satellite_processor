# Improvement Plan V2 — B → A Grade

## Batch 1: Backend Reliability (Critical)
**PR #280** — Exception handling audit + Celery retry config
- Audit all 50 `except Exception` catches, classify and fix
- Add `autoretry_for`, `max_retries=3`, `retry_backoff=True` to all Celery tasks
- Add structured error classification (consistent APIError usage)
- Add dead letter tracking (failed_jobs table + model)

## Batch 2: Architecture — Backend decomposition
**PR #281** — Split fat routers + tasks
- `goes.py` (734 lines) → `goes_fetch.py`, `goes_catalog.py`, `goes_browse.py`
- `goes_data.py` (795 lines) → `goes_frames.py`, `goes_composites.py`, `goes_animation.py`
- `goes_tasks.py` (714 lines) → `fetch_task.py`, `animation_task.py`, `processing_task.py`
- Each task file gets its own retry policy
- Keep all existing routes/URLs identical (just reorganize)

## Batch 3: Frontend — Kill tech debt
**PR #282** — Remove `as any`, fix custom events, add query defaults
- Kill all 29 `as any` casts with proper types
- Replace `CustomEvent('switch-tab')` / `CustomEvent('set-subview')` with React context or zustand
- Add TanStack Query defaults: `staleTime: 30_000`, `gcTime: 300_000`
- Add `React.memo` to heavy list items (FrameCard, JobListItem)

## Batch 4: Architecture — Frontend decomposition
**PR #283** — Split god components
- LiveTab.tsx (609) → extract `useLiveViewState` hook (state machine), `LiveImagePanel`, `LiveControls`
- BrowseTab.tsx (784) → extract `BrowseFilters`, `BrowseGrid`, `BrowseActions`
- FetchTab.tsx (628) → extract `FetchForm`, `FetchPreview`, `FetchProgress`
- AnimateTab.tsx (533) → extract `AnimateControls`, `AnimatePreview`

## Batch 5: Testing — Real coverage
**PR #284** — Delete coverage boost, add behavioral tests
- Delete CoverageBoost{1,2,3}.test.tsx
- Add behavioral flow tests: Live View load → band switch → zoom → compare
- Add behavioral flow tests: Browse → select → batch action → animate
- Add contract tests (frontend API calls match backend response shapes)

**PR #285** — Real E2E against Docker Compose
- Create `e2e-integration/` with Playwright tests against full stack
- Seed test data via API
- Cover: Live View, Browse, Fetch job, Animation creation

## Batch 6: Security + Observability
**PR #286** — Security hardening + observability
- API key required by default (fail to start without it)
- Per-endpoint rate limits on `/goes/catalog/latest`
- Celery task duration Prometheus metrics
- Job failure rate metric + threshold logging

## Batch 7: DevOps
**PR #287** — CI split + deploy health check
- Split `test.yml` (1144 lines) → `test-backend.yml`, `test-frontend.yml`, `test-e2e.yml`
- Add post-deploy health check (verify `/api/health` after Watchtower pull)
- Add PostgreSQL backup cron job

## Order of execution
1 → 2 → 3 → 4 → 5 → 6 → 7 (sequential, each merges before next starts)

## Not included (lower priority)
- Sentry integration (requires external account setup)
- Visual regression testing (requires baseline screenshots)
- OpenAPI client generation (nice-to-have, contract tests cover the gap)
