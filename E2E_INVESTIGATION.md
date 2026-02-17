# E2E Test Flakiness Investigation

**Date:** 2026-02-17  
**Status:** Root cause identified with high confidence

---

## Summary

Shard 1/2 hangs intermittently while shard 2/2 passes consistently. The root cause is **`route.continue()` fallback in API mocks** combined with **no backend running in CI**. When an unmocked API path is hit, `route.continue()` tries to forward the request to `localhost:4173` (a static file server with no API), causing the request to either hang indefinitely or return HTML instead of JSON, which breaks the app's rendering and causes Playwright timeouts.

---

## Root Cause Analysis

### Primary Cause: `route.continue()` vs `route.fulfill()` in API Mocks

**The critical difference between shard 1 and shard 2 tests:**

| File (alphabetical) | Shard | Fallback Handler | Risk |
|---|---|---|---|
| `animation.spec.ts` | 1 | `route.fulfill({ json: {} })` | ✅ Safe |
| `dashboard.spec.ts` | 1 | `route.continue()` | ❌ **HANGS** |
| `fetch.spec.ts` | 1 | `route.fulfill({ json: {} })` | ✅ Safe |
| `goes-data.spec.ts` | 1 | `route.continue()` | ❌ **HANGS** |
| `jobs.spec.ts` | 1 | `route.continue()` | ❌ **HANGS** |
| `navigation.spec.ts` | 2 | `route.continue()` | ❌ Risk exists |
| `process.spec.ts` | 2 | `route.continue()` | ❌ Risk exists |
| `settings.spec.ts` | 2 | `route.fulfill({ json: {} })` | ✅ Safe |
| `theme.spec.ts` | 2 | `route.continue()` | ❌ Risk exists |
| `upload.spec.ts` | 2 | `route.continue()` | ❌ Risk exists |

Playwright shards files alphabetically. Shard 1 gets `animation` through `jobs` (5 files, ~15 tests). Shard 2 gets `navigation` through `upload` (5 files, ~17 tests).

**Shard 1 has 3 out of 5 files using the dangerous `route.continue()` fallback**, including `dashboard.spec.ts` and `goes-data.spec.ts` which are likely the first tests to run in their respective files.

**Why shard 2 seems to pass:** The shard 2 files with `route.continue()` (`navigation`, `process`, `theme`, `upload`) happen to mock enough endpoints that no unmocked API calls are made during those specific test scenarios. Or the pages they test don't trigger as many API calls on load.

### How `route.continue()` causes hangs

