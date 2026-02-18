"""Tests for correlation ID middleware."""

import pytest

pytestmark = pytest.mark.anyio


async def test_response_has_request_id(client):
    """Every response should include X-Request-ID header."""
    resp = await client.get("/api/health")
    assert "x-request-id" in resp.headers
    assert len(resp.headers["x-request-id"]) >= 8


async def test_request_id_echoed(client):
    """If client sends X-Request-ID, it should be echoed back."""
    resp = await client.get("/api/health", headers={"X-Request-ID": "test-123"})
    assert resp.headers["x-request-id"] == "test-123"


async def test_generated_id_is_unique(client):
    """Auto-generated IDs should differ between requests."""
    r1 = await client.get("/api/health")
    r2 = await client.get("/api/health")
    assert r1.headers["x-request-id"] != r2.headers["x-request-id"]


async def test_empty_request_id_generates_new(client):
    """Empty X-Request-ID header should trigger generation of a new ID."""
    resp = await client.get("/api/health", headers={"X-Request-ID": ""})
    rid = resp.headers["x-request-id"]
    assert len(rid) >= 8


async def test_whitespace_request_id_generates_new(client):
    """Whitespace-only X-Request-ID should trigger generation of a new ID."""
    resp = await client.get("/api/health", headers={"X-Request-ID": "   "})
    rid = resp.headers["x-request-id"]
    assert rid.strip() != ""
    assert len(rid) >= 8
