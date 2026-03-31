# Dogfood Report: Satellite Processor

| Field | Value |
|-------|-------|
| **Date** | 2026-03-28 |
| **App URL** | http://localhost:5174 (frontend) / http://localhost:8000 (API) |
| **Session** | satellite-processor |
| **Scope** | Full app — all pages, API endpoints, interactive features |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 1 |
| Medium | 2 |
| Low | 2 |
| **Total** | **6** |

## Issues

### ISSUE-001: All cached API endpoints crash with 500 when REDIS_URL is empty

| Field | Value |
|-------|-------|
| **Severity** | critical |
| **Category** | functional |
| **URL** | Multiple: `/api/satellite/dashboard-stats`, `/api/satellite/products`, `/api/satellite/catalog/latest` |
| **Repro Video** | N/A |

**Description**

When `REDIS_URL` is empty or not a valid Redis URL scheme, **every endpoint using the `get_cached()` function** returns a 500 Internal Server Error. The root cause is in `backend/app/services/cache.py:34` where `get_redis_client()` is called **outside** the try/except block. When `ConnectionPool.from_url("")` raises a `ValueError` (invalid URL scheme), it's uncaught and becomes a 500.

Affected endpoints (at minimum): `/satellite/dashboard-stats`, `/satellite/products`, `/satellite/catalog/latest`. These are the first endpoints the Dashboard and Live pages call, so the entire app appears broken on first load.

With a valid `redis://` URL (even if Redis isn't actually running), the error is caught properly and the cache degrades gracefully. This means the bug only manifests when `REDIS_URL` is unset or empty.

**Root Cause**

```python
# cache.py:34 — this line is OUTSIDE the try/except
redis_client = get_redis_client()  # raises ValueError if URL scheme invalid
try:
    cached = await redis_client.get(key)  # only this is wrapped
except (RedisError, OSError, RuntimeError, ...):
    ...
```

**Fix**

Move `get_redis_client()` inside the try/except, or add `ValueError` to the caught exceptions, or validate the Redis URL at startup and set a sentinel.

**Repro Steps**

1. Start backend with `REDIS_URL=""` (or omit it entirely)
2. `curl http://localhost:8000/api/satellite/dashboard-stats` returns `{"error":"internal_error"}`
3. `curl http://localhost:8000/api/satellite/products` returns `{"error":"internal_error"}`
4. Start backend with `REDIS_URL="redis://localhost:6379/0"` (even without Redis running)
5. Same endpoints now return proper data with graceful cache degradation

---

### ISSUE-002: Keyboard shortcuts button in toolbar does nothing

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | functional |
| **URL** | http://localhost:5174/ (all pages) |
| **Repro Video** | N/A |

**Description**

The keyboard icon button in the top toolbar (labeled "Keyboard shortcuts") does not open the keyboard shortcuts dialog when clicked. However, pressing the `?` key on the keyboard correctly opens the dialog. The button is present on every page but never works via click.

**Repro Steps**

1. Navigate to any page
2. Click the keyboard shortcuts icon button in the top-right toolbar
3. **Expected:** Keyboard shortcuts dialog opens
4. **Actual:** Nothing happens
5. Press `?` key — dialog opens correctly

---

### ISSUE-003: "Fetch Latest CONUS" button shows no feedback on failure

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | ux |
| **URL** | http://localhost:5174/ |
| **Repro Video** | N/A |

**Description**

When clicking "Fetch Latest CONUS" on the Dashboard and the backend cannot dispatch the task (e.g., Celery/Redis broker unavailable), the button shows no loading state, no error toast, and no feedback whatsoever. The API returns a 503 with a clear error message (`"Failed to enqueue task -- broker may be unavailable"`), but the frontend silently swallows it. The user has no idea if anything happened.

**Repro Steps**

1. Navigate to Dashboard
2. Click "Fetch Latest CONUS"
3. **Expected:** Loading spinner, then error toast explaining the broker is unavailable
4. **Actual:** Nothing visible happens. No loading state, no toast, no navigation.

---

### ISSUE-004: Dashboard shows "Try again" for stats without explaining why

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | ux |
| **URL** | http://localhost:5174/ |
| **Repro Video** | N/A |

**Description**

When the dashboard-stats API fails (whether from ISSUE-001 or a temporary server error), the stats section shows only a generic "Try again" button with no context about what failed or why. This is the first thing users see on the dashboard. The error should explain what went wrong (e.g., "Could not load dashboard statistics") and potentially suggest a fix (e.g., "Check Redis connectivity").

**Repro Steps**

1. Navigate to Dashboard when stats API is failing
2. **Expected:** Error message explaining what went wrong
3. **Actual:** Only a "Try again" button with no context

---

### ISSUE-005: Multiple "View on GitHub" links in changelog have no distinguishing labels

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | accessibility |
| **URL** | http://localhost:5174/ (changelog dialog) |
| **Repro Video** | N/A |

**Description**

The changelog dialog contains 5+ "View on GitHub" links, all with identical accessible names. A screen reader user has no way to distinguish which release each link corresponds to. Each link should include the version number in its accessible label (e.g., "View v1.42.1 on GitHub").

**Repro Steps**

1. Open changelog dialog (click "Show changelog" or on first visit)
2. Inspect the accessibility tree — all links are labeled identically as "View on GitHub"

---

### ISSUE-006: Shared frame page shows error toast for expected 404

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | ux |
| **URL** | http://localhost:5174/shared/invalid-token |
| **Repro Video** | N/A |

**Description**

When navigating to a shared frame with an invalid token, the page correctly shows "Not Found" with the message "This share link is invalid or has been removed." However, it also triggers an error toast notification and logs a console error for the 404 API response. A 404 on a shared link is an expected scenario (expired/deleted shares) and should not produce error toasts — the inline "Not Found" message is sufficient.

**Repro Steps**

1. Navigate to `http://localhost:5174/shared/invalid-token`
2. **Expected:** Clean "Not Found" page with explanatory message
3. **Actual:** "Not Found" page appears BUT also shows an error notification toast and console error

---
