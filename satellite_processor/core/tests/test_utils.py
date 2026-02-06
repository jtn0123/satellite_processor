"""Tests for core/utils.py - utility functions."""

import pytest
from datetime import datetime

from satellite_processor.core.utils import parse_satellite_timestamp, is_closing


class TestParseSatelliteTimestamp:
    """Tests for parse_satellite_timestamp()"""

    def test_valid_goes_timestamp(self):
        """Test parsing a valid GOES satellite timestamp."""
        result = parse_satellite_timestamp("GOES16_20240115T123045Z_ch13.png")
        assert result == datetime(2024, 1, 15, 12, 30, 45)

    def test_timestamp_in_middle_of_string(self):
        """Test parsing timestamp embedded in longer string."""
        result = parse_satellite_timestamp("prefix_20231225T000000Z_suffix.jpg")
        assert result == datetime(2023, 12, 25, 0, 0, 0)

    def test_no_timestamp_returns_datetime_min(self):
        """Test that missing timestamp returns datetime.min."""
        result = parse_satellite_timestamp("no_timestamp_here.png")
        assert result == datetime.min

    def test_empty_string_returns_datetime_min(self):
        """Test empty string returns datetime.min."""
        result = parse_satellite_timestamp("")
        assert result == datetime.min

    def test_partial_timestamp_not_matched(self):
        """Test that partial timestamps are not matched."""
        result = parse_satellite_timestamp("20240115T1230.png")
        assert result == datetime.min

    def test_multiple_timestamps_uses_first(self):
        """Test that multiple timestamps in filename uses the first one."""
        result = parse_satellite_timestamp("20240101T000000Z_20240202T120000Z.png")
        assert result == datetime(2024, 1, 1, 0, 0, 0)

    def test_various_satellite_formats(self):
        """Test various satellite naming conventions."""
        test_cases = [
            ("GOES16_ABI_L2_CMIPF_20240115T120000Z.nc", datetime(2024, 1, 15, 12, 0, 0)),
            ("GOES18_20230701T235959Z_ch02.png", datetime(2023, 7, 1, 23, 59, 59)),
            ("sanchez_20240315T060000Z_falsecolor.jpg", datetime(2024, 3, 15, 6, 0, 0)),
        ]
        for filename, expected in test_cases:
            result = parse_satellite_timestamp(filename)
            assert result == expected, f"Failed for {filename}"


class TestIsClosing:
    """Tests for is_closing()"""

    def test_closing_window(self):
        """Test detection of closing window."""
        class FakeWindow:
            _is_closing = True

        assert is_closing(FakeWindow()) is True

    def test_open_window(self):
        """Test detection of non-closing window."""
        class FakeWindow:
            _is_closing = False

        assert is_closing(FakeWindow()) is False

    def test_no_attribute_returns_false(self):
        """Test that missing _is_closing attribute returns False."""
        class FakeWindow:
            pass

        assert is_closing(FakeWindow()) is False

    def test_none_window(self):
        """Test that None window returns False."""
        assert is_closing(None) is False
