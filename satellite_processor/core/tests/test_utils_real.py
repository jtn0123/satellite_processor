"""Real tests for utils.py — no mocking."""

from datetime import datetime

from satellite_processor.core.utils import is_closing, parse_satellite_timestamp


class TestParseSatelliteTimestamp:
    def test_valid_timestamp(self):
        result = parse_satellite_timestamp("IMG_20230615T143022Z_goes16.png")
        assert result == datetime(2023, 6, 15, 14, 30, 22)

    def test_no_timestamp(self):
        assert parse_satellite_timestamp("random_file.png") == datetime.min

    def test_empty_string(self):
        assert parse_satellite_timestamp("") == datetime.min

    def test_multiple_timestamps_returns_first(self):
        result = parse_satellite_timestamp("20230101T000000Z_20231231T235959Z.png")
        assert result == datetime(2023, 1, 1, 0, 0, 0)

    def test_timestamp_in_path(self):
        result = parse_satellite_timestamp("/some/path/20230615T143022Z.png")
        assert result == datetime(2023, 6, 15, 14, 30, 22)

    def test_malformed_timestamp(self):
        # Has the pattern but invalid date
        assert parse_satellite_timestamp("99999999T999999Z.png") == datetime.min


class TestIsClosing:
    def test_not_closing_no_attr(self):
        assert is_closing(object()) is False

    def test_not_closing_false(self):
        obj = type("W", (), {"_is_closing": False})()
        assert is_closing(obj) is False

    def test_closing_true(self):
        obj = type("W", (), {"_is_closing": True})()
        assert is_closing(obj) is True

    def test_none_window(self):
        assert is_closing(None) is False
# Coverage validation
