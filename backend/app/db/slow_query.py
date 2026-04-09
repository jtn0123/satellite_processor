"""Slow-query logging and Prometheus metrics for SQLAlchemy.

JTN-397: Wire SQLAlchemy ``before_cursor_execute`` / ``after_cursor_execute``
event listeners that:

* Time every statement executed through the async or sync engine.
* Log statements slower than ``SLOW_QUERY_MS`` (default 250 ms) at WARN.
* Hash bound parameters with SHA-256 rather than logging raw values —
  query params can contain API keys, user emails, share tokens, etc.
* Emit a ``db_query_duration_seconds`` Prometheus histogram with a
  ``query_kind`` label (``SELECT``/``INSERT``/``UPDATE``/``DELETE``/...).

The listener is idempotent: calling :func:`install_slow_query_listener` twice
on the same engine is a no-op after the first call.
"""

from __future__ import annotations

import contextlib
import hashlib
import logging
import os
import time
from typing import Any

from prometheus_client import Histogram
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger("app.db.slow_query")

# Prometheus histogram for DB query durations. Fine-grained buckets at the low
# end so we can see p50/p95 for fast queries, plus wider buckets to capture
# the slow tail we actually alert on.
DB_QUERY_DURATION = Histogram(
    "db_query_duration_seconds",
    "SQLAlchemy query duration in seconds",
    ["query_kind"],
    buckets=(
        0.001,
        0.005,
        0.01,
        0.025,
        0.05,
        0.1,
        0.25,
        0.5,
        1.0,
        2.5,
        5.0,
        10.0,
    ),
)


_DEFAULT_SLOW_QUERY_MS = 250.0
# Cap logged statement length so we don't spam logs with megabyte-sized IN
# clauses. Enough to identify the query without being hostile to log storage.
_STATEMENT_TRUNCATE = 500

# Small fixed vocabulary of SQL verbs we expose as metric labels. Anything
# else rolls up to ``OTHER`` so Prometheus cardinality stays bounded.
_ALLOWED_QUERY_KINDS = frozenset(
    {
        "SELECT",
        "INSERT",
        "UPDATE",
        "DELETE",
        "CREATE",
        "DROP",
        "ALTER",
        "BEGIN",
        "COMMIT",
        "ROLLBACK",
        "SAVEPOINT",
        "RELEASE",
        "PRAGMA",
        "WITH",
        "EXPLAIN",
        "SET",
        "SHOW",
    }
)


def _get_slow_query_threshold_ms() -> float:
    """Read the slow-query threshold (ms) from the ``SLOW_QUERY_MS`` env var.

    Falls back to :data:`_DEFAULT_SLOW_QUERY_MS` on missing/invalid values.
    Read on every query so tests (and operators) can flip the threshold
    without restarting the process.
    """
    raw = os.environ.get("SLOW_QUERY_MS")
    if raw is None:
        return _DEFAULT_SLOW_QUERY_MS
    try:
        value = float(raw)
    except ValueError:
        logger.warning("Invalid SLOW_QUERY_MS=%r, falling back to %.0fms", raw, _DEFAULT_SLOW_QUERY_MS)
        return _DEFAULT_SLOW_QUERY_MS
    if value < 0:
        logger.warning("Negative SLOW_QUERY_MS=%r, falling back to %.0fms", raw, _DEFAULT_SLOW_QUERY_MS)
        return _DEFAULT_SLOW_QUERY_MS
    return value


def _classify_query_kind(statement: str) -> str:
    """Return the first SQL keyword (uppercased) for metric labeling."""
    if not statement:
        return "OTHER"
    # Strip leading whitespace and ``/* ... */`` block comments.
    stripped = statement.lstrip()
    while stripped.startswith("/*"):
        end = stripped.find("*/")
        if end == -1:
            break
        stripped = stripped[end + 2 :].lstrip()
    if not stripped:
        return "OTHER"
    token = stripped.split(None, 1)[0]
    kind = token.upper()
    return kind if kind in _ALLOWED_QUERY_KINDS else "OTHER"


