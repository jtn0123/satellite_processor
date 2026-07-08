# Application Grading Report — July 2026

A full-stack audit of the satellite_processor platform (FastAPI backend, `satellite_processor` core engine, React 19 frontend, Celery/Redis/Postgres, Docker Compose deployment). Every improvement item below was **validated against the actual code** — file and line references were confirmed by reading the source, and the test suites, linters, and builds were actually executed as part of this audit.

## How this was validated

| Check | Result |
|---|---|
| Frontend unit tests (`npx vitest run`) | ✅ **232 files / 1,988 tests, all passing** (125s) |
| Frontend production build (`npm run build`, tsc + vite) | ✅ Passes in ~1s of Vite time, with route-level code splitting |
| Frontend lint (`npm run lint`) | ❌ **26 errors** (24× `react-hooks/refs` in `FetchTab.tsx`, 2× `set-state-in-effect`), 115 warnings |
| Backend/core lint (`ruff check .`) | ⚠️ 11 errors (9× `T201` print, 1× `S314` xml, 1× `B905`) |
| Backend/core format (`ruff format --check`) | ✅ 279 files clean |
| Backend + core tests (`pytest`, full suite in one process) | ✅ **3,023 passed, 65 skipped**; 7 failures + 28 errors, none of them app bugs: core-processor errors are `RuntimeError: FFmpeg not found` (audit container lacks FFmpeg; CI installs it), and every failure (all 7 in `test_concurrency.py`) plus the `test_redis_migration.py` errors pass 100% when their files run standalone — single-process isolation coupling that CI masks via 4-way sharding (see §8) |
| Manual verification | Headline findings (nginx key injection, dead Animate flow, Prometheus 401, `create_all`+Alembic, blocking preview fetch) each re-confirmed by direct source reading |

## Report card

| # | Area | Grade |
|---|---|---|
| 1 | Backend architecture | **B+** |
| 2 | Backend code quality | **A-** |
| 3 | Database & API design | **B** |
| 4 | Frontend architecture & code quality | **A-** |
| 5 | Frontend UX & robustness | **B+** |
| 6 | Frontend performance | **B+** |
| 7 | Security | **B+** |
| 8 | Testing | **A-** |
| 9 | CI/CD pipeline | **A-** |
| 10 | Deployment & DevOps | **B** |
| 11 | Observability | **B-** |
| 12 | Documentation | **B+** |

**Overall: B+** — engineering discipline well above typical for a project of this size (ticket-traced fixes, SHA-pinned CI, idempotency layers, circuit breakers on both client and server). The grade is held back by a handful of deployment-boundary decisions (auth bypass via the frontend proxy, dark production metrics, no backup story) rather than by code quality.

---

## 1. Backend architecture — B+

Routers → services → tasks layering is clean, with shared DI (`backend/app/db/database.py:53`), a uniform error envelope (`backend/app/errors.py`), and a single-source satellite registry. Held back by backend↔core integration via `sys.path` hacks, duplicated FFmpeg logic, and in-process state that breaks under multiple workers.

### Improvements

1. **Blocking S3 download on the event loop in `/preview`.** `backend/app/routers/goes_fetch.py:451` calls `fetch_single_preview(...)` directly in the async route; that function does synchronous boto3 `get_object` (60s read timeout), NetCDF→PNG conversion, and `time.sleep` retry backoff (`backend/app/services/goes_fetcher.py:129, 507`). Every other S3-touching route offloads to `_s3_executor` (`goes_catalog.py:149,184,215`) — this one endpoint can freeze the entire API for all users for up to minutes per call. **Fix:** wrap in `await loop.run_in_executor(_s3_executor, ...)` like its siblings. *(Validated: confirmed the direct call and the `time.sleep` retries.)*
2. **In-process state breaks under multiple workers.** Animation dedup uses a module-level dict + `threading.Lock` (`backend/app/routers/animations.py:53-97`), so with `uvicorn --workers N` or 2 replicas, a double-click still creates N animations — while the project already has the correct Redis primitive (`backend/app/idempotency.py`, used by `jobs.py` and `goes_fetch.py`). Same issue for the per-IP WS cap (`main.py:336`) and `system.py:50` cache. **Fix:** move animation dedup to the existing Redis idempotency path.
3. **Duplicated FFmpeg pipeline glued by `sys.path` hacks.** `backend/app/tasks/animation_tasks.py:143-196` hand-rolls palettegen/libx264 encoding that `satellite_processor/core/video_handler.py` (683 lines, with encoder validation and GPU support) already implements; core imports go through `sys.path.insert` (`backend/app/services/processor.py:14`, `backend/app/tasks/processing.py:37-41`). Two encoders will drift — bugs fixed in one won't fix the other. **Fix:** install `satellite_processor` as a real package dependency and route animation encoding through `core.video_handler`.
4. **Startup preset-seeding duplicates the router logic.** `backend/app/main.py:139-166` reimplements `seed_default_presets` from `backend/app/routers/scheduling.py:52-73` inline in `lifespan` under a blanket `except Exception`; the two copies already differ. **Fix:** extract one `seed_default_presets(db)` service function called from both.

