"""Tests for detailed health endpoint."""

import pytest

pytestmark = pytest.mark.anyio


async def test_health_basic(client):
    """Basic health endpoint returns ok."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "degraded")


async def test_health_detailed(client):
    """Detailed health check returns all expected check sections."""
    resp = await client.get("/api/health/detailed")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "checks" in data
    checks = data["checks"]
    assert "database" in checks
    assert "redis" in checks
    assert "disk" in checks
    assert "storage" in checks
    assert "worker" in checks
    # Each check should have a status field
    for name, check in checks.items():
        assert "status" in check, f"Check '{name}' missing status field"


async def test_health_detailed_has_version(client):
    """Detailed health should include version info."""
    resp = await client.get("/api/health/detailed")
    assert resp.status_code == 200
    data = resp.json()
    assert "version" in data
    assert "commit" in data
