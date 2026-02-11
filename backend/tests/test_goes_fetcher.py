"""Tests for GOES fetcher service."""
from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from app.services.goes_fetcher import (
    SATELLITE_BUCKETS,
    SECTOR_PRODUCTS,
    VALID_BANDS,
    _build_s3_prefix,
    _matches_sector_and_band,
    _parse_scan_time,
    list_available,
    validate_params,
)


class TestValidateParams:
    def test_valid_params(self):
        validate_params("GOES-16", "FullDisk", "C02")

    def test_invalid_satellite(self):
        with pytest.raises(ValueError, match="Unknown satellite"):
            validate_params("GOES-99", "FullDisk", "C02")

    def test_invalid_sector(self):
        with pytest.raises(ValueError, match="Unknown sector"):
            validate_params("GOES-16", "BadSector", "C02")

    def test_invalid_band(self):
        with pytest.raises(ValueError, match="Unknown band"):
            validate_params("GOES-16", "FullDisk", "C99")

    def test_all_satellites_valid(self):
        for sat in SATELLITE_BUCKETS:
            validate_params(sat, "FullDisk", "C01")

    def test_all_sectors_valid(self):
        for sector in SECTOR_PRODUCTS:
            validate_params("GOES-16", sector, "C01")

    def test_all_bands_valid(self):
        for band in VALID_BANDS:
            validate_params("GOES-16", "FullDisk", band)


class TestBuildS3Prefix:
    def test_fulldisk_prefix(self):
        dt = datetime(2024, 3, 15, 14, 30)
        prefix = _build_s3_prefix("GOES-16", "FullDisk", "C02", dt)
        assert prefix == "ABI-L2-CMIPF/2024/075/14/"

    def test_conus_prefix(self):
        dt = datetime(2024, 1, 1, 0, 0)
        prefix = _build_s3_prefix("GOES-16", "CONUS", "C02", dt)
        assert prefix == "ABI-L2-CMIPC/2024/001/00/"


class TestParseScanTime:
    def test_valid_filename(self):
        key = "ABI-L2-CMIPF/2024/075/14/OR_ABI-L2-CMIPF-M6C02_G16_s20240751430210_e20240751439518_c20240751439580.nc"
        result = _parse_scan_time(key)
        assert result is not None
        assert result.year == 2024
        assert result.hour == 14
        assert result.minute == 30
        assert result.second == 21

    def test_no_match(self):
        assert _parse_scan_time("random_file.nc") is None


class TestMatchesSectorAndBand:
    def test_fulldisk_c02(self):
        key = "OR_ABI-L2-CMIPF-M6C02_G16_s20240751430210.nc"
        assert _matches_sector_and_band(key, "FullDisk", "C02") is True

    def test_wrong_band(self):
        key = "OR_ABI-L2-CMIPF-M6C13_G16_s20240751430210.nc"
        assert _matches_sector_and_band(key, "FullDisk", "C02") is False


class TestListAvailable:
    @patch("app.services.goes_fetcher._get_s3_client")
    def test_list_returns_results(self, mock_s3_client):
        mock_client = MagicMock()
        mock_s3_client.return_value = mock_client

        mock_paginator = MagicMock()
        mock_client.get_paginator.return_value = mock_paginator
        mock_paginator.paginate.return_value = [
            {
                "Contents": [
                    {
                        "Key": "ABI-L2-CMIPF/2024/075/14/OR_ABI-L2-CMIPF-M6C02_G16_s20240751430210_e20240751439518_c20240751439580.nc",
                        "Size": 1000000,
                    }
                ]
            }
        ]

        results = list_available(
            "GOES-16", "FullDisk", "C02",
            datetime(2024, 3, 15, 14, 0),
            datetime(2024, 3, 15, 14, 59),
        )
        assert len(results) == 1
        assert results[0]["scan_time"].hour == 14

    @patch("app.services.goes_fetcher._get_s3_client")
    def test_list_empty_bucket(self, mock_s3_client):
        mock_client = MagicMock()
        mock_s3_client.return_value = mock_client
        mock_paginator = MagicMock()
        mock_client.get_paginator.return_value = mock_paginator
        mock_paginator.paginate.return_value = [{"Contents": []}]

        results = list_available(
            "GOES-16", "FullDisk", "C02",
            datetime(2024, 3, 15, 14, 0),
            datetime(2024, 3, 15, 14, 59),
        )
        assert len(results) == 0
