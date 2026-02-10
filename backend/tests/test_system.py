"""System endpoint tests."""

import pytest


@pytest.mark.asyncio
async def test_system_status(client):
    resp = await client.get("/api/system/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "cpu_percent" in data
    assert "memory" in data
    assert "disk" in data
    assert "total" in data["memory"]
    assert "percent" in data["disk"]
