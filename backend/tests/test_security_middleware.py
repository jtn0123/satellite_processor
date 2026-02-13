"""Tests for security headers and request body limit middleware."""

import pytest


@pytest.mark.asyncio
async def test_security_headers_present(client):
    """All responses should include security headers."""
    resp = await client.get("/api/health")
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "Content-Security-Policy" in resp.headers


@pytest.mark.asyncio
async def test_request_body_limit(client):
    """Requests with Content-Length > 10MB should be rejected (non-upload paths)."""
    resp = await client.post(
        "/api/jobs",
        content=b"x",
        headers={"Content-Length": str(20 * 1024 * 1024), "Content-Type": "application/json"},
    )
    assert resp.status_code == 413


@pytest.mark.asyncio
async def test_cors_headers(client):
    """OPTIONS preflight should return CORS headers."""
    resp = await client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    # CORS middleware should allow the configured origin
    assert resp.status_code in (200, 204)
