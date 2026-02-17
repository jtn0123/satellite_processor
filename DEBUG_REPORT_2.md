# Debug Report #2 — Deep Dive on Live Site

**Date:** 2026-02-17  
**API:** `http://10.27.27.99:8001` | **Frontend:** `http://10.27.27.99:3001`

---

## Critical

### 1. Stale Pending Jobs Never Get Processed
Jobs created **3+ days ago** are stuck in `pending` with `started_at=None`:
- `4c683139...` — "GOES-19 FullDisk C13 (1d)" — created 2026-02-14T15:57
- `72b9f8cc...` — name=None — created 2026-02-14T06:33

These will never complete. No timeout/cleanup mechanism exists. The job with `name=None` suggests a creation bug where name wasn't set.

```bash
curl -s -H "X-API-Key: $KEY" "http://10.27.27.99:8001/api/jobs?limit=20" | python3 -c "
import sys,json
for j in json.load(sys.stdin)['items']:
    if j['status']=='pending': print(j['id'], j['name'], j['created_at'])
"
```

### 2. Permission Denied on Job Output Directory
Job `86c3c6b7...` failed with `[Errno 13] Permission denied: '/app/data/output/goes_86c3c6b7-...'`. The container's data directory has permission issues that can cause job failures.

```bash
curl -s -H "X-API-Key: $KEY" "http://10.27.27.99:8001/api/jobs/86c3c6b7-0893-4801-967f-bdc8d85e8394"
# → error: "[Errno 13] Permission denied: '/app/data/output/goes_86c3c6b7-...'"
```

---

## High

### 3. Catalog Endpoint Extremely Slow for Non-Cached Dates (~3s)
`/api/goes/catalog?date=<date>` takes **2.2–2.9 seconds** for dates without cached data. This hits the upstream NOAA AWS bucket each time.

| Date | Time |
|------|------|
| 2026-02-17 (has local data) | 0.006s |
| 2026-02-16 (no local data) | 2.94s |
| 2026-02-15 (no local data) | 2.94s |
| 1999-01-01 (no data exists) | 2.25s |

**Recommendation:** Add caching layer, or at minimum a timeout so clients aren't left hanging.

### 4. No Rate Limiting on Any Endpoint
10 rapid requests all returned 200 with no throttling. An attacker could abuse `/api/goes/fetch` to create unlimited jobs or hammer the catalog endpoint.

```bash
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "req$i: %{http_code} %{time_total}s\n" -H "X-API-Key: $KEY" \
    "http://10.27.27.99:8001/api/goes/frames?limit=1"
done
# All returned 200 in ~5ms
```

### 5. DELETE Frame Returns 405 Method Not Allowed
```bash
curl -s -w "HTTP %{http_code}" -H "X-API-Key: $KEY" -X DELETE \
  "http://10.27.27.99:8001/api/goes/frames/35721f72-bc94-4680-b572-ccfd22659832"
# → HTTP 405
```
No way to delete individual frames via API. Only bulk operations or no delete at all.

---

## Medium

### 6. Inconsistent Pagination: Catalog Returns Raw Array
All list endpoints use `{items, total, page, limit}` **except** catalog which returns a bare JSON array:

| Endpoint | Format |
|----------|--------|
| `/api/goes/frames` | `{items, total, page, limit}` ✅ |
| `/api/goes/collections` | `{items, total, page, limit}` ✅ |
| `/api/jobs` | `{items, total, page, limit}` ✅ |
| `/api/goes/catalog` | **Raw array** ❌ |
| `/api/goes/collections/{id}/frames` | `{items, total, limit, offset}` ⚠️ (uses offset not page) |

The collection frames endpoint also uses `offset` instead of `page`, inconsistent with the rest.

### 7. `localhost` Reference in Frontend JS Bundle
The built JS bundle contains `localhost` references:
```
"http://localhost" — used as fallback in URL construction
```
While it appears to be a safe fallback (only used when `window.location` is unavailable), it could cause issues in SSR or non-browser contexts.

```bash
curl -s "http://10.27.27.99:3001/assets/index-DNRV7hqa.js" | grep -oE '.{0,40}localhost.{0,40}'
```

### 8. Failed Job Has Empty Error + "failed" Status (Misleading)
Job `29d08075...` status is `failed` but `error` field is empty string. The actual error info is only in `status_message`:
```
status=failed, error="", status_message="Fetched 94 of 143 frames (49 failed to download)"
```
This is a partial success that got marked as failed. Should be a distinct status like `partial` or populate the `error` field.

---

## Low

### 9. `POST /api/goes/fetch` Requires `start_time`/`end_time` (No `count` Mode)
The original test plan assumed a `count` parameter, but the API requires `start_time` and `end_time`. The `count` field is ignored/not validated:
```bash
curl -s -H "X-API-Key: $KEY" -H "Content-Type: application/json" -X POST \
  -d '{"satellite":"GOES-19","band":"02","sector":"CONUS","count":999999}' \
  "http://10.27.27.99:8001/api/goes/fetch"
# → 422: missing start_time, end_time; also band must be "C02" not "02"
```

### 10. Band Validation Requires "C" Prefix
Bands must be `C01`–`C16`, not `01`–`16`. The error message is clear but UX could be better with auto-prefixing.

### 11. Security Headers Present (Good)
The API returns solid security headers on all responses:
- `Content-Security-Policy: default-src 'self'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), camera=(), microphone=()`

---

## Info

### 12. Input Validation Working Well
- `limit=0` → 422 (must be ≥ 1) ✅
- `limit=-1` → 422 (must be ≥ 1) ✅
- `limit=999999` → 422 (must be ≤ 200) ✅
- `satellite=BOGUS` → 200 with empty results (could argue for 400) ✅
- `date=invalid` → 400 with clear message ✅
- Empty POST body → 422 with field-level errors ✅
- Invalid satellite in POST → 422 with allowed values ✅

### 13. SQL Injection / XSS / Path Traversal — All Safe
- SQL injection `satellite=GOES-19' OR 1=1--` → 200, empty results (parameterized queries) ✅
- XSS `satellite=<script>alert(1)</script>` → 200, empty results, no reflection ✅
- Path traversal `/api/download?path=../../../etc/passwd` → 404 (endpoint doesn't exist) ✅

### 14. Auth Properly Enforced
- All `/api/goes/*` and `/api/jobs/*` endpoints require API key → 401 without ✅
- `/api/health` correctly public ✅
- `/api/shared/{token}` correctly public (by design) ✅
- Shared image endpoint works without auth ✅

### 15. Performance Excellent (Except Catalog)
- Frames: ~5ms
- Collections: ~4ms
- Jobs: ~4ms
- Catalog (cached): ~6ms
- Image serving (10MB PNG): ~32ms
- Thumbnail: ~5ms

### 16. Share System Works End-to-End
- Create share → returns token + expiry (3 days) ✅
- Access share → returns frame metadata without auth ✅
- Access shared image → serves full image without auth ✅
- Invalid token → 404 with clear message ✅

---

## Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| Critical | 2 | Stale pending jobs, permission denied errors |
| High | 3 | Slow catalog, no rate limiting, no frame delete |
| Medium | 3 | Inconsistent pagination, localhost in JS, misleading error fields |
| Low | 3 | API design quirks |
| Info | 5 | Validation, security, performance all solid |
