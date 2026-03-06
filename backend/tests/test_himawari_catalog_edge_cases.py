"""Edge case tests for Himawari catalog functions — empty listings,
malformed filenames, date boundary cases.
"""
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
    list_himawari_timestamps,
)

# ---------------------------------------------------------------------------
# Empty S3 listing scenarios
# ---------------------------------------------------------------------------

class TestEmptyS3Listings:
    """Verify behavior when S3 returns empty or no data."""

    @patch("app.services.himawari_catalog._list_s3_keys")
    def test_empty_contents_returns_empty(self, mock_list):
        """No objects at all should return empty list."""
        mock_list.return_value = []
        result = list_himawari_timestamps("FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        assert result == []

    @patch("app.services.himawari_catalog._list_s3_keys")
    def test_objects_with_no_matching_band(self, mock_list):
        """Objects exist but none match the requested band."""
        mock_list.return_value = [
            {"Key": "AHI-L1b-FLDK/2026/03/03/0000/HS_H09_20260303_0000_B01_FLDK_R10_S0110.DAT.bz2", "Size": 5000},
            {"Key": "AHI-L1b-FLDK/2026/03/03/0000/HS_H09_20260303_0000_B02_FLDK_R10_S0110.DAT.bz2", "Size": 5000},
        ]
        result = list_himawari_timestamps("FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        assert result == []

    @patch("app.services.himawari_catalog._list_s3_keys")
    def test_all_malformed_filenames(self, mock_list):
        """All filenames are malformed — returns empty."""
        mock_list.return_value = [
            {"Key": "AHI-L1b-FLDK/2026/03/03/0000/random_file.txt", "Size": 100},
            {"Key": "AHI-L1b-FLDK/2026/03/03/0000/another.zip", "Size": 200},
            {"Key": "AHI-L1b-FLDK/2026/03/03/0000/.hidden", "Size": 0},
        ]
        result = list_himawari_timestamps("FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        assert result == []


# ---------------------------------------------------------------------------
# Malformed filename parsing
# ---------------------------------------------------------------------------

class TestMalformedFilenames:
    """Tests for filenames that don't match expected patterns."""

    def test_completely_random_string(self):
        assert _parse_himawari_filename("xyzzy") is None

    def test_partial_match_missing_segment(self):
        """Missing the segment portion."""
        key = "HS_H09_20260303_0000_B13_FLDK_R20.DAT.bz2"
        assert _parse_himawari_filename(key) is None

    def test_band_number_too_high(self):
        """Band B99 — unusual but regex should still match."""
        key = "HS_H09_20260303_0000_B99_FLDK_R20_S0110.DAT.bz2"
        result = _parse_himawari_filename(key)
        assert result is not None
        assert result["band"] == "B99"

    def test_empty_string(self):
        assert _parse_himawari_filename("") is None

    def test_just_slashes(self):
        assert _parse_himawari_filename("///") is None

    def test_mixed_valid_and_invalid_in_path(self):
        """Valid filename but weird path."""
        key = "weird/path/HS_H09_20260303_0000_B13_FLDK_R20_S0510.DAT.bz2"
        result = _parse_himawari_filename(key)
        assert result is not None
        assert result["band"] == "B13"

    def test_scan_time_from_malformed_returns_none(self):
        assert _parse_himawari_scan_time("not_a_himawari_file.txt") is None

    def test_matches_band_with_garbage_key(self):
        assert _matches_himawari_band("totally_garbage", "B13") is False


# ---------------------------------------------------------------------------
# Date boundary cases
# ---------------------------------------------------------------------------

class TestDateBoundaries:
    """Tests for date boundaries — midnight, year boundaries, leap years."""

    def test_midnight_prefix(self):
        dt = datetime(2026, 3, 3, 0, 0, tzinfo=UTC)
        prefix = _build_himawari_prefix("FLDK", dt)
        assert prefix.endswith("0000/")

    def test_2359_prefix(self):
        dt = datetime(2026, 3, 3, 23, 59, tzinfo=UTC)
        prefix = _build_himawari_prefix("FLDK", dt)
        assert prefix.endswith("2359/")

    def test_year_boundary(self):
        dt = datetime(2025, 12, 31, 23, 50, tzinfo=UTC)
        prefix = _build_himawari_prefix("FLDK", dt)
        assert "2025/12/31/" in prefix

    def test_new_year(self):
        dt = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
        prefix = _build_himawari_prefix("FLDK", dt)
        assert "2026/01/01/" in prefix

    def test_leap_year_feb29(self):
        dt = datetime(2028, 2, 29, 12, 0, tzinfo=UTC)
        prefix = _build_himawari_prefix("FLDK", dt)
        assert "2028/02/29/" in prefix

    def test_date_prefix_ignores_time(self):
        dt1 = datetime(2026, 3, 3, 0, 0, tzinfo=UTC)
        dt2 = datetime(2026, 3, 3, 23, 59, tzinfo=UTC)
        assert _build_himawari_date_prefix("FLDK", dt1) == _build_himawari_date_prefix("FLDK", dt2)


# ---------------------------------------------------------------------------
# list_himawari_timestamps deduplication edge cases
# ---------------------------------------------------------------------------

class TestTimestampDeduplication:
    """Tests for edge cases in timestamp deduplication."""

    @patch("app.services.himawari_catalog._list_s3_keys")
    def test_duplicate_segments_same_time_deduplicated(self, mock_list):
        """Multiple segments for same band/time -> exactly 1 result."""
        objects = []
        for seg in range(1, 11):
            key = f"AHI-L1b-FLDK/2026/03/03/0000/HS_H09_20260303_0000_B13_FLDK_R20_S{seg:02d}10.DAT.bz2"
            objects.append({"Key": key, "Size": 5000000})
        mock_list.return_value = objects

        result = list_himawari_timestamps("FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        assert len(result) == 1

    @patch("app.services.himawari_catalog._list_s3_keys")
    def test_many_timestamps_sorted(self, mock_list):
        """Multiple timestamps across the day should be sorted."""
        objects = []
        for hhmm in ("2350", "0000", "1200", "0600"):
            for seg in range(1, 3):
                key = (
                    f"AHI-L1b-FLDK/2026/03/03/{hhmm}/"
                    f"HS_H09_20260303_{hhmm}_B13_FLDK_R20_S{seg:02d}20.DAT.bz2"
                )
                objects.append({"Key": key, "Size": 5000})
        mock_list.return_value = objects

        result = list_himawari_timestamps("FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        assert len(result) == 4
        times = [r["scan_time"] for r in result]
        assert times == sorted(times)

    @patch("app.services.himawari_catalog._list_s3_keys")
    def test_mix_of_valid_and_invalid_filenames(self, mock_list):
        """Mix of valid and invalid filenames — only valid ones counted."""
        objects = [
            {"Key": "AHI-L1b-FLDK/2026/03/03/0000/HS_H09_20260303_0000_B13_FLDK_R20_S0120.DAT.bz2", "Size": 5000},
            {"Key": "AHI-L1b-FLDK/2026/03/03/0000/README.md", "Size": 100},
            {"Key": "AHI-L1b-FLDK/2026/03/03/0000/index.html", "Size": 200},
        ]
        mock_list.return_value = objects

        result = list_himawari_timestamps("FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        assert len(result) == 1

    @patch("app.services.himawari_catalog._list_s3_keys")
    def test_s3_connection_error_returns_empty(self, mock_list):
        """S3 errors should gracefully return empty list."""
        mock_list.side_effect = ConnectionError("Network unreachable")
        result = list_himawari_timestamps("FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        assert result == []

    @patch("app.services.himawari_catalog._list_s3_keys")
    def test_s3_timeout_returns_empty(self, mock_list):
        """S3 timeout should gracefully return empty list."""
        mock_list.side_effect = TimeoutError("Request timed out")
        result = list_himawari_timestamps("FLDK", "B13", datetime(2026, 3, 3, tzinfo=UTC))
        assert result == []


# ---------------------------------------------------------------------------
# Sector validation
# ---------------------------------------------------------------------------

class TestSectorValidation:
    """Verify sector validation for prefix builders."""

    def test_invalid_sector_build_prefix(self):
        with pytest.raises(ValueError, match="Unknown Himawari sector"):
            _build_himawari_prefix("INVALID", datetime(2026, 1, 1, tzinfo=UTC))

    def test_invalid_sector_date_prefix(self):
        with pytest.raises(ValueError):
            _build_himawari_date_prefix("CONUS", datetime(2026, 1, 1, tzinfo=UTC))

    def test_all_valid_sectors(self):
        dt = datetime(2026, 3, 3, 12, 0, tzinfo=UTC)
        for sector in ("FLDK", "Japan", "Target"):
            prefix = _build_himawari_prefix(sector, dt)
            assert sector in prefix or f"AHI-L1b-{sector}" in prefix