## 2. Backend code quality — A-

Exceptionally disciplined: no bare `except:` anywhere, broad catches confined to task/startup boundaries with ticket-citing comments (JTN-393 campaign), timing-safe key comparison, log-injection sanitization, Redis idempotency, TOCTOU-safe job-status transitions (`backend/app/routers/jobs.py:302-317`).

### Improvements

1. **72 route handlers return untyped `dict[str, Any]` vs only 10 `response_model=` declarations.** High-traffic surfaces like `/latest` (`goes_catalog.py:283-326`) and `/dashboard-stats` (`goes_frames.py:54-123`) have no typed success schema, so the generated frontend types (`generated-types.ts`) see `unknown` — which is exactly why the frontend hand-wrote duplicate types (see §4.3). **Fix:** add Pydantic response models to the dashboard/stats/latest endpoints first; this unlocks deleting the frontend duplicates.
2. **Dead compat shims: four distinct backward-compat mechanisms coexist.** `backend/app/routers/goes.py` and `goes_data.py` exist only to re-export symbols (no production imports — only tests), alongside the ASGI rewrite middleware (`main.py:63-75`), a 307 alias (`main.py:278-285`), and re-export blocks in `goes_fetcher.py:33-63`. **Fix:** repoint tests at real modules, delete the shim routers, keep the middleware as the single compat mechanism.
3. **`main.py` is 586 lines mixing app wiring, auth middleware, and three WebSocket endpoints;** `backend/app/tasks/himawari_fetch_task.py` (748 lines) combines fetch, compositing, and record creation. **Fix:** extract WS endpoints to `app/routers/ws.py` and split the Himawari task into fetch/composite/persist stages — this also makes the untested paths in it testable.
4. **11 outstanding ruff errors** (validated by running `ruff check .`): 9 stray `print` statements (T201), one `xml.etree` parse of external data (S314 — use `defusedxml`), one `zip()` without `strict=` (B905). **Fix:** a single small PR; the S314 one matters because the XML comes from an external source.

## 3. Database & API design — B

Composite indexes match query patterns (`ix_goes_frames_sat_sector_band_capture`, `app/db/models.py:52-59`), CheckConstraints, FK `ondelete` policies, consistent generic `PaginatedResponse[T]`, `selectinload` against N+1. Held back by dual schema management and tz-naive timestamps.

### Improvements

