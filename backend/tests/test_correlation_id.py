"""Comprehensive tests for correlation ID middleware — header propagation, generation, validation."""

import uuid

import pytest
from app.middleware.correlation import (
    REQUEST_ID_PATTERN,
    CorrelationMiddleware,
    RequestIdFilter,
    request_id_ctx,
)

pytestmark = pytest.mark.anyio


# ── Pattern validation ────────────────────────────────────────────


class TestRequestIdPattern:
    """Tests for the REQUEST_ID_PATTERN regex."""

    def test_accepts_hex_string(self):
        assert REQUEST_ID_PATTERN.match("abc123def")

    def test_accepts_uuid(self):
        assert REQUEST_ID_PATTERN.match(str(uuid.uuid4()))

    def test_accepts_dashes(self):
        assert REQUEST_ID_PATTERN.match("req-123-abc")

    def test_accepts_underscores(self):
        assert REQUEST_ID_PATTERN.match("req_123_abc")

    def test_rejects_spaces(self):
        assert not REQUEST_ID_PATTERN.match("has space")

    def test_rejects_special_chars(self):
        assert not REQUEST_ID_PATTERN.match("id@#$%")

    def test_rejects_empty(self):
        assert not REQUEST_ID_PATTERN.match("")

    def test_max_length_64_accepted(self):
        assert REQUEST_ID_PATTERN.match("a" * 64)

    def test_over_64_rejected(self):
        assert not REQUEST_ID_PATTERN.match("a" * 65)

    def test_accepts_alphanumeric(self):
        assert REQUEST_ID_PATTERN.match("ABCDEFghijklmnop0123456789")


# ── Integration through HTTP client ──────────────────────────────


async def test_auto_generated_id_format(client):
    """Auto-generated IDs should be 8-char hex."""
    resp = await client.get("/api/health")
    rid = resp.headers["x-request-id"]
    assert len(rid) == 8
    int(rid, 16)  # should be valid hex


async def test_custom_id_propagated(client):
    """Custom X-Request-ID should pass through unchanged."""
    resp = await client.get("/api/health", headers={"X-Request-ID": "my-trace-42"})
    assert resp.headers["x-request-id"] == "my-trace-42"


async def test_invalid_id_replaced(client):
    """Invalid chars in X-Request-ID should cause generation of a new one."""
    resp = await client.get("/api/health", headers={"X-Request-ID": "bad id!@#"})
    rid = resp.headers["x-request-id"]
    assert rid != "bad id!@#"
    assert len(rid) == 8


async def test_too_long_id_replaced(client):
    """X-Request-ID longer than 64 chars should be replaced."""
    long_id = "x" * 100
    resp = await client.get("/api/health", headers={"X-Request-ID": long_id})
    rid = resp.headers["x-request-id"]
    assert rid != long_id
    assert len(rid) == 8


async def test_id_present_on_error_response(client):
    """Correlation ID should appear even on 404 responses."""
    resp = await client.get("/api/nonexistent-path-xyz")
    assert "x-request-id" in resp.headers


async def test_multiple_requests_get_unique_ids(client):
    """Each request should get a distinct auto-generated ID."""
    ids = set()
    for _ in range(10):
        resp = await client.get("/api/health")
        ids.add(resp.headers["x-request-id"])
    assert len(ids) == 10


# ── RequestIdFilter ───────────────────────────────────────────────


class TestRequestIdFilter:
    """Tests for the logging filter that injects request_id."""

    def test_filter_returns_true(self):
        f = RequestIdFilter()
        import logging
        record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
        assert f.filter(record) is True

    def test_filter_sets_request_id(self):
        f = RequestIdFilter()
        import logging
        record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
        token = request_id_ctx.set("test-rid")
        try:
            f.filter(record)
            assert record.request_id == "test-rid"  # type: ignore[attr-defined]
        finally:
            request_id_ctx.reset(token)

    def test_filter_empty_when_no_context(self):
        f = RequestIdFilter()
        import logging
        record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
        f.filter(record)
        assert record.request_id == ""  # type: ignore[attr-defined]


# ── Pure ASGI middleware unit tests ───────────────────────────────


async def test_middleware_skips_non_http():
    """Non-HTTP scopes (e.g. websocket) should pass through without modification."""
    called = False

    async def inner(scope, receive, send):
        nonlocal called
        called = True

    mw = CorrelationMiddleware(inner)
    await mw({"type": "websocket"}, None, None)
    assert called
