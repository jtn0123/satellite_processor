"""Tests for stats and download endpoints."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_stats_empty(client):
    resp = await client.get("/api/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_images"] == 0
    assert data["total_jobs"] == 0
    assert data["active_jobs"] == 0
    assert "storage" in data


@pytest.mark.asyncio
async def test_presets_crud(client):
    # Create
    resp = await client.post("/api/presets", json={"name": "test1", "params": {"fps": 30}})
    assert resp.status_code == 200
    assert resp.json()["name"] == "test1"

    # List
    resp = await client.get("/api/presets")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # Rename
    resp = await client.patch("/api/presets/test1", json={"name": "renamed"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "renamed"

    # Delete
    resp = await client.delete("/api/presets/renamed")
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True


@pytest.mark.asyncio
async def test_preset_duplicate(client):
    await client.post("/api/presets", json={"name": "dup", "params": {"a": 1}})
    resp = await client.post("/api/presets", json={"name": "dup", "params": {"a": 2}})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_download_not_found(client):
    resp = await client.get("/api/jobs/nonexistent/download")
    assert resp.status_code == 404
