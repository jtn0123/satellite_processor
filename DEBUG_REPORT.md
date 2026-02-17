# Sat-Tracker Debug Report

**Date:** 2026-02-17 15:30 UTC  
**Frontend:** <FRONTEND_URL>  
**Backend:** <API_URL>  
**Version:** 1.2.0 (commit 6232019)

## Overall Health: 🟡 MOSTLY HEALTHY

The system is functional with a few issues. Core GOES fetching, catalog browsing, and frame management all work. A few endpoints are missing/broken and there are stuck jobs from 3 days ago.

---

## Endpoint Results

### ✅ Working (200)

| # | Endpoint | Status | Notes |
|---|----------|--------|-------|
| 1 | `GET /api/health/version` | 200 (2ms) | v1.2.0, build 6232019 |
| 2 | `GET /api/health/changelog` | 200 (2ms) | Empty array `[]` — no changelog entries |
| 3 | `GET /api/goes/products` | 200 (3ms) | Full satellite/sector/band catalog, 3 satellites, 4 sectors, 16 bands |
| 4 | `GET /api/goes/latest` | 200 (7ms) | Returns latest frame (Feb 14 05:56 UTC) — **3 days old** |
| 5 | `GET /api/goes/catalog/latest` | 200 (798ms) | Live S3 query works, shows latest at 15:26 UTC today |
| 6 | `GET /api/goes/catalog?date=2026-02-17` | 200 (2.1s) | Returns 186 entries for today — works but **slow** |
| 9 | `GET /api/goes/frames?limit=10` | 200 (18ms) | 111 total frames, 10 returned, all GOES-19 FullDisk C02 |
| 10 | `GET /api/goes/frames/stats` | 200 (5ms) | 111 frames, 683MB total |
| 11 | `GET /api/goes/collections` | 200 (5ms) | 3 collections |
| 12 | `GET /api/goes/tags` | 200 (5ms) | Empty — no tags created yet |
| 13 | `GET /api/goes/composite-recipes` | 200 (3ms) | 6 recipes (true_color, natural_color, etc.) |
| 14 | `GET /api/goes/composites` | 200 (8ms) | Empty — none created |
| 15 | `GET /api/goes/cleanup-rules` | 200 (5ms) | Empty — none configured |
| 16 | `GET /api/goes/dashboard-stats` | 200 (12ms) | Good summary data |
| 17 | `GET /api/goes/quick-fetch-options` | 200 (2ms) | 4 options (1h, 6h, 12h, 24h) |
| 18 | `GET /api/goes/gaps` | 200 (8ms) | 6 gaps detected, 100% coverage reported |
| 19 | `GET /api/goes/crop-presets` | 200 (4ms) | Empty — none configured |
| 20 | `GET /api/jobs?limit=5` | 200 (7ms) | 7 total jobs, mix of completed/failed/pending |
| 23 | `GET /api/notifications` | 200 (5ms) | Empty |
| — | `POST /api/goes/fetch` | 200 | Job created and processing successfully |
| — | Frontend (port 3001) | 200 | HTML loads correctly |
| — | API docs (/docs) | 200 | Swagger UI accessible |

### ❌ Broken / Missing

| # | Endpoint | Status | Issue |
|---|----------|--------|-------|
| 7 | `GET /api/goes/catalog/available` | **404** | Endpoint not implemented |
| 8 | `GET /api/goes/preview/band-samples` | **404** | Endpoint not implemented |
| 21 | `GET /api/settings` | **500** | Internal server error — likely DB/schema issue |
| 22 | `GET /api/system/info` | **404** | Endpoint not implemented |

### ⚠️ WebSocket

| Endpoint | Status | Issue |
|----------|--------|-------|
| `ws://*/ws/jobs/{id}` | **403** | Requires API key auth — curl test rejected. Needs `?api_key=` query param or header support for WS |

---

## Bugs Found

### 🐛 BUG 1: `/api/settings` returns 500
**Severity:** Medium  
The settings endpoint crashes with an internal error. Likely a missing DB table/migration or unhandled null case.

### 🐛 BUG 2: Stuck pending jobs (3 days old)
**Severity:** Medium  
Two jobs have been stuck in `pending` status since Feb 14:
- `4c683139` — GOES-19 FullDisk C13 (1d) — never started (no task_id)
- `72b9f8cc` — Animation job — never started (no task_id)

These were likely queued when the Celery worker was down or restarted, and never picked up. No retry mechanism apparent.

### 🐛 BUG 3: POST `/api/goes/fetch` schema mismatch
**Severity:** Low  
The `count` parameter from the original API design is not accepted. The endpoint requires explicit `start_time` and `end_time` fields. The frontend likely handles this correctly, but the documented simple API (`count: 1`) doesn't work.

### 🐛 BUG 4: Permission denied on job output
**Severity:** Low (historical)  
Job `86c3c6b7` failed with `Permission denied: '/app/data/output/goes_86c3c6b7'`. This was a one-time issue from Feb 14 that appears resolved (later jobs succeeded).

### 🐛 BUG 5: Gap analysis reports 100% coverage but has 6 gaps  
**Severity:** Low  
`coverage_percent: 100.0` while simultaneously reporting 6 gaps with 6 expected missing frames. The math seems off — 111 frames found vs 100 expected, so coverage > 100% which gets capped.

### 🐛 BUG 6: Latest local frame is 3 days stale
**Severity:** Info  
`/api/goes/latest` returns a frame from Feb 14. No automated fetching is running — `active_schedules: 0`. This is expected if no schedules are configured but worth noting.

---

## CORS

CORS headers are properly configured:
- `access-control-allow-origin: <FRONTEND_URL>` ✅
- `access-control-allow-credentials: true` ✅
- `access-control-expose-headers: X-Request-ID` ✅

---

## Performance Notes

- Most endpoints respond in < 20ms ✅
- `/api/goes/catalog/latest` takes ~800ms (S3 query) — acceptable
- `/api/goes/catalog?date=` takes ~2.1s (S3 list) — could be slow for UI, consider caching

---

## 3 Missing Endpoints (404s)

These are referenced in the test list but don't exist in the API:
1. `/api/goes/catalog/available` — likely intended to show available dates/satellites
2. `/api/goes/preview/band-samples` — likely intended to show sample images per band
3. `/api/system/info` — likely intended to show system resource usage

These may be planned features not yet implemented.

---

## Recommendations

1. **Fix `/api/settings` 500 error** — check DB migration, this is a core endpoint
2. **Add stuck job cleanup** — implement a sweep that marks old `pending` jobs as `failed` after a timeout
3. **Implement missing endpoints** or remove them from frontend navigation if they exist there
4. **WebSocket auth** — document how frontend should authenticate WS connections (query param `?api_key=X` is common)
5. **Cache S3 catalog queries** — the 2s response time for date listings could be cached for 5 min
6. **Fix gap coverage math** — coverage_percent shouldn't be 100% when gaps exist
