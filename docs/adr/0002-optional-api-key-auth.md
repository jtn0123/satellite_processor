# ADR 0002: Optional API key authentication — disabled in dev, required in prod

- **Status:** Accepted
- **Date:** 2026-04-09
- **Deciders:** Backend maintainers
- **Tags:** `backend`, `security`, `auth`, `devex`

## Context

This is a single-maintainer side project, but it is exposed to the public
internet through a Cloudflare Tunnel. We need *some* authentication on the
API, because once an attacker can call `/api/satellite/` they can trigger
expensive Celery fetches, fill the data volume, or enumerate jobs.

At the same time, we do not want to:

- Stand up an OAuth / OIDC provider just to scratch our own itch.
- Force every local developer to mint a key, paste it into `.env`, and
  rotate it when they wipe their database.
- Block test execution on a secret that has to be injected into CI.

A real user table (with hashed passwords, sessions, etc.) is over-engineered
for the current user base of "one person and some cron jobs".

## Decision

The API uses a **single shared API key** passed via the `X-API-Key` header,
with an *explicit opt-out* for local development:

- The key is read from the `API_KEY` env var and stored in `Settings.api_key`
  (see [`backend/app/config.py`](../../backend/app/config.py)).
- If `API_KEY` is unset (empty string), the auth middleware in
  [`backend/app/main.py`](../../backend/app/main.py) **short-circuits**: no
  header is required and every request passes through. A startup warning is
  logged so the condition is visible.
- In `debug=False` (production) mode, startup **fails hard** if `API_KEY` is
  empty — we refuse to boot an unauthenticated production API.
- Key comparison uses `hmac.compare_digest` to avoid timing side channels.
- Swagger UI (`/docs`), ReDoc (`/redoc`), and the OpenAPI spec are exempt so
  the interactive docs still load; everything else — including
  `/api/metrics` (see JTN-470 comment in `main.py`) — requires the header.
- WebSocket handshakes check the same header / query param so the auth
  surface is consistent across HTTP and WS.

## Consequences

### Positive

- Zero-config local dev: `make dev` just works, no secret management.
- Production is safe-by-default — a missing `API_KEY` in prod is a startup
  error, not a silently-unauthenticated service.
- Tests don't need a key (they run with `debug=True` and empty `API_KEY`).
- Simple enough that we can rotate the key by flipping one env var and
  restarting the API container.

### Negative

- **No per-user accounting.** Every caller is "the API key". If the key
  leaks, the only remediation is rotate + audit logs.
- Key is in env vars, not a secrets manager. Exposure surface = whoever can
  read the host's Docker env or `.env` file.
- Log warning when running without a key is easy to miss in CI logs; we
  mitigate this by the hard-fail-in-prod check above.
- Anyone who forgets the "`debug=False` requires API_KEY" rule will hit a
  SystemExit at startup — intentional, but surprising the first time.

### When to revisit

Upgrade to real auth (OIDC via Cloudflare Access, or a Users table with
password hashing) when any of the following become true:

- More than one human actively uses the API.
- We need per-user audit trails or rate limits.
- We want to expose a public read-only tier alongside authenticated writes.
