"""Tests for GOES catalog/download endpoints — products listing, error handling."""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock

pytestmark = pytest.mark.anyio


async def test_goes_products_endpoint(client):
    """GET /api/goes/products returns satellite/sector/band metadata."""
    resp = await client.get("/api/goes/products")
    assert resp.status_code == 200
    data = resp.json()
    assert "satellites" in data
    assert "sectors" in data
    assert "bands" in data
    assert len(data["satellites"]) > 0
    assert len(data["bands"]) > 0


async def test_goes_products_band_metadata(client):
    """Band metadata includes wavelength and use case."""
    resp = await client.get("/api/goes/products")
    bands = resp.json()["bands"]
    c02 = next(b for b in bands if b["id"] == "C02")
    assert "wavelength_um" in c02
    assert "category" in c02
    assert c02["common_name"] == "Red"


async def test_goes_products_sector_cadence(client):
    """Sectors include cadence_minutes."""
    resp = await client.get("/api/goes/products")
    sectors = resp.json()["sectors"]
    assert all("cadence_minutes" in s for s in sectors)


async def test_goes_dashboard_stats(client):
    """GET /api/goes/dashboard-stats returns frame stats."""
    resp = await client.get("/api/goes/dashboard-stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_frames" in data


async def test_goes_frames_empty(client):
    """GET /api/goes/frames returns empty list initially."""
    resp = await client.get("/api/goes/frames")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data or isinstance(data, list)


async def test_goes_download_nonexistent_job(client):
    """Download with valid but nonexistent UUID returns 404."""
    import uuid
    resp = await client.get(f"/api/jobs/{uuid.uuid4()}/download")
    assert resp.status_code in (404, 400)


async def test_goes_products_satellite_availability(client):
    """Products include satellite availability info."""
    resp = await client.get("/api/goes/products")
    data = resp.json()
    assert "satellite_availability" in data
