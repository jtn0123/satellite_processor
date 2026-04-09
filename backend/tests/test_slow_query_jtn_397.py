"""Tests for JTN-397: slow-query logging + Prometheus histogram.

These tests exercise the SQLAlchemy event listener directly against a
throwaway in-memory SQLite engine so we do not touch the app's global
engine or leave listeners attached across tests.
"""

import hashlib
import logging

import pytest
from app.db.slow_query import (
    DB_QUERY_DURATION,
    _classify_query_kind,
    _hash_parameters,
    _truncate_statement,
    install_slow_query_listener,
    remove_slow_query_listener,
)
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine

# ── Unit tests for helpers ─────────────────────────────────────────


class TestClassifyQueryKind:
    def test_select(self):
        assert _classify_query_kind("SELECT * FROM foo") == "SELECT"

    def test_insert(self):
        assert _classify_query_kind("insert into foo values (1)") == "INSERT"

    def test_update_with_leading_whitespace(self):
        assert _classify_query_kind("   UPDATE foo SET a=1") == "UPDATE"

    def test_block_comment_stripped(self):
        assert _classify_query_kind("/* hint */ SELECT 1") == "SELECT"

    def test_nested_block_comments(self):
        assert _classify_query_kind("/* a */ /* b */ DELETE FROM foo") == "DELETE"

    def test_empty_returns_other(self):
        assert _classify_query_kind("") == "OTHER"

    def test_unknown_verb_buckets_to_other(self):
        # ``VACUUM`` is a valid SQLite verb but deliberately not in the
        # whitelist — it should bucket to OTHER so metric cardinality stays
        # bounded.
        assert _classify_query_kind("VACUUM") == "OTHER"

    def test_whitespace_only(self):
        assert _classify_query_kind("   \n\t  ") == "OTHER"


class TestHashParameters:
    def test_returns_16_char_hex(self):
        h = _hash_parameters({"a": 1})
        assert len(h) == 16
        assert all(c in "0123456789abcdef" for c in h)

    def test_stable_for_same_input(self):
        assert _hash_parameters((1, 2, 3)) == _hash_parameters((1, 2, 3))

    def test_differs_for_different_input(self):
        assert _hash_parameters({"a": 1}) != _hash_parameters({"a": 2})

    def test_sha256_prefix(self):
        params = {"secret": "hunter2"}
        expected = hashlib.sha256(repr(params).encode()).hexdigest()[:16]
        assert _hash_parameters(params) == expected

    def test_never_contains_raw_sensitive_value(self):
        """Regression: raw sensitive values must never leak into the hash string."""
        sensitive = "SuperSecretAPIKey"
        assert sensitive not in _hash_parameters({"api_key": sensitive})
        assert sensitive.lower() not in _hash_parameters({"api_key": sensitive}).lower()


class TestTruncateStatement:
    def test_short_statement_unchanged(self):
        assert _truncate_statement("SELECT 1") == "SELECT 1"

    def test_long_statement_truncated(self):
        stmt = "SELECT " + ("a, " * 500)
        out = _truncate_statement(stmt)
        assert out.endswith("...<truncated>")
        assert len(out) <= 500 + len("...<truncated>")


# ── Integration test against a real SQLite engine ─────────────────


@pytest.fixture
def isolated_sqlite_engine():
    """Build a fresh sync SQLite engine and install the listener on it.

    We use a local engine (not the app's global one) so this test is
    hermetic — removing the listener at teardown restores state.
    """
    engine = create_engine("sqlite:///:memory:")
    install_slow_query_listener(engine)
    try:
        yield engine
    finally:
        remove_slow_query_listener(engine)
        engine.dispose()


@pytest.fixture
def isolated_async_sqlite_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    install_slow_query_listener(engine)
    try:
        yield engine
    finally:
        remove_slow_query_listener(engine)


def _histogram_count(kind: str) -> float:
    """Return the total observation count for a ``query_kind`` label.

    ``prometheus_client`` stores non-cumulative per-bucket counts in
    ``_buckets``; the total count is the sum of every bucket. We sum rather
    than reading ``_sum`` because ``_sum`` tracks the *total duration*, not
    the number of observations.
    """
    metric = DB_QUERY_DURATION.labels(query_kind=kind)
    return sum(b.get() for b in metric._buckets)


