"""Health endpoint tests."""

import pytest


@pytest.mark.asyncio
async def test_health_basic(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_health_detailed(client):
    resp = await client.get("/api/health/detailed")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("healthy", "degraded", "unhealthy")
    assert "checks" in data
    assert "version" in data
    # Should have all check categories
    for key in ("database", "redis", "disk", "storage"):
        assert key in data["checks"]
        assert "status" in data["checks"][key]
