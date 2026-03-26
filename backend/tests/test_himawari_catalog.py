"""Tests for Himawari S3 catalog functions."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from app.services.himawari_catalog import (
    _build_himawari_date_prefix,
    _build_himawari_prefix,
    _matches_himawari_band,
    _parse_himawari_filename,
    _parse_himawari_scan_time,
    himawari_catalog_latest,
    list_himawari_timestamps,
)

# ── _build_himawari_prefix ────────────────────────────────────────


class TestBuildHimawariPrefix:
    def test_fldk_sector(self):
        dt = datetime(2026, 3, 3, 0, 0, tzinfo=UTC)
        assert _build_himawari_prefix("FLDK", dt) == "AHI-L1b-FLDK/2026/03/03/0000/"

    def test_japan_sector(self):
        dt = datetime(2026, 7, 15, 14, 30, tzinfo=UTC)
        assert _build_himawari_prefix("Japan", dt) == "AHI-L1b-Japan/2026/07/15/1430/"

    def test_target_sector(self):
        dt = datetime(2025, 12, 1, 23, 50, tzinfo=UTC)
        assert _build_himawari_prefix("Target", dt) == "AHI-L1b-Target/2025/12/01/2350/"

    def test_unknown_sector_raises(self):
        dt = datetime(2026, 1, 1, tzinfo=UTC)
        with pytest.raises(ValueError, match="Unknown Himawari sector"):
            _build_himawari_prefix("CONUS", dt)

    def test_zero_padded_month_day(self):
        dt = datetime(2026, 1, 5, 3, 0, tzinfo=UTC)
        prefix = _build_himawari_prefix("FLDK", dt)
        assert "/01/05/" in prefix
        assert prefix.endswith("0300/")


class TestBuildHimawariDatePrefix:
    def test_date_prefix(self):
        dt = datetime(2026, 3, 3, 12, 30, tzinfo=UTC)
        assert _build_himawari_date_prefix("FLDK", dt) == "AHI-L1b-FLDK/2026/03/03/"

    def test_unknown_sector_raises(self):
        with pytest.raises(ValueError):
            _build_himawari_date_prefix("INVALID", datetime(2026, 1, 1, tzinfo=UTC))


# ── _parse_himawari_filename ──────────────────────────────────────


class TestParseHimawariFilename:
    def test_typical_filename(self):
        key = "AHI-L1b-FLDK/2026/03/03/0000/HS_H09_20260303_0000_B13_FLDK_R20_S0510.DAT.bz2"
        result = _parse_himawari_filename(key)
        assert result is not None
        assert result["band"] == "B13"
        assert result["sector"] == "FLDK"
        assert result["segment"] == 5
        assert result["resolution"] == 20
        assert result["date"] == "20260303"
        assert result["time"] == "0000"

    def test_band_01(self):
        key = "HS_H09_20260303_0000_B01_FLDK_R10_S0110.DAT.bz2"
        result = _parse_himawari_filename(key)
        assert result is not None
        assert result["band"] == "B01"
        assert result["resolution"] == 10
        assert result["segment"] == 1

    def test_band_16(self):
        key = "HS_H09_20260303_1200_B16_Japan_R20_S1020.DAT.bz2"
        result = _parse_himawari_filename(key)
        assert result is not None
        assert result["band"] == "B16"
        assert result["sector"] == "Japan"
        assert result["segment"] == 10
        assert result["time"] == "1200"

    def test_target_sector(self):
        key = "HS_H09_20260303_0230_B07_Target_R20_S0320.DAT.bz2"
        result = _parse_himawari_filename(key)
        assert result is not None
        assert result["sector"] == "Target"
        assert result["segment"] == 3

    def test_malformed_filename_returns_none(self):
        assert _parse_himawari_filename("random_file.txt") is None

    def test_goes_filename_returns_none(self):
        key = "OR_ABI-L2-CMIPC-M6C02_G19_s20241661200.nc"
        assert _parse_himawari_filename(key) is None

    def test_empty_string_returns_none(self):
        assert _parse_himawari_filename("") is None


# ── _matches_himawari_band ────────────────────────────────────────


class TestMatchesHimawariBand:
    def test_matching_band(self):
        key = "HS_H09_20260303_0000_B13_FLDK_R20_S0510.DAT.bz2"
        assert _matches_himawari_band(key, "B13") is True

    def test_non_matching_band(self):
        key = "HS_H09_20260303_0000_B13_FLDK_R20_S0510.DAT.bz2"
        assert _matches_himawari_band(key, "B01") is False

    def test_malformed_key(self):
        assert _matches_himawari_band("garbage.txt", "B01") is False


# ── _parse_himawari_scan_time ─────────────────────────────────────


class TestParseHimawariScanTime:
    def test_typical_filename(self):
        key = "HS_H09_20260303_0000_B13_FLDK_R20_S0510.DAT.bz2"
        result = _parse_himawari_scan_time(key)
        assert result is not None
        assert result == datetime(2026, 3, 3, 0, 0, tzinfo=UTC)

    def test_afternoon_time(self):
        key = "HS_H09_20260303_1430_B01_Japan_R10_S0110.DAT.bz2"
        result = _parse_himawari_scan_time(key)
        assert result is not None
        assert result.hour == 14
        assert result.minute == 30

    def test_malformed_returns_none(self):
        assert _parse_himawari_scan_time("not_a_real_file.txt") is None

    def test_different_segments_same_time(self):
        """All segments for the same timestamp should parse to the same time."""
        keys = [f"HS_H09_20260303_0000_B13_FLDK_R20_S{seg:02d}10.DAT.bz2" for seg in range(1, 11)]
        times = [_parse_himawari_scan_time(k) for k in keys]
        assert all(t == times[0] for t in times)
        assert times[0] == datetime(2026, 3, 3, 0, 0, tzinfo=UTC)


# ── list_himawari_timestamps ──────────────────────────────────────


class TestListHimawariTimestamps:
    @patch("app.services.himawari_catalog._list_s3_keys")
    def test_deduplicates_segments(self, mock_list):
        """160 files (16 bands × 10 segments) for one timestamp → 1 entry for band B13."""
        objects = []
        for band in range(1, 17):
            for seg in range(1, 11):
                res = 10 if band <= 3 else 20
                key = (
                    f"AHI-L1b-FLDK/2026/03/03/0000/HS_H09_20260303_0000_B{band:02d}_FLDK_R{res}_S{seg:02d}{res}.DAT.bz2"
                )
                objects.append({"Key": key, "Size": 5000000})
        mock_list.return_value = objects

        result = list_himawari_timestamps("FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        assert len(result) == 1
        assert result[0]["scan_time"] == "2026-03-03T00:00:00+00:00"

    @patch("app.services.himawari_catalog._list_s3_keys")
    def test_multiple_timestamps(self, mock_list):
        """Two different observation times → 2 entries."""
        objects = []
        for hhmm in ("0000", "0010"):
            for seg in range(1, 11):
                key = f"AHI-L1b-FLDK/2026/03/03/{hhmm}/HS_H09_20260303_{hhmm}_B13_FLDK_R20_S{seg:02d}20.DAT.bz2"
                objects.append({"Key": key, "Size": 5000000})
        mock_list.return_value = objects

        result = list_himawari_timestamps("FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        assert len(result) == 2
        assert result[0]["scan_time"] < result[1]["scan_time"]

    @patch("app.services.himawari_catalog._list_s3_keys")
    def test_empty_listing(self, mock_list):
        mock_list.return_value = []
        result = list_himawari_timestamps("FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        assert result == []

    @patch("app.services.himawari_catalog._list_s3_keys")
    def test_filters_by_band(self, mock_list):
        """Only returns timestamps for the requested band."""
        objects = [
            {"Key": "AHI-L1b-FLDK/2026/03/03/0000/HS_H09_20260303_0000_B01_FLDK_R10_S0110.DAT.bz2", "Size": 5000},
            {"Key": "AHI-L1b-FLDK/2026/03/03/0000/HS_H09_20260303_0000_B13_FLDK_R20_S0120.DAT.bz2", "Size": 5000},
        ]
        mock_list.return_value = objects

        result = list_himawari_timestamps("FLDK", "B01", datetime(2026, 3, 3, tzinfo=UTC))
        assert len(result) == 1
        assert "B01" in result[0]["key"]

    @patch("app.services.himawari_catalog._list_s3_keys")
    def test_s3_exception_returns_empty(self, mock_list):
        mock_list.side_effect = ConnectionError("boom")
        result = list_himawari_timestamps("FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        assert result == []

    @patch("app.services.himawari_catalog._list_s3_keys")
    def test_malformed_filenames_skipped(self, mock_list):
        objects = [
            {"Key": "AHI-L1b-FLDK/2026/03/03/0000/not_a_himawari_file.txt", "Size": 100},
            {"Key": "AHI-L1b-FLDK/2026/03/03/0000/HS_H09_20260303_0000_B13_FLDK_R20_S0120.DAT.bz2", "Size": 5000},
        ]
        mock_list.return_value = objects

        result = list_himawari_timestamps("FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        assert len(result) == 1


# ── himawari_catalog_latest ───────────────────────────────────────


class TestHimawariCatalogLatest:
    @patch("app.services.himawari_catalog.list_himawari_timestamps")
    def test_returns_latest_with_null_urls(self, mock_list):
        mock_list.return_value = [
            {"scan_time": "2026-03-03T00:00:00+00:00", "key": "k1", "size": 5000},
            {"scan_time": "2026-03-03T00:10:00+00:00", "key": "k2", "size": 5000},
        ]

        result = himawari_catalog_latest("FLDK", "B13")
        assert result is not None
        assert result["scan_time"] == "2026-03-03T00:10:00+00:00"
        assert result["satellite"] == "Himawari-9"
        assert result["sector"] == "FLDK"
        assert result["band"] == "B13"
        assert result["image_url"] is None
        assert result["mobile_url"] is None
        assert result["thumbnail_url"] is None

    @patch("app.services.himawari_catalog.list_himawari_timestamps")
    def test_returns_none_when_empty(self, mock_list):
        mock_list.return_value = []
        result = himawari_catalog_latest("FLDK", "B13")
        assert result is None

    @patch("app.services.himawari_catalog.list_himawari_timestamps")
    def test_checks_previous_hours(self, mock_list):
        """Should check up to 4 hours back to find data."""
        call_count = 0

        def side_effect(sector, band, dt):
            nonlocal call_count
            call_count += 1
            # Return data only on the third call (2 hours ago)
            if call_count == 3:
                return [{"scan_time": "2026-03-03T10:00:00+00:00", "key": "k1", "size": 5000}]
            return []

        mock_list.side_effect = side_effect
        result = himawari_catalog_latest("FLDK", "B13")
        assert result is not None
        assert call_count == 3

    @patch("app.services.himawari_catalog.list_himawari_timestamps")
    def test_stops_on_first_hour_with_data(self, mock_list):
        """Should not check older hours once data is found."""
        mock_list.return_value = [
            {"scan_time": "2026-03-03T12:00:00+00:00", "key": "k1", "size": 5000},
        ]
        result = himawari_catalog_latest("FLDK", "B13")
        assert result is not None
        assert mock_list.call_count == 1


# ── catalog.py dispatch tests ─────────────────────────────────────


class TestCatalogDispatch:
    """Verify catalog_list/catalog_latest dispatch to Himawari functions."""

    @patch("app.services.catalog.list_himawari_timestamps")
    def test_catalog_list_dispatches_himawari(self, mock_list):
        from app.services.catalog import catalog_list

        mock_list.return_value = [
            {"scan_time": "2026-03-03T00:00:00+00:00", "key": "k1", "size": 5000},
        ]
        result = catalog_list("Himawari-9", "FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        mock_list.assert_called_once_with("FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        assert len(result) == 1

    @patch("app.services.catalog.himawari_catalog_latest")
    def test_catalog_latest_dispatches_himawari(self, mock_latest):
        from app.services.catalog import catalog_latest

        mock_latest.return_value = {
            "scan_time": "2026-03-03T00:00:00+00:00",
            "key": "k1",
            "size": 5000,
            "satellite": "Himawari-9",
            "sector": "FLDK",
            "band": "B13",
            "image_url": None,
            "mobile_url": None,
            "thumbnail_url": None,
        }
        result = catalog_latest("Himawari-9", "FLDK", "B13")
        mock_latest.assert_called_once_with("FLDK", "B13")
        assert result is not None
        assert result["image_url"] is None

    @patch("app.services.catalog._collect_matching_entries")
    def test_goes_not_affected_by_himawari_dispatch(self, mock_collect):
        """GOES satellites should still use the original code path."""
        from app.services.catalog import catalog_latest

        mock_collect.return_value = [
            {
                "scan_time": "2025-06-01T12:00:00+00:00",
                "size": 8000000,
                "key": "ABI-L2-CMIPC/2025/152/12/test.nc",
            }
        ]
        result = catalog_latest("GOES-19", "CONUS", "C02")
        assert result is not None
        assert result["satellite"] == "GOES-19"
        # GOES should have CDN URLs
        assert result["image_url"] is not None
