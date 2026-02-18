"""Extended tests for correlation ID middleware — header propagation, generation, validation, max length."""

import pytest
from app.middleware.correlation import REQUEST_ID_PATTERN, CorrelationMiddleware, RequestIdFilter, request_id_ctx


pytestmark = pytest.mark.anyio


# ── Header propagation ──────────────────────────────────────────────

async def test_custom_request_id_propagated(client):
    """Custom X-Request-ID is returned in response."""
    resp = await client.get("/api/health", headers={"X-Request-ID": "my-custom-id-42"})
    assert resp.headers["x-request-id"] == "my-custom-id-42"


async def test_alphanumeric_id_accepted(client):
    """Pure alphanumeric IDs pass validation."""
    resp = await client.get("/api/health", headers={"X-Request-ID": "abc123"})
    assert resp.headers["x-request-id"] == "abc123"


async def test_dashes_and_underscores_accepted(client):
    """IDs with dashes and underscores pass validation."""
    resp = await client.get("/api/health", headers={"X-Request-ID": "req_id-123"})
    assert resp.headers["x-request-id"] == "req_id-123"


async def test_max_length_64_accepted(client):
    """64-character ID (max) should be accepted."""
    long_id = "a" * 64
    resp = await client.get("/api/health", headers={"X-Request-ID": long_id})
    assert resp.headers["x-request-id"] == long_id


async def test_over_max_length_rejected(client):
    """65-character ID exceeds max and should be replaced."""
    too_long = "a" * 65
    resp = await client.get("/api/health", headers={"X-Request-ID": too_long})
    assert resp.headers["x-request-id"] != too_long
    assert len(resp.headers["x-request-id"]) == 8  # auto-generated


async def test_special_chars_rejected(client):
    """IDs with special characters are rejected and replaced."""
    resp = await client.get("/api/health", headers={"X-Request-ID": "id with spaces"})
    assert resp.headers["x-request-id"] != "id with spaces"


async def test_injection_attempt_rejected(client):
    """IDs with injection-like patterns are rejected."""
    resp = await client.get("/api/health", headers={"X-Request-ID": "id\r\nX-Evil: yes"})
    rid = resp.headers["x-request-id"]
    assert "\r" not in rid and "\n" not in rid


def test_pattern_matches_word_chars_including_unicode():
    """\\w in Python regex matches unicode word chars — this is expected behavior."""
    # The pattern uses \\w which includes unicode letters per Python regex spec
    assert REQUEST_ID_PATTERN.match("café")  # \\w matches accented chars
    # But NUL bytes and control chars are still rejected
    assert not REQUEST_ID_PATTERN.match("id\x00bad")


# ── Auto-generation ─────────────────────────────────────────────────

async def test_no_header_generates_id(client):
    """Missing header should auto-generate an 8-char hex ID."""
    resp = await client.get("/api/health")
    rid = resp.headers["x-request-id"]
    assert len(rid) == 8
    assert all(c in "0123456789abcdef" for c in rid)


async def test_generated_ids_unique_across_requests(client):
    """Multiple requests should get unique IDs."""
    ids = set()
    for _ in range(10):
        resp = await client.get("/api/health")
        ids.add(resp.headers["x-request-id"])
    assert len(ids) == 10


# ── Pattern validation unit tests ───────────────────────────────────

def test_pattern_accepts_valid():
    assert REQUEST_ID_PATTERN.match("abc-123_XYZ")
    assert REQUEST_ID_PATTERN.match("a")
    assert REQUEST_ID_PATTERN.match("x" * 64)


def test_pattern_rejects_invalid():
    assert not REQUEST_ID_PATTERN.match("")
    assert not REQUEST_ID_PATTERN.match("x" * 65)
    assert not REQUEST_ID_PATTERN.match("has space")
    assert not REQUEST_ID_PATTERN.match("has/slash")


# ── RequestIdFilter ─────────────────────────────────────────────────

def test_request_id_filter_default():
    """Filter adds empty request_id when no context is set."""
    import logging
    f = RequestIdFilter()
    record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
    assert f.filter(record) is True
    assert record.request_id == ""  # type: ignore[attr-defined]


def test_request_id_filter_with_context():
    """Filter picks up request_id from context var."""
    import logging
    token = request_id_ctx.set("ctx-id-99")
    try:
        f = RequestIdFilter()
        record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
        f.filter(record)
        assert record.request_id == "ctx-id-99"  # type: ignore[attr-defined]
    finally:
        request_id_ctx.reset(token)


# ── Middleware skips non-HTTP scopes ────────────────────────────────

async def test_websocket_scope_passthrough():
    """WebSocket scopes should pass through without correlation header injection."""
    calls = []

    async def fake_app(scope, receive, send):
        calls.append(scope["type"])

    mw = CorrelationMiddleware(fake_app)
    await mw({"type": "websocket"}, None, None)
    assert calls == ["websocket"]
