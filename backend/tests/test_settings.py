"""Settings endpoint tests."""

import pytest


@pytest.mark.asyncio
async def test_get_settings(client):
    resp = await client.get("/api/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert "default_crop" in data
    assert "video_fps" in data


@pytest.mark.asyncio
async def test_update_settings(client):
    resp = await client.put("/api/settings", json={"video_fps": 30})
    assert resp.status_code == 200
    assert resp.json()["video_fps"] == 30


@pytest.mark.asyncio
async def test_settings_persist(client):
    await client.put("/api/settings", json={"video_fps": 60})
    resp = await client.get("/api/settings")
    assert resp.json()["video_fps"] == 60
