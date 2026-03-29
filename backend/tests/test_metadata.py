"""Tests for satellite metadata parsing utility."""

from __future__ import annotations

from datetime import datetime

from app.utils.metadata import parse_satellite_metadata


class TestParseSatelliteMetadata:
    def test_parses_goes16_with_timestamp(self):
        result = parse_satellite_metadata("GOES-16_C02_CONUS_20240315T120000Z.nc")
        assert result["satellite"] == "GOES-16"
        assert result["captured_at"] == datetime(2024, 3, 15, 12, 0, 0)

    def test_parses_goes18(self):
        result = parse_satellite_metadata("GOES-18_C13_FD_20240101T000000Z.nc")
        assert result["satellite"] == "GOES-18"
        assert result["captured_at"] == datetime(2024, 1, 1, 0, 0, 0)

    def test_lowercase_satellite(self):
        result = parse_satellite_metadata("goes-16_data_20240315T120000Z.nc")
        assert result["satellite"] == "GOES-16"

    def test_no_satellite_name(self):
        result = parse_satellite_metadata("20240315T120000Z_C02_CONUS.nc")
        assert result["satellite"] is None
        assert result["captured_at"] == datetime(2024, 3, 15, 12, 0, 0)

    def test_no_timestamp(self):
        result = parse_satellite_metadata("GOES-16_C02_CONUS.nc")
        assert result["satellite"] == "GOES-16"
        assert result["captured_at"] is None

    def test_no_match(self):
        result = parse_satellite_metadata("random_file.txt")
        assert result["satellite"] is None
        assert result["captured_at"] is None

    def test_timestamp_format(self):
        result = parse_satellite_metadata("frame_20231225T183045Z_data.png")
        assert result["captured_at"] == datetime(2023, 12, 25, 18, 30, 45)

    def test_mixed_case_satellite(self):
        result = parse_satellite_metadata("Goes-16_something.nc")
        assert result["satellite"] == "GOES-16"

    def test_goes19_detected(self):
        result = parse_satellite_metadata("GOES-19_C02_20240315T120000Z.nc")
        assert result["satellite"] == "GOES-19"
        assert result["captured_at"] is not None

    def test_any_goes_satellite(self):
        result = parse_satellite_metadata("GOES-99_data_20240315T120000Z.nc")
        assert result["satellite"] == "GOES-99"
