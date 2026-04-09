# ADR 0001: Sync SQLAlchemy in Celery workers, async SQLAlchemy in FastAPI

- **Status:** Accepted
- **Date:** 2026-04-09
- **Deciders:** Backend maintainers
- **Tags:** `backend`, `celery`, `sqlalchemy`, `asyncio`

## Context

The backend has two very different execution environments that both need
database access:

1. **FastAPI** — a pure `asyncio` web server. Request handlers are `async
   def`, we use `asyncpg` for PostgreSQL and `aiosqlite` for tests, and
   `sqlalchemy.ext.asyncio.AsyncSession` is the natural fit.
2. **Celery workers** — a classic pre-fork / threaded worker model. Tasks
   are regular synchronous Python functions dispatched by a `billiard` pool.
   Celery 5.x does not natively drive coroutines: to call an async function
   from inside a task you have to either wrap it in `asyncio.run(...)` (which
   spins up a fresh event loop per call and fights connection pooling) or
   smuggle a long-lived loop into the worker process.

We experimented early on with `asyncio.run()` inside Celery tasks. The
result was flaky: connection pools could not be reused across calls, and any
library that captured the loop at import time (e.g. aiosqlite file handles,
httpx transports) would crash on the second invocation. Task retries made
the problem worse.

## Decision

We split the persistence story cleanly along the execution-model boundary:

- **FastAPI request path** uses `create_async_engine` with `asyncpg` /
  `aiosqlite`. The engine and session factory live in
  [`backend/app/db/database.py`](../../backend/app/db/database.py) and are
  dependency-injected into routers via `AsyncSession`.
- **Celery task path** uses a lazily-initialised **synchronous** engine and
  `sessionmaker`, defined in
  [`backend/app/tasks/helpers.py`](../../backend/app/tasks/helpers.py). The
  URL is rewritten at runtime: `+aiosqlite` is stripped and `+asyncpg` is
  replaced with `+psycopg2`, so the same `DATABASE_URL` env var works for
  both environments.
- The sync engine is created exactly once per worker process and reused
  across tasks, with `pool_size=5`, `max_overflow=10`, `pool_recycle=1800`,
  and `pool_pre_ping=True` to survive idle connections through proxies.
- Tasks call the sync session through the small helper module; they do
  **not** touch `AsyncSession` or `asyncio.run()`.

## Consequences

### Positive

- No event-loop-per-task overhead, no `RuntimeError: Event loop is closed`
  flakiness on retries.
- Each environment uses the driver that is best supported: `asyncpg` is the
  fastest async Postgres driver, `psycopg2` has battle-tested connection
  pooling under a pre-fork model.
- Test suite remains fully async (see [ADR 0005](./0005-in-memory-sqlite-fakeredis-tests.md))
  because tasks are mocked at the Celery boundary in unit tests.

### Negative

- Two session shapes, two import paths — contributors have to remember
  which side of the wall they are on. A query helper written for FastAPI
  cannot be reused directly in a Celery task.
- Models are defined once (shared `sqlalchemy.orm.DeclarativeBase`) but
  session usage diverges. Refactors that touch both sides cost roughly 2x.
- The URL rewriting in `_get_sync_db` is a small footgun: any new async
  driver suffix needs to be handled there.

### Follow-ups

- `composite_task` has a known session-leak issue on exception paths
  (tracked in project tech debt). The sync helper should grow a context
  manager so tasks can `with get_sync_db() as session:` instead of manual
  `try / finally`.
- If SQLAlchemy 2.x ever ships first-class support for async drivers inside
  pre-forked workers without the loop-per-call penalty, revisit this ADR.
