"""Additional scheduling router tests — fetch presets, schedules, cleanup rules."""

import pytest


@pytest.mark.asyncio
async def test_fetch_preset_crud(client):
    # Create
    resp = await client.post("/api/goes/fetch-presets", json={
        "name": "Morning CONUS", "satellite": "GOES-16", "sector": "CONUS",
        "band": "C02", "description": "Morning fetch",
    })
    assert resp.status_code == 200
    pid = resp.json()["id"]
    assert resp.json()["name"] == "Morning CONUS"

    # List
    resp = await client.get("/api/goes/fetch-presets")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # Update
    resp = await client.put(f"/api/goes/fetch-presets/{pid}", json={"name": "Evening"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Evening"

    # Delete
    resp = await client.delete(f"/api/goes/fetch-presets/{pid}")
    assert resp.status_code == 200
    assert resp.json()["deleted"] == pid


@pytest.mark.asyncio
async def test_update_nonexistent_fetch_preset(client):
    resp = await client.put("/api/goes/fetch-presets/fake", json={"name": "x"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_fetch_preset(client):
    resp = await client.delete("/api/goes/fetch-presets/fake")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_fetch_preset_partial_update(client):
    resp = await client.post("/api/goes/fetch-presets", json={
        "name": "Test", "satellite": "GOES-16", "sector": "CONUS", "band": "C02",
    })
    pid = resp.json()["id"]

    resp = await client.put(f"/api/goes/fetch-presets/{pid}", json={"band": "C13"})
    assert resp.status_code == 200
    assert resp.json()["band"] == "C13"
    assert resp.json()["satellite"] == "GOES-16"  # unchanged


@pytest.mark.asyncio
async def test_fetch_presets_list_empty(client):
    resp = await client.get("/api/goes/fetch-presets")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_multiple_fetch_presets(client):
    for i in range(3):
        resp = await client.post("/api/goes/fetch-presets", json={
            "name": f"Preset {i}", "satellite": "GOES-16", "sector": "CONUS", "band": "C02",
        })
        assert resp.status_code == 200

    resp = await client.get("/api/goes/fetch-presets")
    assert len(resp.json()) == 3
