"""Tests for GOES catalog and download endpoints."""

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
from app.services.catalog import (
    _is_newer_scan,
    _normalize_date,
    catalog_list,
)

pytestmark = pytest.mark.anyio


# ── catalog_latest image_url construction ─────────────────────────


class TestCatalogLatestImageUrl:
    """Verify image_url is correctly constructed from bucket + key."""

    @patch("app.services.catalog._get_s3_client")
    def test_image_url_has_correct_s3_format(self, mock_s3):
        from app.services.catalog import catalog_latest

        paginator = MagicMock()
        key = "ABI-L1b-RadC/2024/166/12/OR_ABI-L1b-RadC-M6C02_G19_s20241661200.nc"
        paginator.paginate.return_value = [
            {"Contents": [{"Key": key, "Size": 5000}]}
        ]
        mock_s3.return_value.get_paginator.return_value = paginator

        with patch("app.services.catalog._matches_sector_and_band", return_value=True), \
             patch("app.services.catalog._parse_scan_time", return_value=datetime(2024, 6, 14, 12, 0, tzinfo=UTC)):
            result = catalog_latest("GOES-19", "CONUS", "C02")

        assert result is not None
        assert "image_url" in result
        assert result["image_url"] == f"https://noaa-goes19.s3.amazonaws.com/{key}"

    @patch("app.services.catalog._get_s3_client")
    def test_image_url_uses_correct_bucket_per_satellite(self, mock_s3):
        from app.services.catalog import catalog_latest

        paginator = MagicMock()
        key = "ABI-L1b-RadC/2024/166/12/test.nc"
        paginator.paginate.return_value = [
            {"Contents": [{"Key": key, "Size": 3000}]}
        ]
        mock_s3.return_value.get_paginator.return_value = paginator

        with patch("app.services.catalog._matches_sector_and_band", return_value=True), \
             patch("app.services.catalog._parse_scan_time", return_value=datetime(2024, 6, 14, 12, 0, tzinfo=UTC)):
            result = catalog_latest("GOES-16", "CONUS", "C02")

        assert result is not None
        assert result["image_url"].startswith("https://noaa-goes16.s3.amazonaws.com/")

    @patch("app.services.catalog._get_s3_client")
    def test_no_image_url_when_no_data(self, mock_s3):
        from app.services.catalog import catalog_latest

        paginator = MagicMock()
        paginator.paginate.return_value = [{"Contents": []}]
        mock_s3.return_value.get_paginator.return_value = paginator

        result = catalog_latest("GOES-19", "CONUS", "C02")
        assert result is None

    @patch("app.services.catalog._get_s3_client")
    def test_image_url_includes_satellite_sector_band(self, mock_s3):
        from app.services.catalog import catalog_latest

        paginator = MagicMock()
        key = "ABI-L1b-RadF/2024/166/12/test.nc"
        paginator.paginate.return_value = [
            {"Contents": [{"Key": key, "Size": 8000}]}
        ]
        mock_s3.return_value.get_paginator.return_value = paginator

        with patch("app.services.catalog._matches_sector_and_band", return_value=True), \
             patch("app.services.catalog._parse_scan_time", return_value=datetime(2024, 6, 14, 12, 0, tzinfo=UTC)):
            result = catalog_latest("GOES-19", "FullDisk", "C13")

        assert result is not None
        assert result["satellite"] == "GOES-19"
        assert result["sector"] == "FullDisk"
        assert result["band"] == "C13"
        assert "image_url" in result


# ── catalog_latest endpoint image_url ─────────────────────────────


