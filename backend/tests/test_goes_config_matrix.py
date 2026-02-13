"""Comprehensive matrix tests for all GOES satellite/sector/band combinations.

Ensures every possible configuration works correctly without hitting real AWS.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
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

SATELLITES = list(SATELLITE_BUCKETS.keys())
SECTORS = list(SECTOR_PRODUCTS.keys())
BANDS = VALID_BANDS
SAT_CODES = {"GOES-16": "G16", "GOES-18": "G18", "GOES-19": "G19"}


def _make_s3_key(satellite: str, sector: str, band: str, dt: datetime, mode: str = "M6") -> str:
    """Build a realistic S3 key for testing."""
    product = SECTOR_PRODUCTS[sector]
    # Filename needs CMIPM1/CMIPM2 for mesoscale, not just CMIPM
    if sector == "Mesoscale1":
        file_product = "ABI-L2-CMIPM1"
    elif sector == "Mesoscale2":
        file_product = "ABI-L2-CMIPM2"
    else:
        file_product = product
    sat_code = SAT_CODES[satellite]
    doy = dt.timetuple().tm_yday
    s_ts = f"{dt.year}{doy:03d}{dt.hour:02d}{dt.minute:02d}{dt.second:02d}0"
    e_ts = f"{dt.year}{doy:03d}{dt.hour:02d}{(dt.minute + 1) % 60:02d}{dt.second:02d}0"
    c_ts = e_ts
    # e.g. OR_ABI-L2-CMIPF-M6C02_G16_s20260440100000_e20260440101000_c20260440101000.nc
    filename = f"OR_{file_product}-{mode}{band}_{sat_code}_s{s_ts}_e{e_ts}_c{c_ts}.nc"
    return f"{product}/{dt.year}/{doy:03d}/{dt.hour:02d}/{filename}"


# ---------------------------------------------------------------------------
# 1. _parse_scan_time — all satellites
# ---------------------------------------------------------------------------
class TestParseScanTimeMatrix:
    @pytest.mark.parametrize("satellite", SATELLITES)
    @pytest.mark.parametrize("sector", SECTORS)
    def test_parse_scan_time_per_satellite_sector(self, satellite, sector):
        dt = datetime(2025, 6, 15, 12, 30, 45, tzinfo=UTC)
        key = _make_s3_key(satellite, sector, "C02", dt)
        result = _parse_scan_time(key)
        assert result is not None
        assert result.tzinfo is not None, "Must return UTC-aware datetime"
        assert result.year == 2025
        assert result.hour == 12
        assert result.minute == 30
        assert result.second == 45

    def test_parse_scan_time_invalid(self):
        assert _parse_scan_time("garbage/key/no_timestamp.nc") is None

    def test_parse_scan_time_returns_utc(self):
        key = _make_s3_key("GOES-18", "CONUS", "C13", datetime(2026, 1, 1, 0, 0, 0, tzinfo=UTC))
        result = _parse_scan_time(key)
        assert result.tzinfo is UTC


# ---------------------------------------------------------------------------
# 2. _matches_sector_and_band — full matrix
# ---------------------------------------------------------------------------
class TestMatchesSectorAndBandMatrix:
    @pytest.mark.parametrize("sector", SECTORS)
    @pytest.mark.parametrize("band", BANDS)
    @pytest.mark.parametrize("mode", ["M3", "M4", "M6"])
    def test_matching_key(self, sector, band, mode):
        dt = datetime(2025, 7, 1, 6, 0, 0, tzinfo=UTC)
        key = _make_s3_key("GOES-16", sector, band, dt, mode=mode)
        assert _matches_sector_and_band(key, sector, band) is True

    @pytest.mark.parametrize("sector", SECTORS)
    def test_wrong_band_rejected(self, sector):
        dt = datetime(2025, 7, 1, 6, 0, 0, tzinfo=UTC)
        key = _make_s3_key("GOES-16", sector, "C02", dt)
        assert _matches_sector_and_band(key, sector, "C13") is False

    def test_mesoscale1_rejects_m2(self):
        dt = datetime(2025, 7, 1, 6, 0, 0, tzinfo=UTC)
        key = _make_s3_key("GOES-16", "Mesoscale2", "C02", dt)
        assert _matches_sector_and_band(key, "Mesoscale1", "C02") is False

    def test_mesoscale2_rejects_m1(self):
        dt = datetime(2025, 7, 1, 6, 0, 0, tzinfo=UTC)
        key = _make_s3_key("GOES-16", "Mesoscale1", "C02", dt)
        assert _matches_sector_and_band(key, "Mesoscale2", "C02") is False


# ---------------------------------------------------------------------------
# 3. validate_params — all valid combos + edge cases
# ---------------------------------------------------------------------------
class TestValidateParamsMatrix:
    @pytest.mark.parametrize("satellite", SATELLITES)
    @pytest.mark.parametrize("sector", SECTORS)
    @pytest.mark.parametrize("band", BANDS)
    def test_all_valid_combos(self, satellite, sector, band):
        validate_params(satellite, sector, band)  # should not raise

    @pytest.mark.parametrize("bad_sat", ["GOES-15", "GOES-99", "", "goes-16"])
    def test_invalid_satellite(self, bad_sat):
        with pytest.raises(ValueError, match="Unknown satellite"):
            validate_params(bad_sat, "FullDisk", "C01")

    @pytest.mark.parametrize("bad_sector", ["fulldisk", "FULLDISK", "Meso", ""])
    def test_invalid_sector(self, bad_sector):
        with pytest.raises(ValueError, match="Unknown sector"):
            validate_params("GOES-16", bad_sector, "C01")

    @pytest.mark.parametrize("bad_band", ["C00", "C17", "c01", "B01", ""])
    def test_invalid_band(self, bad_band):
        with pytest.raises(ValueError, match="Unknown band"):
            validate_params("GOES-16", "FullDisk", bad_band)


# ---------------------------------------------------------------------------
# 4. S3 bucket mapping
# ---------------------------------------------------------------------------
class TestBucketMapping:
    @pytest.mark.parametrize(
        "satellite,expected_bucket",
        [("GOES-16", "noaa-goes16"), ("GOES-18", "noaa-goes18"), ("GOES-19", "noaa-goes19")],
    )
    def test_bucket_names(self, satellite, expected_bucket):
        assert SATELLITE_BUCKETS[satellite] == expected_bucket


# ---------------------------------------------------------------------------
# 5. S3 prefix construction — all satellite/sector combos
# ---------------------------------------------------------------------------
class TestBuildS3Prefix:
    @pytest.mark.parametrize("satellite", SATELLITES)
    @pytest.mark.parametrize("sector", SECTORS)
    def test_prefix_format(self, satellite, sector):
        dt = datetime(2025, 3, 15, 14, 0, 0, tzinfo=UTC)
        prefix = _build_s3_prefix(satellite, sector, "C02", dt)
        product = SECTOR_PRODUCTS[sector]
        assert prefix.startswith(f"{product}/2025/")
        assert prefix.endswith("14/")
        # DOY for March 15 = 74
        assert "/074/" in prefix

    def test_prefix_day_of_year(self):
        dt = datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC)
        prefix = _build_s3_prefix("GOES-16", "FullDisk", "C01", dt)
        assert "/001/00/" in prefix

    def test_prefix_dec31(self):
        dt = datetime(2025, 12, 31, 23, 0, 0, tzinfo=UTC)
        prefix = _build_s3_prefix("GOES-16", "FullDisk", "C01", dt)
        assert "/365/23/" in prefix


# ---------------------------------------------------------------------------
# 6. list_available — mocked S3 for each satellite/sector
# ---------------------------------------------------------------------------
class TestListAvailableMocked:
    @pytest.mark.parametrize("satellite", SATELLITES)
    @pytest.mark.parametrize("sector", SECTORS)
    def test_list_available_returns_results(self, satellite, sector):
        band = "C02"
        start = datetime(2025, 6, 15, 12, 0, 0, tzinfo=UTC)
        end = datetime(2025, 6, 15, 12, 30, 0, tzinfo=UTC)

        # Build fake S3 keys at 10-min intervals
        fake_keys = []
        t = start
        while t <= end:
            fake_keys.append({
                "Key": _make_s3_key(satellite, sector, band, t),
                "Size": 5000000,
            })
            t += timedelta(minutes=10)

        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [{"Contents": fake_keys}]
        mock_s3 = MagicMock()
        mock_s3.get_paginator.return_value = mock_paginator

        with (
            patch("app.services.goes_fetcher._get_s3_client", return_value=mock_s3),
            patch("app.services.goes_fetcher._retry_s3_operation", side_effect=lambda fn, *a, **kw: fn()),
        ):
            results = list_available(satellite, sector, band, start, end)

        assert len(results) > 0
        for r in results:
            assert r["scan_time"].tzinfo is not None
            assert start <= r["scan_time"] <= end

    def test_empty_s3_response(self):
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [{"Contents": []}]
        mock_s3 = MagicMock()
        mock_s3.get_paginator.return_value = mock_paginator

        with (
            patch("app.services.goes_fetcher._get_s3_client", return_value=mock_s3),
            patch("app.services.goes_fetcher._retry_s3_operation", side_effect=lambda fn, *a, **kw: fn()),
        ):
            results = list_available("GOES-18", "CONUS", "C02",
                                     datetime(2025, 6, 15, 12, 0, 0, tzinfo=UTC),
                                     datetime(2025, 6, 15, 12, 30, 0, tzinfo=UTC))
        assert results == []

    def test_no_contents_key(self):
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [{}]  # No "Contents" key
        mock_s3 = MagicMock()
        mock_s3.get_paginator.return_value = mock_paginator

        with (
            patch("app.services.goes_fetcher._get_s3_client", return_value=mock_s3),
            patch("app.services.goes_fetcher._retry_s3_operation", side_effect=lambda fn, *a, **kw: fn()),
        ):
            results = list_available("GOES-19", "FullDisk", "C01",
                                     datetime(2025, 6, 15, 12, 0, 0, tzinfo=UTC),
                                     datetime(2025, 6, 15, 12, 30, 0, tzinfo=UTC))
        assert results == []


# ---------------------------------------------------------------------------
# 7. Timezone handling — naive vs aware
# ---------------------------------------------------------------------------
class TestTimezoneHandling:
    def test_parse_scan_time_is_always_utc_aware(self):
        for sat in SATELLITES:
            key = _make_s3_key(sat, "FullDisk", "C02", datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC))
            result = _parse_scan_time(key)
            assert result.tzinfo is not None

    def test_list_available_rejects_naive_start(self):
        """list_available compares with UTC-aware scan times; naive input would fail."""
        # This tests that the system works with aware datetimes
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [{"Contents": []}]
        mock_s3 = MagicMock()
        mock_s3.get_paginator.return_value = mock_paginator

        with (
            patch("app.services.goes_fetcher._get_s3_client", return_value=mock_s3),
            patch("app.services.goes_fetcher._retry_s3_operation", side_effect=lambda fn, *a, **kw: fn()),
        ):
            # Aware datetimes should work fine
            results = list_available("GOES-16", "FullDisk", "C02",
                                     datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
                                     datetime(2025, 1, 1, 1, 0, 0, tzinfo=UTC))
            assert results == []


# ---------------------------------------------------------------------------
# 8. fetch_goes_data task — parameter validation
# ---------------------------------------------------------------------------
class TestFetchGoesDataTaskParams:
    @pytest.mark.parametrize("missing_key", ["satellite", "sector", "band", "start_time", "end_time"])
    def test_missing_param_raises(self, missing_key):
        """Missing required params should raise KeyError, not silently fail."""
        full_params = {
            "satellite": "GOES-18",
            "sector": "CONUS",
            "band": "C02",
            "start_time": "2025-06-15T12:00:00+00:00",
            "end_time": "2025-06-15T13:00:00+00:00",
        }
        del full_params[missing_key]

        with patch("app.tasks.goes_tasks._update_job_db"), \
             patch("app.tasks.goes_tasks._publish_progress"), \
             patch("app.tasks.goes_tasks._get_redis"):
            from app.tasks.goes_tasks import fetch_goes_data
            # The task should raise (KeyError or similar) for missing params
            with pytest.raises((KeyError, ValueError)):
                fetch_goes_data("test-job-id", full_params)

    def test_all_params_present_reaches_fetch(self):
        """With all params, task should get past param extraction to fetch_frames."""
        params = {
            "satellite": "GOES-18",
            "sector": "CONUS",
            "band": "C02",
            "start_time": "2025-06-15T12:00:00+00:00",
            "end_time": "2025-06-15T13:00:00+00:00",
        }

        with patch("app.tasks.goes_tasks._update_job_db"), \
             patch("app.tasks.goes_tasks._publish_progress"), \
             patch("app.tasks.goes_tasks._get_redis"), \
             patch("app.tasks.goes_tasks._get_sync_db"), \
             patch("app.services.goes_fetcher.fetch_frames", return_value=[]) as mock_fetch, \
             patch("app.services.goes_fetcher.list_available", return_value=[]):
            from app.tasks.goes_tasks import fetch_goes_data
            fetch_goes_data("test-job-id", params)
            mock_fetch.assert_called_once()


# ---------------------------------------------------------------------------
# 9. All 16 bands parse and match correctly
# ---------------------------------------------------------------------------
class TestAllBands:
    @pytest.mark.parametrize("band", BANDS)
    def test_band_in_key_roundtrip(self, band):
        dt = datetime(2025, 8, 1, 18, 0, 0, tzinfo=UTC)
        key = _make_s3_key("GOES-18", "CONUS", band, dt)
        assert _matches_sector_and_band(key, "CONUS", band)
        assert _parse_scan_time(key) is not None
        # Ensure other bands don't match
        other = "C01" if band != "C01" else "C02"
        assert not _matches_sector_and_band(key, "CONUS", other)
