# ADR 0003: `/api/goes/` to `/api/satellite/` rewrite middleware

- **Status:** Accepted
- **Date:** 2026-04-09
- **Deciders:** Backend maintainers
- **Tags:** `backend`, `api`, `compatibility`

## Context

The project started as a GOES-only viewer, so the original URL namespace
baked that in: `/api/goes/products`, `/api/goes/frames`, and so on. The
frontend, the Celery task names, the saved bookmarks in the browser, and
a handful of shell scripts all knew those paths.

Then we added Himawari (see `himawari_fetch_task.py`), and more geos-
stationary satellites are planned. `/api/goes/` became a lie: the endpoints
return frames for Himawari as well. We wanted to rename the namespace to
`/api/satellite/` without:

- Breaking bookmarks in anyone's browser history.
- Forcing a lockstep frontend redeploy on every backend deploy.
- Introducing a second set of routers that would have to be kept in sync.

Options considered:

1. **HTTP 301/302 redirects** from `/api/goes/...` to `/api/satellite/...`.
   Rejected: redirects break `POST` bodies on old clients that don't follow
   307/308, and they add a round-trip to every request.
2. **Duplicate routers** under both prefixes. Rejected: doubles the surface
   to test, and it's easy for the two copies to drift.
3. **Path rewrite in nginx.** Rejected: nginx already sits in front, but
   the dev compose file and tests bypass it, so the rewrite would be
   environment-specific.
4. **ASGI middleware that rewrites `scope["path"]` in-place** before
   routing sees it.

## Decision

We implement a tiny ASGI middleware,
[`GoesToSatelliteRewriteMiddleware`](../../backend/app/main.py), that mutates
`scope["path"]` for any request whose path starts with `/api/goes/` (or is
exactly `/api/goes`), replacing that prefix with `/api/satellite`. The
middleware runs **before** routing, so from the router's perspective the
request never had the legacy prefix at all.

Key properties:

- Applies to both HTTP and WebSocket scopes.
- Pure path rewrite — query string, method, body, and headers are
  untouched.
- Zero cost for new clients that already call `/api/satellite/` directly
  (single `str.startswith` check per request).
- Lives next to the app construction, not inside a router, so new routers
  automatically participate.

A sibling alias — `/api/frames` → `/api/satellite/frames` — is implemented
as an actual redirect in `main.py` because it predates this middleware
pattern and is considered low-value to refactor.

## Consequences

### Positive

- Old bookmarks, integrations, and the ancient frontend tab someone left
  open over the weekend keep working.
- New code only ever learns one set of paths (`/api/satellite/...`).
- Removing the compatibility layer is a one-commit deletion when we are
  ready (delete the class and the `add_middleware` call).

### Negative

- OpenAPI docs only advertise `/api/satellite/...`, so the legacy paths are
  **undocumented**. This is deliberate (we don't want tooling to generate
  clients that lock us in) but it is a mild footgun for anyone reading
  CloudFlare access logs.
- Metrics tagged by `scope["path"]` will see the rewritten path, so the
  `api_goes_*` path label disappears from Prometheus. Acceptable —
  dashboards were updated at the same time as the rename.
- Middleware ordering matters. The rewrite must run before
  `RequestLoggingMiddleware` and `PrometheusMiddleware` so logs and
  metrics use the canonical name. The current `add_middleware` order in
  `main.py` is load-bearing; don't reorder without re-reading this ADR.

### When to delete this

- At least six months after the frontend stopped calling `/api/goes/*`.
- After a grep of server access logs shows zero hits on `/api/goes/`.
- After any external integrations (cron jobs, shell scripts, Home
  Assistant, etc.) have been audited.