1. **Dual schema management: `create_all()` on every startup plus Alembic.** `backend/app/db/database.py:61` runs `Base.metadata.create_all` unconditionally in `lifespan` (its own comment at lines 3-4 says dev-only) while `backend/alembic/versions/` holds 20 revisions. A deployment that boots before `alembic upgrade head` silently creates unstamped tables; future migrations then fail or drift. **Fix:** gate `create_all` behind `settings.debug` and fail fast in prod when `alembic_version` is behind head. *(Validated: confirmed `create_all` at line 61 and the dev-only comment.)*
2. **File deletion ordered before DB commit.** `app/routers/jobs.py:377-383` (bulk) and `417-422` (single) physically delete frame files, then `db.commit()`. A failed commit or mid-loop crash leaves rows pointing at deleted files — the UI then 404s on `/frames/{id}/image`. Same ordering in `scheduling.py:507-513`. **Fix:** commit row deletions first, remove files best-effort after (orphaned files are sweepable; orphaned rows are user-visible breakage).
3. **Naive `DateTime` columns tax every call site.** All timestamps are `Column(DateTime)` with naive-UTC `utcnow()` (`app/utils/__init__.py:35-40`); the cost is visible — an 18-line comment in `scheduling.py:190-208` on avoiding naive/aware `TypeError`, defensive `tzinfo` patches in `goes_fetcher.py:290-293` and `goes_fetch.py:91-93`, and JTN-460 regressions cited in docstrings. **Fix:** migrate to `DateTime(timezone=True)` (TIMESTAMPTZ) and delete the per-site normalization.
4. **17 sequential queries per request in `band_sample_thumbnails`.** `goes_catalog.py:235-252` loops all 17 bands issuing one `ORDER BY capture_time DESC LIMIT 1` each (masked by a 300s cache). **Fix:** one query with `DISTINCT ON (band)` or a window function — the codebase already does this pattern in `scheduling.py:79-111`.

## 4. Frontend architecture & code quality — A-

Three-layer type system from OpenAPI-generated types, exactly one `any` in production code (validated by grep: 1 hit), and a production-grade mutation-resilience layer (`src/utils/mutationResilience.ts`: per-endpoint circuit breaker, in-flight dedup, Idempotency-Key propagation) that most frontends never build.

### Improvements

1. **ESLint currently fails with 26 errors** (validated by running it): 24× `react-hooks/refs` concentrated in `src/components/GoesData/FetchTab/FetchTab.tsx` (reading/writing refs during render — a real correctness hazard under React 19 concurrent rendering, not just style) and 2× `set-state-in-effect` (incl. `src/pages/ErrorDashboard.tsx`). Because CI's path filter only lints when frontend files change, this can sit latent. **Fix:** refactor FetchTab's render-time ref access (move into effects/handlers); this is the current gate to a green `npm run lint`.
2. **Prop-drilling monolith:** `src/components/GoesData/LiveTab/LiveImageArea.tsx:25-108` takes ~50 props (8 setters, 5 ref/handler objects, full query results) tunneled from `LiveTab.tsx:277-335`. Any Live-view state change ripples through the whole interface. **Fix:** a `LiveTabContext` (or 3 grouped objects: `viewState`, `zoomApi`, `monitorApi`) consumed directly by the leaf components.
3. **Hand-written API types duplicate generated OpenAPI schemas.** `src/components/GoesData/types.ts:9-60` hand-defines `Product`, `GoesFrame`, `CoverageStats` while `src/api/generated-types.ts:419-554` already has the generated `/api/satellite/*` schemas. Backend changes will type-check against the generated file but silently drift from the copies every GoesData component uses. **Fix:** re-export from `components['schemas']` in `src/api/types.ts` (the pattern already used for `ImageResponse`/`JobResponse`) and delete the duplicates. Pairs with §2.1.
4. **`formatBytes` exists three times with inconsistent output** — `src/utils/format.ts:5-11` ('0 B', 1 decimal), `src/utils/formatters.ts:8-16` ('0 Bytes', 2 decimals), `src/components/GoesData/utils.ts:1` — so users see different byte formatting on different pages. **Fix:** keep `src/utils/format.ts`, update the ~11 import sites, delete the other two.

## 5. Frontend UX & robustness — B+

Layered error handling is genuinely strong (per-route + per-tab + image error boundaries, window-error → toast pipeline, batched prod error reporting to `/api/errors`, an ErrorDashboard). Docked a full step because a primary user flow is currently broken.

### Improvements

