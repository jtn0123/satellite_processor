"""Additional animation and crop preset tests."""

import pytest
from app.db.models import GoesFrame
from datetime import datetime


@pytest.mark.asyncio
async def test_crop_preset_crud(client):
    # Create
    resp = await client.post("/api/goes/crop-presets", json={
        "name": "Full HD", "x": 0, "y": 0, "width": 1920, "height": 1080,
    })
    assert resp.status_code == 200
    pid = resp.json()["id"]

    # List
    resp = await client.get("/api/goes/crop-presets")
    assert len(resp.json()) == 1

    # Update
    resp = await client.put(f"/api/goes/crop-presets/{pid}", json={"name": "4K"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "4K"

    # Delete
    resp = await client.delete(f"/api/goes/crop-presets/{pid}")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_crop_preset_duplicate_name(client):
    await client.post("/api/goes/crop-presets", json={
        "name": "dup", "x": 0, "y": 0, "width": 100, "height": 100,
    })
    resp = await client.post("/api/goes/crop-presets", json={
        "name": "dup", "x": 0, "y": 0, "width": 200, "height": 200,
    })
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_update_nonexistent_crop_preset(client):
    resp = await client.put("/api/goes/crop-presets/fake", json={"name": "x"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_crop_preset(client):
    resp = await client.delete("/api/goes/crop-presets/fake")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_animations_list_empty(client):
    resp = await client.get("/api/goes/animations")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_animation_detail_not_found(client):
    resp = await client.get("/api/goes/animations/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_animation(client):
    resp = await client.delete("/api/goes/animations/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_animation_no_frames(client):
    resp = await client.post("/api/goes/animations", json={
        "name": "test", "frame_ids": [], "fps": 24, "format": "mp4",
    })
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_animations_pagination(client):
    resp = await client.get("/api/goes/animations?page=1&limit=5")
    assert resp.status_code == 200
    assert resp.json()["limit"] == 5


@pytest.mark.asyncio
async def test_crop_preset_partial_update(client):
    resp = await client.post("/api/goes/crop-presets", json={
        "name": "test", "x": 0, "y": 0, "width": 100, "height": 100,
    })
    pid = resp.json()["id"]

    # Update only width
    resp = await client.put(f"/api/goes/crop-presets/{pid}", json={"width": 500})
    assert resp.status_code == 200
    assert resp.json()["width"] == 500
    assert resp.json()["height"] == 100  # unchanged
