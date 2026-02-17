"""Tests for dynamic availability and preview thumbnails endpoints."""

from unittest.mock import patch

import pytest


@pytest.mark.asyncio
async def test_catalog_available_returns_sectors(client):
    """Catalog available endpoint returns available sectors."""
    mock_result = {
        "satellite": "GOES-19",
        "available_sectors": ["CONUS", "FullDisk"],
        "checked_at": "2026-01-01T00:00:00+00:00",
    }
    with patch("app.routers.goes.get_cached", return_value=mock_result):
        resp = await client.get("/api/goes/catalog/available", params={"satellite": "GOES-19"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["satellite"] == "GOES-19"
        assert "available_sectors" in data
        assert isinstance(data["available_sectors"], list)
        assert "checked_at" in data


@pytest.mark.asyncio
async def test_catalog_available_default_satellite(client):
    """Catalog available defaults to GOES-19."""
    mock_result = {
        "satellite": "GOES-19",
        "available_sectors": [],
        "checked_at": "2026-01-01T00:00:00+00:00",
    }
    with patch("app.routers.goes.get_cached", return_value=mock_result):
        resp = await client.get("/api/goes/catalog/available")
        assert resp.status_code == 200
        assert resp.json()["satellite"] == "GOES-19"


@pytest.mark.asyncio
async def test_band_samples_returns_thumbnails(client):
    """Band samples endpoint returns thumbnail map."""
    mock_result = {
        "satellite": "GOES-19",
        "sector": "CONUS",
        "thumbnails": {
            "C01": None,
            "C02": "/api/goes/frames/abc/thumbnail",
            "C03": None,
        },
    }
    with patch("app.routers.goes.get_cached", return_value=mock_result):
        resp = await client.get(
            "/api/goes/preview/band-samples",
            params={"satellite": "GOES-19", "sector": "CONUS"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["satellite"] == "GOES-19"
        assert data["sector"] == "CONUS"
        assert "thumbnails" in data
        assert data["thumbnails"]["C02"] == "/api/goes/frames/abc/thumbnail"


@pytest.mark.asyncio
async def test_export_frames_with_collection_id(client):
    """Export endpoint accepts collection_id filter without errors."""
    resp = await client.get(
        "/api/goes/frames/export",
        params={"format": "json", "collection_id": "00000000-0000-0000-0000-000000000000", "limit": 10},
    )
    # 200 with empty results or 404 if not found — just verify no 500/422
    assert resp.status_code in (200, 404)


@pytest.mark.asyncio
async def test_export_frames_with_satellite_filter(client):
    """Export endpoint accepts satellite filter without errors."""
    resp = await client.get(
        "/api/goes/frames/export",
        params={"format": "csv", "satellite": "GOES-19", "limit": 10},
    )
    assert resp.status_code in (200, 404)


@pytest.mark.asyncio
async def test_catalog_available_service():
    """Test catalog_available service function directly."""
    from app.services.catalog import catalog_available

    mock_s3 = type("MockS3", (), {
        "list_objects_v2": lambda self, **kw: {"Contents": [{"Key": "test"}]},
    })()

    with patch("app.services.catalog._get_s3_client", return_value=mock_s3):
        result = catalog_available("GOES-19")
        assert result["satellite"] == "GOES-19"
        assert isinstance(result["available_sectors"], list)
        assert len(result["available_sectors"]) > 0
        assert "checked_at" in result