@pytest.mark.asyncio
async def test_catalog_latest_returns_image_url(client):
    """GET /api/goes/catalog/latest returns image_url with S3 URL."""
    mock_result = {
        "scan_time": "2025-01-01T12:00:00+00:00",
        "size": 5000,
        "key": "ABI-L1b-RadC/2025/001/12/test.nc",
        "satellite": "GOES-19",
        "sector": "CONUS",
        "band": "C02",
        "image_url": "https://noaa-goes19.s3.amazonaws.com/ABI-L1b-RadC/2025/001/12/test.nc",
    }
    with patch("app.routers.goes.get_cached", return_value=mock_result):
        resp = await client.get("/api/goes/catalog/latest", params={
            "satellite": "GOES-19", "sector": "CONUS", "band": "C02",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "image_url" in data
        assert data["image_url"].startswith("https://noaa-goes19.s3.amazonaws.com/")


# ── _normalize_date ───────────────────────────────────────────────


class TestNormalizeDate:
    def test_none_returns_now(self):
        result = _normalize_date(None)
        assert result.tzinfo is not None
        assert (datetime.now(UTC) - result).total_seconds() < 2

    def test_naive_gets_utc(self):
        naive = datetime(2024, 6, 15, 12, 0, 0)
        result = _normalize_date(naive)
        assert result.tzinfo == UTC

    def test_aware_preserved(self):
        aware = datetime(2024, 6, 15, 12, 0, 0, tzinfo=UTC)
        result = _normalize_date(aware)
        assert result == aware


# ── _is_newer_scan ────────────────────────────────────────────────


class TestIsNewerScan:
    def test_newer_than_none(self):
        assert _is_newer_scan(datetime(2024, 1, 1, tzinfo=UTC), None) is True

    def test_newer_than_existing(self):
        existing = {"scan_time": "2024-01-01T00:00:00+00:00"}
        assert _is_newer_scan(datetime(2024, 1, 2, tzinfo=UTC), existing) is True

    def test_older_than_existing(self):
        existing = {"scan_time": "2024-01-02T00:00:00+00:00"}
        assert _is_newer_scan(datetime(2024, 1, 1, tzinfo=UTC), existing) is False


# ── catalog_list ──────────────────────────────────────────────────


class TestCatalogList:
    def test_invalid_satellite_raises(self):
        with pytest.raises(Exception):  # noqa: B017
            catalog_list("GOES-99", "CONUS", "C02")

    def test_invalid_band_raises(self):
        with pytest.raises(Exception):  # noqa: B017
            catalog_list("GOES-19", "CONUS", "C99")

    @patch("app.services.catalog._get_s3_client")
    def test_returns_sorted_results(self, mock_s3):
        paginator = MagicMock()
        paginator.paginate.return_value = [
            {"Contents": [
                {"Key": "ABI-L1b-RadC/2024/166/12/OR_ABI-L1b-RadC-M6C02_G19_s20241661200_e20241661205.nc",
                 "Size": 4000},
            ]}
        ]
        mock_s3.return_value.get_paginator.return_value = paginator

        with patch("app.services.catalog._matches_sector_and_band", return_value=True), \
             patch("app.services.catalog._parse_scan_time", return_value=datetime(2024, 6, 14, 12, 0, tzinfo=UTC)):
            result = catalog_list("GOES-19", "CONUS", "C02", datetime(2024, 6, 14, tzinfo=UTC))

        assert isinstance(result, list)


# ── catalog endpoints via HTTP ────────────────────────────────────


async def test_products_endpoint(client):
    """GET /api/goes/products returns satellite/sector/band info."""
    resp = await client.get("/api/goes/products")
    assert resp.status_code == 200
    data = resp.json()
    assert "satellites" in data
    assert "sectors" in data
    assert "bands" in data
    assert len(data["bands"]) == 16


async def test_products_has_default_satellite(client):
    """Products response should include default_satellite."""
    resp = await client.get("/api/goes/products")
    data = resp.json()
    assert data["default_satellite"] == "GOES-19"


async def test_composite_recipes_endpoint(client):
    """GET /api/goes/composite-recipes returns valid recipes."""
    resp = await client.get("/api/goes/composite-recipes")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 2
    recipe_ids = [r["id"] for r in data]
    assert "true_color" in recipe_ids


async def test_latest_frame_404(client):
    """GET /api/goes/latest with no data returns 404."""
    resp = await client.get("/api/goes/latest?satellite=GOES-19&sector=CONUS&band=C02")
    assert resp.status_code == 404


async def test_band_availability_empty(client):
    """GET /api/goes/band-availability with no data returns empty counts."""
    resp = await client.get("/api/goes/band-availability?satellite=GOES-19&sector=CONUS")
    assert resp.status_code == 200
    data = resp.json()
    assert "counts" in data
    assert data["counts"] == {}