1. **Broken flow: batch "Animate" does nothing.** `src/components/GoesData/BrowseTab.tsx:261-264` dispatches `switch-tab` with `'animate'` and an `animate-frames` CustomEvent — but the only `switch-tab` listener accepts `['browse','fetch','map','stats']` (`src/pages/GoesData.tsx:24-42`), and there are **zero** `animate-frames` listeners anywhere in `src/` (validated by grep). Multi-select frames → click Animate → nothing happens, no error. The e2e suite misses it because `e2e/browse-animate.spec.ts:105-123` loads `/animate` directly. **Fix:** `useNavigate()` to `/animate?frames=id1,id2`, read the param in `pages/Animate.tsx`, delete both dead dispatches — and add an e2e step that clicks the actual button.
2. **Replace the global CustomEvent bus that caused it.** Stringly-typed dispatches (`BrowseTab.tsx:78,86,242,261-264`, `OverviewTab.tsx:133`, `StatsTab.tsx:34`) with no compile-time listener check are exactly how item 1 shipped. **Fix:** tab switching is already URL state (`?tab=`) — use `useSearchParams`; make `set-subview` a context callback from GoesData.
3. **JobMonitor actions bypass the app's own resilience layer.** `src/components/Jobs/JobMonitor.tsx:384-404` calls raw `api.delete`/`api.post` while `useApi.ts:106-144` provides hooks with dedup, idempotency keys, and `['jobs']` cache invalidation — so double-clicks fire duplicate deletes and the list only self-heals via its 5s poll. Note also "Cancel" and "Delete" hit the identical `DELETE /jobs/{id}` (lines 386, 393), so Cancel silently destroys the job record. **Fix:** use `useDeleteJob()`/`useCreateJob()` here; give Cancel its own endpoint or label it honestly.
4. **ARIA tabs are half-implemented.** `src/pages/GoesData.tsx:212-244` sets `role="tablist"`/`role="tab"`/`aria-selected` but no `aria-controls`/`id` pairs, no `role="tabpanel"` on the content (line 247), and no arrow-key roving tabindex. Screen readers announce "tab" and the expected interaction isn't there. **Fix:** add the id/controls linkage + ArrowLeft/Right/Home/End handling, or drop the tab roles.

## 6. Frontend performance — B+

