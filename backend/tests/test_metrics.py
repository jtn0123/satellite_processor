"""Tests for Prometheus metrics endpoint and middleware."""

import pytest


@pytest.mark.asyncio
async def test_metrics_endpoint(client):
    """GET /api/metrics returns Prometheus text format."""
    resp = await client.get("/api/metrics")
    assert resp.status_code == 200
    text = resp.text
    # Should contain standard Prometheus metric names
    assert "http_requests_total" in text or "# HELP" in text


@pytest.mark.asyncio
async def test_metrics_does_not_require_auth(client):
    """Metrics endpoint should be accessible without API key."""
    resp = await client.get("/api/metrics")
    assert resp.status_code == 200
