"""Tests for the default fetch preset seed endpoint."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
class TestSeedDefaults:
    async def test_seed_creates_default_presets(self, client):
        """POST /api/satellite/fetch-presets/seed-defaults creates Himawari preset."""
        resp = await client.post("/api/satellite/fetch-presets/seed-defaults")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert "Himawari FLDK True Color" in data["seeded"]

    async def test_seed_idempotent(self, client):
        """Calling seed-defaults twice doesn't create duplicates."""
        resp1 = await client.post("/api/satellite/fetch-presets/seed-defaults")
        assert resp1.status_code == 200
        assert resp1.json()["total"] >= 1

        resp2 = await client.post("/api/satellite/fetch-presets/seed-defaults")
        assert resp2.status_code == 200
        assert resp2.json()["total"] == 0
        assert resp2.json()["seeded"] == []

    async def test_seed_preset_appears_in_list(self, client):
        """Seeded preset shows up in fetch-presets list."""
        await client.post("/api/satellite/fetch-presets/seed-defaults")
        resp = await client.get("/api/satellite/fetch-presets")
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "Himawari FLDK True Color" in names

    async def test_seed_preset_has_correct_params(self, client):
        """Seeded Himawari preset has correct satellite/sector/band."""
        await client.post("/api/satellite/fetch-presets/seed-defaults")
        resp = await client.get("/api/satellite/fetch-presets")
        preset = next(p for p in resp.json() if p["name"] == "Himawari FLDK True Color")
        assert preset["satellite"] == "Himawari-9"
        assert preset["sector"] == "FLDK"
        assert preset["band"] == "TrueColor"
        assert preset["description"] == "Full disk true color composite"