All 9 routes lazy-loaded (validated by the build output's per-route chunks), hover-prefetch of the 158 kB Leaflet chunk, WS-gated polling that shuts off redundant XHR, IntersectionObserver image lazy-loading. Total main bundle 227 kB (69 kB gzip) — healthy.

### Improvements

1. **`memo(FrameCard)` is defeated by inline callbacks.** `FrameCard.tsx:284` is memoized, but `BrowseTab.tsx:208-222` passes `onCompare`/`onTag`/`onAddToCollection`/`onDelete` as inline arrows — new identities every render, so every loaded card re-renders on any BrowseTab state change (O(all cards) per keystroke with infinite scroll). **Fix:** `useCallback` those four (the other handlers already are).
2. **Undepped keydown effect.** `BrowseTab.tsx:113-129` has a `useEffect` with **no dependency array** that adds/removes a `document` keydown listener — resubscribing on every render of a busy component. **Fix:** add deps or read selection via functional setState.
3. **No virtualization or page cap on the infinite frame grid.** `Browse/FrameGridContent.tsx:64-88` renders all accumulated pages in a flat list; `useBrowseData.ts:36-37` accumulates unboundedly. Combined with item 1, DOM and re-render cost grow without limit as users scroll a large archive. **Fix:** `maxPages` on the infinite query (TanStack v5 supports it) or `@tanstack/react-virtual`.
4. **Unthrottled per-pointermove setState in the zoom hook.** `src/hooks/useImageZoom.ts:308,341` sets React state on every mouse/touch move — hundreds of renders/sec of the ~50-prop LiveImageArea subtree on 120 Hz devices. **Fix:** coalesce via `requestAnimationFrame` or write `transform` imperatively during interaction, commit state on pointer-up.

## 7. Security — B+

The code-level fundamentals are unusually strong: `hmac.compare_digest` key comparison, fail-closed startup when `API_KEY` is unset in prod (`main.py:114-119`), consistent path-traversal sanitizers on **every** file-serving endpoint checked, list-form FFmpeg argv (no `shell=True` anywhere), ORM-only SQL, streamed 50 MB upload cap with PIL verification, security headers + rate limiting + body limits, non-root containers, hash-pinned installs. Held back by trust-boundary decisions in deployment.

### Improvements

1. **HIGH — nginx injects the real API key for every frontend visitor.** `frontend/nginx.conf:33,43` adds `proxy_set_header X-API-Key "${API_KEY}"` on `/api/` and `/ws/`, and `docker-compose.yml:11` binds `"3000:80"` on all interfaces. Anyone who can reach port 3000 (any LAN device, or the internet if forwarded) gets full read/write API access — the API-key scheme only protects direct port-8000 access. *(Validated: both the nginx lines and the compose binding.)* **Fix (production only):** on the tunneled production host, bind ports to loopback (`"127.0.0.1:3000:80"`, same for 8000) so only the Cloudflare tunnel/edge reaches them — via a prod override file so local `docker compose up` and `docker-compose.dev.yml` keep their reachable ports. Alternatively drop header injection and use real session auth. At minimum, document that port 3000 must never be LAN-exposed in production.
2. **MEDIUM — SSRF via unvalidated `webhook_url`.** `backend/app/routers/settings.py:68` accepts any string (every other field in that model is tightly bounded); `backend/app/services/webhook.py:27-29` then POSTs to it from inside the compose network. Combined with item 1, anyone reaching the frontend can point it at `http://redis:6379/` or a metadata endpoint. **Fix:** require `https://` and allowlist Discord webhook hosts (it's documented as Discord), or reject private/link-local ranges after resolution.
3. **MEDIUM — monitoring stack on default/no credentials.** `docker-compose.yml:228-229` exposes Prometheus `9090` with no auth; `:245` falls back to `GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}` — and `.env.example` doesn't even list `GRAFANA_PASSWORD`. Contrast: Postgres/Redis correctly use `:?must be set`. **Fix:** `:?` enforcement for Grafana, bind both to `127.0.0.1`, add the var to `.env.example`.
4. **LOW — deprecated WS auth via URL query param.** `backend/app/main.py:395` still accepts `?api_key=` (comment says deprecated), leaking keys into browser history and proxy logs — the codebase already built the safer first-message flow at `main.py:400-411`. **Fix:** remove the fallback; the frontend (`src/api/ws.ts`) already uses first-message auth.

## 8. Testing — A-

Big and real: ~2,000 backend test functions across 130 files, 399 core-engine tests, and **1,988 frontend tests that all pass** (executed in this audit), plus ~28 Playwright e2e specs, sharded in CI. Fixtures are clean (in-memory aiosqlite per-test create/drop, opt-in fakeredis/mock-Celery). Docked for coverage-gate-chasing artifacts and a few genuinely dark modules.

### Improvements

1. **WebSocket tests are connect-only.** `backend/tests/test_websocket.py` asserts only the `{"type": "connected"}` handshake on all three endpoints; no test exercises the Redis pub/sub → WS relay that CLAUDE.md calls the key real-time pattern — and the broken batch-Animate flow (§5.1) shows what connect-only/direct-URL testing misses. **Fix:** publish to the fake pubsub and assert the frame arrives on the socket.
2. **Verified untested modules:** `backend/app/tracing.py` (0 test references), `backend/app/services/webhook.py` (delivery/retry logic untested — only its settings), `backend/app/tasks/scheduling_tasks.py` (2 thin references for the module driving all periodic fetches and cleanup). **Fix:** prioritize `scheduling_tasks.py` — it's the code that runs unattended.
3. **Coverage gates lag the suite.** `fail_under = 61` backend / 70% frontend with a suite this size means real regressions fit under the gate; per-shard `--cov-fail-under=61` (`test.yml:125`) is also fragile if shard composition shifts. **Fix:** measure actual merged coverage, ratchet gates to actual-minus-2%, and gate on the merged number in `pr-summary` (which already computes it).
4. **Gate-driven test files** (`test_goes_coverage_boost.py` — docstring literally says it exists to boost a SonarQube gate — `test_sonar_pr101.py`, `LiveTabCoverage.test.tsx`, `CodeRabbitFixes.test.tsx`) indicate tests written to appease tools. **Fix:** as these files are touched, fold their useful assertions into behavior-named suites; stop the naming pattern going forward.

Observed while executing the suite for this audit: running all ~3,100 backend+core tests in a single process reproducibly fails 7 tests in `backend/tests/test_concurrency.py` and errors out `backend/tests/test_redis_migration.py` — yet both files pass 100% standalone (verified twice). Some test leaves shared state (event loop, Redis fake, or circuit-breaker globals) that later tests inherit. CI never sees this because the 4-way shard split happens to separate the offenders, but the coupling is fragile — a future re-shard could surface it as mystery CI flakes. Worth a `pytest -p no:randomly`-style bisect (`pytest --stepwise` between suspects) when convenient.

## 9. CI/CD pipeline — A-

Genuinely mature: every action SHA-pinned across all 5 workflows, path-filter job gating, 4-way backend shards with `pytest-split` stored durations, real Postgres/Redis integration job running actual Alembic migrations, docker-compose smoke test, API contract validation, 3-way Playwright shards with trace upload, SonarCloud with merged coverage, Trivy scanning, Dependabot auto-merge, semantic-release, and a scheduled branch-protection drift check almost nobody builds.

### Improvements

1. **The security audit cannot fail.** `test.yml:76`: `pip-audit --strict || true` — the `|| true` makes the gate decorative, directly under a comment asserting the audit "passes cleanly." *(Validated by reading the workflow — and corroborated live: GitHub currently reports 4 open Dependabot vulnerabilities on the default branch (1 moderate, 3 low) that a working gate would surface.)* **Fix:** delete `|| true` (or `continue-on-error: true` if you want visible-but-non-blocking). The single highest-value one-line fix in the repo.
2. **No Python type checking anywhere** (verified: no mypy/pyright in any config, workflow, or pre-commit). The async SQLAlchemy/FastAPI backend — where awaited-vs-not and Optional bugs bite hardest — has zero static typing enforcement while the frontend gets full `tsc -b`. **Fix:** add mypy or pyright to the `lint-audit` job and pre-commit, starting with `backend/app/services/` and `tasks/`.
3. **Trivy scans after the image is already live.** In `docker.yml`, `scan-images` runs after `build-and-push` has pushed `:latest`, and Watchtower auto-deploys from GHCR within minutes — so a CRITICAL finding fails CI *after* the vulnerable image is in production. The "Verify API image health" step is also a no-op (`|| true`, never curls health). **Fix:** reorder build → scan → push; make the health step actually check `/api/health` or delete it.
4. **Missing `timeout-minutes` on almost every job** (only the Sonar job has one) — a wedged Playwright or 60s-health-poll job burns the 6-hour default. Also `test.yml:217`'s `api-contracts` runs on `[self-hosted, ci]` in a `pull_request`-triggered workflow — arbitrary code execution on your hardware if forks are ever enabled, and a single point of failure today. **Fix:** `timeout-minutes: 15–30` per job; move api-contracts to `ubuntu-latest` (it just runs a Python script).

Also observed live during this audit: the SonarCloud job hard-fails on PRs that don't receive repo secrets (bot-authored PRs, e.g. Dependabot runs 1600/1601 and this report's own PR) with `Failed to query JRE metadata ... check SONAR_TOKEN` — consider gating the scan step with `if: env.SONAR_TOKEN != ''` so those PRs skip instead of fail.

## 10. Deployment & DevOps — B

Well above hobby grade: healthcheck-gated startup ordering, per-service memory/CPU limits, log-rotation anchor, `:?err` secret enforcement for Postgres/Redis, per-queue Celery workers, `--require-hashes` installs, non-root user, migrations-with-retry entrypoint. Held back by recovery and parity gaps.

### Improvements

1. **No backup story at all** (verified: zero `pg_dump`/backup references in compose, Makefile, scripts/, docs/). `pgdata` and `sat-data` volumes are the only copies of job history and all imagery, while Watchtower auto-deploys make a bad-migration-plus-no-backup combination live within ~10 minutes of a push. The otherwise-excellent runbook covers `alembic downgrade` but never data restore. **Fix:** a `pg_dump` cron sidecar + documented `sat-data` snapshot policy + a Restore section in `docs/runbooks/deployment.md`.
2. **Prod Redis is the Celery broker with no persistence; the Portainer variant can silently eat tasks.** `docker-compose.yml:208-221`: no volume, no `--appendonly` — every Redis restart drops all queued tasks and results. `portainer-stack.yml:103`: `--maxmemory-policy allkeys-lru` on a broker DB evicts queued tasks under memory pressure (Celery's docs require `noeviction`). **Fix:** volume + `--appendonly yes`; `noeviction` in the Portainer stack.
3. **`portainer-stack.yml` has no `beat` service** — so on a Portainer deployment, `check_schedules` (60s) and `run_cleanup` (hourly) from `backend/app/celery_app.py:105-116` never fire: scheduled fetches stop and **disk cleanup never runs**. The file targets the real prod domain, so it looks live. Related: `run_cleanup` exits early if the user never created a `CleanupRule` — no default rule is seeded and there's no free-disk-floor kill switch, so a default deployment fills its disk. **Fix:** add the beat service (mirror `docker-compose.yml:170-186`), seed a conservative default cleanup rule, and add a disk-floor check.
4. **Dev/prod parity gap.** `docker-compose.dev.yml` runs one shared SQLite file across the API + four worker containers (write-lock contention prod never sees; prod is asyncpg) and defines no beat — so scheduling/cleanup paths are untestable via `make dev`. Also `make test` never runs vitest and `make lint` skips `ruff format --check`/prettier, so local green diverges from CI. **Fix:** Postgres + beat in the dev compose; align Makefile targets with CI's jobs.

## 11. Observability — B-

The instrumentation code is A-grade — structured JSON logging with correlation IDs, wide-event request middleware, Prometheus metrics with UUID cardinality normalization, opt-in OTel, dead-letter `failed_jobs` table, detailed health checks, provisioned Grafana dashboard. The grade is B- because **the pipeline is broken in production**: great instrumentation, dark dashboards.

### Improvements

1. **Prometheus gets 401 from the API in production.** JTN-470 put `/api/metrics` behind auth (`main.py:78-87`), and `API_KEY` is mandatory when `DEBUG=false` — but `monitoring/prometheus.yml` has no credentials config *(validated: no `authorization` block in the scrape config)*. Every production scrape fails; all HTTP/disk/frame metrics are dark and the shipped Grafana dashboard is empty. A security fix silently disabled monitoring. **Fix:** add header credentials to the scrape config (or exempt metrics on an internal-only listener).
2. **Celery task metrics are never exported.** `TASK_FAILURES`/`TASK_COMPLETIONS` (`backend/app/metrics.py:37-47`) are incremented by signal handlers inside worker processes (`celery_app.py:176-194`), but only the API container serves `/api/metrics` and Prometheus only scrapes `api:8000` — the counters live in per-process registries nothing reads. Task failure rate is unobservable despite being instrumented. **Fix:** `prometheus_client.start_http_server()` in `worker_init` + a scrape job, or a celery-exporter.
3. **No alert rules at all, and a permanently-down scrape target.** No `rule_files`/alertmanager anywhere; `monitoring/prometheus.yml:13-17` scrapes `node-exporter:9100`, which exists in no compose file. Disk-full — this platform's most likely failure — has a gauge (`disk_free_bytes`) but nothing watching it. **Fix:** add node-exporter (or drop the job) and a minimal rules file: disk free, task failure rate, API 5xx, target-down.
4. **Health endpoint returns 200 when degraded, and no error tracking.** `health.py:154-174` returns HTTP 200 with `status: degraded`, so the compose healthcheck passes with the DB down; no Sentry/GlitchTip anywhere — unhandled exceptions live only in container logs. **Fix:** 503 on degraded (or a separate `/ready`), and optional `SENTRY_DSN` wiring.

## 12. Documentation — B+

`docs/runbooks/deployment.md` is exceptional — rollback trees, Watchtower failure modes, incident response, postmortem habit — and ADRs exist. Docked for verifiable drift that undermines the trust the runbooks earn.

### Improvements

1. **`docs/deployment.md:167-189` documents env vars that don't exist.** `SECRET_KEY` ("required"), `DATA_DIR`, `MAX_UPLOAD_SIZE_MB`, `CORS_ORIGINS` default `*` — none are fields in `backend/app/config.py`, and `extra = "ignore"` means setting them is a silent no-op (security theater in `SECRET_KEY`'s case). **Fix:** regenerate the table from the actual `Settings` fields.
2. **`.env.example:16` will crash the API if used.** `CORS_ORIGINS=http://localhost:3000` — but `config.py:31` types it `list[str]`, so pydantic-settings demands JSON; a bare string raises at import → crashloop. `.env.production.example` compounds it by instructing "comma-separated." **Fix:** JSON arrays in both examples, or add a validator accepting comma-separated; also add missing vars (`GRAFANA_PASSWORD`, `WORKER_*_CONCURRENCY`).
3. **Stale facts sweep:** README says React 18 (`package.json`: `^19.2.7`) and Python 3.12 (Dockerfile: `3.11-slim`); ADR 0004 reads "Accepted" though the four-queue topology it defers is implemented (should be Superseded); `docs/deployment.md:223` says don't run migrations from workers, yet the shared `entrypoint.sh` does exactly that in all 7 containers. Related drift: root `requirements.txt` pins `numpy==2.5.0`, which does not resolve on Python 3.11 (the version in CI and the backend Dockerfile) — CI never notices because every job installs `backend/requirements.lock` instead, making the root file dead weight that misleads local installs. **Fix:** one drift-sweep commit; either delete root `requirements.txt` or align it with the lockfile and supported Python.
4. **Quick Start doesn't survive first contact.** README's `docker compose up --build -d` exits fatally without `API_KEY` (`main.py:114-119`) and mandatory `POSTGRES_PASSWORD`/`REDIS_PASSWORD` — no "copy `.env.example` first" step; Prometheus/Grafana (ports 9090/3001) are undiscoverable from the docs. **Fix:** a First-Run section and a short Monitoring section.

---

## Top 10 actions by impact (cross-cutting priority list)

| # | Action | Area | Effort |
|---|---|---|---|
| 1 | Bind ports 3000/8000 to loopback on the production host (nginx injects the API key for every visitor) — keep dev ports as-is | Security | Tiny |
| 2 | Remove `\|\| true` from `pip-audit --strict` in CI | CI/CD | One line |
| 3 | Fix Prometheus scrape auth — production metrics are currently dark | Observability | Small |
| 4 | Fix the dead batch-Animate flow and retire the CustomEvent bus | UX | Small |
| 5 | Add a backup/restore story (pg_dump sidecar + sat-data snapshots + runbook section) | DevOps | Medium |
| 6 | Offload `/preview`'s blocking S3 fetch to the executor | Backend | Tiny |
| 7 | Add beat to `portainer-stack.yml` + seed a default cleanup rule (disk fills otherwise) | DevOps | Small |
| 8 | Fix the 26 `react-hooks` ESLint errors in FetchTab | Frontend | Small |
| 9 | Gate `create_all` behind debug; make prod require Alembic head | Database | Small |
| 10 | Add Python type checking (mypy/pyright) to CI | CI/CD | Medium |

## Validated strengths worth keeping

- **Remediation culture:** non-obvious code cites tickets (JTN-393/460/470/…) with the prior failure mode documented — rare discipline.
- **Client-side write-path hygiene:** per-endpoint circuit breaker, request dedup, Idempotency-Key propagation (`src/utils/mutationResilience.ts`) with dedicated tests.
- **Supply chain:** SHA-pinned actions across all workflows, `--require-hashes` Docker installs, locked deps via uv, Dependabot with scoped auto-merge.
- **Security fundamentals:** timing-safe comparisons, fail-closed prod startup, consistent path-traversal sanitizers, list-form subprocess calls, ORM-only SQL, log-injection sanitization.
- **CI maturity:** sharded tests with stored durations, real-database migration tests, compose smoke tests, branch-protection drift checking.
- **Ops depth in code:** S3 circuit breaker, slow-query listeners on both engines, Redis idempotency with reasoned TTLs, `task_acks_late` + memory-capped workers, wide-event logging with correlation IDs.
