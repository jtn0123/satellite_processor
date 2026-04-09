# ADR 0005: In-memory SQLite + fakeredis test strategy

- **Status:** Accepted
- **Date:** 2026-04-09
- **Deciders:** Backend maintainers
- **Tags:** `backend`, `testing`, `ci`

## Context

The production stack is Postgres + Redis + Celery. The obvious "pure"
approach for backend tests is to spin up real containers for each, either
with `docker compose` fixtures or via `testcontainers-python`. That gives
you the highest fidelity — tests run against the same engines as prod —
but it costs:

- **CI time.** Pulling images, starting containers, waiting for
  health checks, and running migrations for every shard adds 30-90s per
  job. The backend test suite already runs in 4 shards in GitHub Actions.
- **Local dev friction.** Contributors need Docker running just to `pytest
  backend/tests/test_one_thing.py -v`. A failing assertion in a unit test
  shouldn't require `docker compose up postgres redis` first.
- **Flakiness.** Real Redis pub/sub and real Postgres occasionally hiccup
  under the CI runner's memory pressure, producing false negatives.

We do still need high-fidelity tests, but they are a minority of the suite
and can be opt-in.

## Decision

The default test profile is **fully in-memory, no external services**:

1. **Database:** `sqlite+aiosqlite:///:memory:`, declared as
   `TEST_DATABASE_URL` in
   [`backend/tests/conftest.py`](../../backend/tests/conftest.py). The
   conftest auto-creates tables at the start of each test and drops them
   at the end, so tests start from a known-empty state. We use `aiosqlite`
   (not `pysqlite`) so the async engine from ADR 0001 works unchanged.
2. **Redis:** [`fakeredis.FakeAsyncRedis`](https://github.com/cunla/fakeredis-py)
   (imported in `conftest.py`), swapped in via dependency override. It
   implements enough of the Redis wire protocol for pub/sub, streams,
   and simple KV ops — which is everything we do.
3. **Celery:** tasks are mocked at the boundary. Tests that want to drive
   a task call the function directly; they do not exercise the broker.
4. **Rate limiting:** disabled by fixture (rate limit middleware is short-
   circuited). Tests that specifically exercise rate limiting re-enable
   it locally.
5. **Integration tests** that need real services are marked
   `@pytest.mark.integration` and are **skipped by default** (see
   `pyproject.toml`'s `testpaths` + `markers`). `pytest -m integration`
   runs them against a real compose stack.

## Consequences

### Positive

- **Fast.** Full backend suite runs cold in seconds, not minutes. Sharded
  CI stays snappy even as the suite grows.
- **No Docker requirement for unit tests.** New contributors can clone
  and `pytest` immediately.
- **Deterministic.** In-memory DB + fakeredis means no port collisions,
  no stale state between runs, no "retry the flake".
- **CI is cheap.** We don't burn Actions minutes on container startup.

### Negative

- **SQLite is not Postgres.** Differences that bite us:
  - JSONB operators (`@>`, `->>`) don't exist — we stick to portable SQL
    or feature-detect at query time.
  - Concurrent writers lock the whole DB; tests that exercise locking
    semantics need the `@pytest.mark.integration` path.
  - Case-insensitive `LIKE` behaves differently from Postgres `ILIKE`.
- **fakeredis is not Redis.** It tracks the Redis Python client's feature
  surface, not the server's. Lua scripts and some newer `XADD` options
  are spottily supported. When we add a new Redis feature, we sanity-
  check it against a real instance first.
- **Celery tests are shallow.** We don't catch bugs in task serialisation
  or broker-level retry behaviour with unit tests. Those live in the
  integration suite and in production monitoring.

### Mitigations

- Any feature that uses Postgres-only syntax gets an integration test.
- CI additionally runs `pytest -m integration` on the `release` branch
  before the Docker build job (see `.github/workflows/test.yml`).
- When a bug escapes because fakeredis / SQLite didn't model the real
  engine, we add an integration test reproducing it and note the gotcha
  in the relevant conftest.
