"""Preset endpoint tests."""

import pytest


@pytest.mark.asyncio
async def test_list_presets_empty(client):
    resp = await client.get("/api/presets")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_preset(client):
    resp = await client.post(
        "/api/presets",
        json={"name": "default", "params": {"crop": True}},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "default"


@pytest.mark.asyncio
async def test_create_duplicate_preset(client):
    await client.post("/api/presets", json={"name": "dup", "params": {}})
    resp = await client.post("/api/presets", json={"name": "dup", "params": {}})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_preset(client):
    await client.post("/api/presets", json={"name": "todel", "params": {}})
    resp = await client.delete("/api/presets/todel")
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True


@pytest.mark.asyncio
async def test_delete_nonexistent_preset(client):
    resp = await client.delete("/api/presets/nope")
    assert resp.status_code == 404