def _hash_parameters(parameters: Any) -> str:
    """Return a short SHA-256 prefix of ``repr(parameters)``.

    We *never* log raw parameter values — they can contain secrets, PII, or
    share tokens. The hash is stable per-process (plain SHA-256 over
    ``repr``) which is enough to correlate log lines for the same parameter
    set without leaking content.
    """
    try:
        encoded = repr(parameters).encode("utf-8", errors="replace")
    except Exception:
        logger.debug("Failed to repr() query parameters for hashing", exc_info=True)
        return "unhashable"
    return hashlib.sha256(encoded).hexdigest()[:16]


def _truncate_statement(statement: str) -> str:
    if len(statement) <= _STATEMENT_TRUNCATE:
        return statement
    return statement[:_STATEMENT_TRUNCATE] + "...<truncated>"


def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Record a query start time on the connection's info dict.

    ``cursor``, ``statement``, ``parameters`` and ``executemany`` are part of
    the SQLAlchemy event signature and intentionally unused here.
    """
    del cursor, statement, parameters, executemany
    stack = conn.info.setdefault("_slow_query_start_stack", [])
    start = time.perf_counter()
    stack.append(start)
    # Also stash on the execution context so ``after_cursor_execute`` can pop
    # the correct entry if SQLAlchemy re-enters (savepoints, nested txns).
    if context is not None:
        context._slow_query_start = start


def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Observe query duration and log slow queries."""
    del cursor, executemany
    stack = conn.info.get("_slow_query_start_stack")
    start: float | None = None
    if context is not None and hasattr(context, "_slow_query_start"):
        start = context._slow_query_start
        if stack:
            with contextlib.suppress(ValueError):
                stack.remove(start)
    elif stack:
        start = stack.pop()

    if start is None:
        return

    duration_s = time.perf_counter() - start
    kind = _classify_query_kind(statement)

    try:
        DB_QUERY_DURATION.labels(query_kind=kind).observe(duration_s)
    except Exception:
        # Metrics must never break queries — log and swallow.
        logger.debug("Failed to record db_query_duration_seconds", exc_info=True)

    threshold_s = _get_slow_query_threshold_ms() / 1000.0
    if duration_s >= threshold_s:
        logger.warning(
            "Slow query: kind=%s duration_ms=%.1f threshold_ms=%.0f params_hash=%s statement=%s",
            kind,
            duration_s * 1000.0,
            threshold_s * 1000.0,
            _hash_parameters(parameters),
            _truncate_statement(statement),
        )


def _resolve_sync_engine(engine: AsyncEngine | Engine) -> Engine:
    """Return the underlying sync :class:`Engine` for either engine flavor."""
    if isinstance(engine, AsyncEngine):
        return engine.sync_engine
    return engine


# Sentinel attribute name stamped on engines where the listener is already
# attached. Using a namespaced underscore-prefixed attribute avoids clashing
# with any SQLAlchemy-internal bookkeeping.
_INSTALLED_ATTR = "_satproc_slow_query_listener_installed"


def install_slow_query_listener(engine: AsyncEngine | Engine) -> None:
    """Attach the before/after cursor-execute listeners to ``engine``.

    Safe to call multiple times: a sentinel attribute on the sync engine
    makes repeat calls no-ops. Works for both
    :class:`sqlalchemy.engine.Engine` and
    :class:`sqlalchemy.ext.asyncio.AsyncEngine`.
    """
    sync_engine = _resolve_sync_engine(engine)
    if getattr(sync_engine, _INSTALLED_ATTR, False):
        return

    event.listen(sync_engine, "before_cursor_execute", _before_cursor_execute)
    event.listen(sync_engine, "after_cursor_execute", _after_cursor_execute)
    setattr(sync_engine, _INSTALLED_ATTR, True)
    logger.debug(
        "Slow-query listener installed on %s (threshold=%.0fms)",
        sync_engine.url.drivername,
        _get_slow_query_threshold_ms(),
    )


def remove_slow_query_listener(engine: AsyncEngine | Engine) -> None:
    """Detach the listeners — primarily useful in tests."""
    sync_engine = _resolve_sync_engine(engine)
    if not getattr(sync_engine, _INSTALLED_ATTR, False):
        return
    event.remove(sync_engine, "before_cursor_execute", _before_cursor_execute)
    event.remove(sync_engine, "after_cursor_execute", _after_cursor_execute)
    setattr(sync_engine, _INSTALLED_ATTR, False)