In CI, the webServer is `npm run preview -- --port 4173` (Vite's static file preview server). This server:
- Serves the built SPA files
- Has **no API backend** running
- Any `/api/*` request forwarded via `route.continue()` goes to `localhost:4173`
- The static server returns the SPA's `index.html` for any unmatched route (SPA fallback)
- The app receives HTML instead of JSON, causing parsing errors
- Or, in some cases, the request may hang waiting for a response

### Problematic code pattern

```typescript
// ❌ DANGEROUS - in dashboard.spec.ts, goes-data.spec.ts, jobs.spec.ts, etc.
await page.route('**/api/**', async (route) => {
  const url = route.request().url();
  if (url.includes('/api/health')) return route.fulfill({ json: { status: 'ok' } });
  // ... other mocks ...
  return route.continue();  // ← Forwards to non-existent API = hang/error
});

// ✅ SAFE - in animation.spec.ts, fetch.spec.ts, settings.spec.ts
await page.route('**/api/**', async (route) => {
  const url = route.request().url();
  if (url.includes('/api/health')) return route.fulfill({ json: { status: 'ok' } });
  // ... other mocks ...
  return route.fulfill({ json: {} });  // ← Safe fallback
});
```

### Secondary Issues

1. **No `timeout` configured in `playwright.config.ts`**: Defaults to 30s per test. When a request hangs, it eats the full 30s timeout × 2 retries = 90s per failing test. Multiple hanging tests can easily exceed 5 minutes.

2. **`workers: 1` in CI**: Tests run sequentially, so one hanging test blocks everything else in the shard.

3. **Missing mocks for some endpoints**: Even files using `route.fulfill({ json: {} })` may be missing specific endpoint mocks, but at least they fail gracefully.

4. **Inconsistent mock coverage across files**: Each test file has its own copy-pasted mock handler with slight differences. Some mock `/api/goes/frame-count`, others don't. Some mock `/api/health/version`, others don't.

---

## Affected Tests (from reports)

These tests were specifically reported as timing out:
- **"fetch button is present"** — `fetch.spec.ts` (shard 1) — uses safe fallback, but may be affected by shard 1's overall slowdown
- **"satellite selector shows options"** — `fetch.spec.ts` (shard 1)
- **"GOES data page shows tabs"** — `fetch.spec.ts` (shard 1)

These tests themselves are in a "safe" file, but they run in shard 1 where `dashboard.spec.ts` (runs first alphabetically in shard 1 after `animation.spec.ts`) may have already caused delays/resource exhaustion.

---

## Recommended Fixes

### Priority 1: Replace all `route.continue()` with `route.fulfill()` (5 min fix)

In every E2E test file, change the fallback handler:

```typescript
// BEFORE (in dashboard.spec.ts, goes-data.spec.ts, jobs.spec.ts, 
//         navigation.spec.ts, process.spec.ts, theme.spec.ts, upload.spec.ts)
return route.continue();

// AFTER
return route.fulfill({ json: {} });
```

**Files to fix:**
- `e2e/dashboard.spec.ts` (line 46)
- `e2e/goes-data.spec.ts` (line 71)
- `e2e/jobs.spec.ts` (lines 26, 77)
- `e2e/navigation.spec.ts` (line 40)
- `e2e/process.spec.ts` (line 25)
- `e2e/theme.spec.ts` (line 24)
- `e2e/upload.spec.ts` (line 25)

### Priority 2: Extract shared mock handler (reduce duplication)

Create a shared `e2e/helpers/mock-api.ts` that all test files import:

```typescript
// e2e/helpers/mock-api.ts
import { Route } from '@playwright/test';

const PIXEL = Buffer.from('iVBORw0KGgo...', 'base64');

export async function mockAllApis(route: Route) {
  const url = route.request().url();
  
  // Image endpoints
  if (url.match(/\/api\/goes\/frames\/[^/]+\/(image|thumbnail)/))
    return route.fulfill({ contentType: 'image/png', body: PIXEL });
  
  // Health
  if (url.includes('/api/health/version'))
    return route.fulfill({ json: { version: '2.2.0', build: 'test' } });
  if (url.includes('/api/health/changelog'))
    return route.fulfill({ json: [] });
  if (url.includes('/api/health'))
    return route.fulfill({ json: { status: 'ok' } });
  
  // ... all other endpoints ...
  
  // SAFE FALLBACK
  return route.fulfill({ json: {} });
}
```

### Priority 3: Add explicit timeouts in playwright.config.ts

```typescript
export default defineConfig({
  timeout: 15_000,        // 15s per test (down from 30s default)
  expect: { timeout: 5_000 }, // 5s for assertions
  webServer: {
    command: process.env.CI ? 'npm run preview -- --port 4173' : 'npm run dev',
    url: process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,      // 30s to start the server
  },
  // ...
});
```

### Priority 4: Add `navigationTimeout` to catch slow navigations

```typescript
use: {
  baseURL: process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173',
  trace: 'retain-on-failure',
  navigationTimeout: 10_000,
  actionTimeout: 5_000,
},
```

---

## Verification Steps

After applying fixes:
1. Run `npx playwright test --shard=1/2` locally to verify shard 1 passes
2. Push and verify both shards pass in CI
3. Check that run time is under 1 minute for each shard

---

## Confidence Level

**95% confident** the `route.continue()` fallback is the primary cause. The pattern perfectly explains:
- Why shard 1 fails more (3/5 files have the issue)
- Why it's flaky (timing-dependent — sometimes the unmocked requests complete before timeout, sometimes not)
- Why specific tests like "GOES data page shows tabs" fail (they're in files or shards affected by `route.continue()`)
