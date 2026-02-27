"""Tests for catalog API, enhanced products, and fetch-composite endpoints."""

from unittest.mock import MagicMock, patch

import pytest
from app.services.catalog import build_cdn_urls


@pytest.mark.asyncio
async def test_products_enhanced(client):
    """Products endpoint returns cadence and band metadata."""
    resp = await client.get("/api/goes/products")
    assert resp.status_code == 200
    data = resp.json()
    # Check sectors have cadence
    sectors = data["sectors"]
    assert len(sectors) >= 4
    conus = next(s for s in sectors if s["id"] == "CONUS")
    assert conus["cadence_minutes"] == 5
    assert conus["typical_file_size_kb"] == 4000
    fd = next(s for s in sectors if s["id"] == "FullDisk")
    assert fd["cadence_minutes"] == 10
    # Check bands have metadata
    bands = data["bands"]
    c02 = next(b for b in bands if b["id"] == "C02")
    assert c02["wavelength_um"] == 0.64
    assert c02["common_name"] == "Red"
    assert c02["category"] == "visible"
    assert "use_case" in c02


@pytest.mark.asyncio
async def test_catalog_invalid_date(client):
    """Catalog rejects invalid date format."""
    resp = await client.get("/api/goes/catalog", params={"date": "not-a-date"})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_catalog_returns_list(client):
    """Catalog returns a list when S3 is mocked."""
    mock_result = [
        {"scan_time": "2025-01-01T12:00:00+00:00", "size": 12345, "key": "test/key.nc"},
    ]
    with patch("app.routers.goes.get_cached", return_value=mock_result):
        resp = await client.get("/api/goes/catalog", params={
            "satellite": "GOES-19", "sector": "CONUS", "band": "C02", "date": "2025-01-01",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1


@pytest.mark.asyncio
async def test_catalog_latest_not_found(client):
    """Catalog latest returns 404 when no recent frames."""
    with patch("app.routers.goes.get_cached", return_value=None):
        resp = await client.get("/api/goes/catalog/latest", params={
            "satellite": "GOES-19", "sector": "CONUS",
        })
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_fetch_composite_bad_recipe(client):
    """Fetch-composite rejects unknown recipe."""
    resp = await client.post("/api/goes/fetch-composite", json={
        "satellite": "GOES-19",
        "sector": "CONUS",
        "recipe": "invalid_recipe",
        "start_time": "2025-01-01T00:00:00Z",
        "end_time": "2025-01-01T01:00:00Z",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_fetch_composite_success(client):
    """Fetch-composite creates a job."""
    with patch("app.tasks.goes_tasks.fetch_composite_data") as mock_task:
        mock_result = MagicMock()
        mock_result.id = "test-task-id"
        mock_task.delay.return_value = mock_result

        resp = await client.post("/api/goes/fetch-composite", json={
            "satellite": "GOES-19",
            "sector": "CONUS",
            "recipe": "true_color",
            "start_time": "2025-01-01T00:00:00Z",
            "end_time": "2025-01-01T01:00:00Z",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "job_id" in data
        assert data["status"] == "pending"
        mock_task.delay.assert_called_once()


@pytest.mark.asyncio
async def test_fetch_composite_invalid_satellite(client):
    """Fetch-composite rejects invalid satellite."""
    resp = await client.post("/api/goes/fetch-composite", json={
        "satellite": "GOES-99",
        "sector": "CONUS",
        "recipe": "true_color",
        "start_time": "2025-01-01T00:00:00Z",
        "end_time": "2025-01-01T01:00:00Z",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_fetch_composite_end_before_start(client):
    """Fetch-composite rejects end_time before start_time."""
    resp = await client.post("/api/goes/fetch-composite", json={
        "satellite": "GOES-19",
        "sector": "CONUS",
        "recipe": "true_color",
        "start_time": "2025-01-01T02:00:00Z",
        "end_time": "2025-01-01T01:00:00Z",
    })
    assert resp.status_code == 422


# --- CDN URL construction tests ---


class TestBuildCdnUrls:
    """Tests for NOAA CDN URL construction (resolution-only filenames)."""

    def test_conus_basic(self):
        urls = build_cdn_urls("GOES-19", "CONUS", "C02")
        assert urls is not None
        assert urls["desktop"] == "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/02/2500x1500.jpg"
        assert urls["mobile"] == "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/02/1250x750.jpg"
        assert urls["thumbnail"] == "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/02/625x375.jpg"

    def test_fulldisk(self):
        urls = build_cdn_urls("GOES-19", "FullDisk", "C13")
        assert urls is not None
        assert urls["desktop"] == "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/13/1808x1808.jpg"

    def test_goes16(self):
        urls = build_cdn_urls("GOES-16", "CONUS", "C02")
        assert urls is not None
        assert "GOES16" in urls["desktop"]
        assert urls["desktop"].endswith("/2500x1500.jpg")

    def test_mesoscale_returns_none(self):
        """Mesoscale sectors should return None — CDN doesn't serve them."""
        urls = build_cdn_urls("GOES-18", "Mesoscale1", "C02")
        assert urls is None
        urls2 = build_cdn_urls("GOES-18", "Mesoscale2", "C02")
        assert urls2 is None

    def test_geocolor_band(self):
        """GEOCOLOR band should use 'GEOCOLOR' path, not strip prefix."""
        urls = build_cdn_urls("GOES-19", "CONUS", "GEOCOLOR")
        assert urls is not None
        assert urls["desktop"] == "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/GEOCOLOR/2500x1500.jpg"

    def test_unknown_sector_returns_none(self):
        urls = build_cdn_urls("GOES-19", "UnknownSector", "C02")
        assert urls is None

    def test_no_timestamp_in_url(self):
        """CDN URLs must NOT contain timestamps — just resolution filenames."""
        urls = build_cdn_urls("GOES-19", "CONUS", "C02")
        assert urls is not None
        for key, url in urls.items():
            # Filename should be just {resolution}.jpg
            filename = url.rsplit("/", 1)[-1]
            assert "_" not in filename, f"{key} URL has timestamp: {url}"