def test_fast_query_records_metric_but_does_not_warn(isolated_sqlite_engine, caplog):
    before = _histogram_count("SELECT")
    with caplog.at_level(logging.WARNING, logger="app.db.slow_query"), isolated_sqlite_engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    after = _histogram_count("SELECT")

    assert after == before + 1, "histogram should record every query"
    # SELECT 1 is well under 250 ms even on the slowest CI runner.
    slow_warnings = [r for r in caplog.records if "Slow query" in r.getMessage()]
    assert slow_warnings == [], "fast query must not log a slow-query warning"


def test_slow_query_logs_warning(isolated_sqlite_engine, caplog, monkeypatch):
    # Force every query to be considered slow.
    monkeypatch.setenv("SLOW_QUERY_MS", "0")

    with caplog.at_level(logging.WARNING, logger="app.db.slow_query"), isolated_sqlite_engine.connect() as conn:
        conn.execute(text("SELECT 1"))

    slow_warnings = [r for r in caplog.records if "Slow query" in r.getMessage()]
    assert len(slow_warnings) >= 1, f"expected a slow-query log, got {[r.getMessage() for r in caplog.records]}"
    msg = slow_warnings[0].getMessage()
    assert "kind=SELECT" in msg
    assert "duration_ms=" in msg
    assert "params_hash=" in msg
    assert "statement=SELECT 1" in msg


def test_bound_parameters_are_hashed_not_logged(isolated_sqlite_engine, caplog, monkeypatch):
    """Raw bound parameter values must never appear in any log line."""
    monkeypatch.setenv("SLOW_QUERY_MS", "0")
    payload_value = "ExtremelySecretAPIKey_ffaa99"

    with caplog.at_level(logging.WARNING, logger="app.db.slow_query"), isolated_sqlite_engine.connect() as conn:
        # SQLite text binding: the value goes in as a bound parameter.
        conn.execute(text("SELECT :val"), {"val": payload_value})

    messages = [r.getMessage() for r in caplog.records]
    joined = "\n".join(messages)
    assert payload_value not in joined, f"raw parameter leaked into logs: {joined!r}"
    # And a hash *is* present.
    assert any("params_hash=" in m for m in messages)


def test_invalid_env_var_falls_back_to_default(isolated_sqlite_engine, caplog, monkeypatch):
    """SLOW_QUERY_MS=garbage must not break queries; threshold falls back."""
    monkeypatch.setenv("SLOW_QUERY_MS", "not-a-number")
    with caplog.at_level(logging.WARNING, logger="app.db.slow_query"), isolated_sqlite_engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        assert result.scalar() == 1


def test_listener_is_idempotent(isolated_sqlite_engine):
    """Calling install twice must be a no-op the second time."""
    # First install already happened in the fixture.
    install_slow_query_listener(isolated_sqlite_engine)
    install_slow_query_listener(isolated_sqlite_engine)
    # Metric must only advance by one per execution, not by 2/3 (which would
    # happen if duplicate listeners were attached).
    before = _histogram_count("SELECT")
    with isolated_sqlite_engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    after = _histogram_count("SELECT")
    assert after == before + 1


def test_remove_listener_detaches(isolated_sqlite_engine):
    remove_slow_query_listener(isolated_sqlite_engine)
    before = _histogram_count("SELECT")
    with isolated_sqlite_engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    after = _histogram_count("SELECT")
    # Listener removed → histogram must not advance.
    assert after == before


@pytest.mark.asyncio
async def test_listener_works_on_async_engine(isolated_async_sqlite_engine, caplog, monkeypatch):
    """AsyncEngine uses the same sync_engine event hooks under the hood."""
    monkeypatch.setenv("SLOW_QUERY_MS", "0")
    before = _histogram_count("SELECT")
    with caplog.at_level(logging.WARNING, logger="app.db.slow_query"):
        async with isolated_async_sqlite_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    after = _histogram_count("SELECT")
    assert after == before + 1
    slow_warnings = [r for r in caplog.records if "Slow query" in r.getMessage()]
    assert slow_warnings, "async engine should also emit slow-query warnings"
    await isolated_async_sqlite_engine.dispose()
