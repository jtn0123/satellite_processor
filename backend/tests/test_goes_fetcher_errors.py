"""Tests for GOES fetcher error paths — S3 failures, network errors, circuit breaker."""

from unittest.mock import patch

import pytest
from app.circuit_breaker import CircuitBreakerOpen
from app.services.goes_fetcher import (
    _matches_sector_and_band,
    _parse_scan_time,
    _retry_s3_operation,
    validate_params,
)


def test_validate_params_invalid_satellite():
    with pytest.raises(ValueError, match="Unknown satellite"):
        validate_params("GOES-99", "FullDisk", "C02")


def test_validate_params_invalid_sector():
    with pytest.raises(ValueError, match="Unknown sector"):
        validate_params("GOES-16", "BadSector", "C02")


def test_validate_params_invalid_band():
    with pytest.raises(ValueError, match="Unknown band"):
        validate_params("GOES-16", "FullDisk", "C99")


def test_validate_params_valid():
    validate_params("GOES-16", "FullDisk", "C02")  # Should not raise


def test_parse_scan_time_valid():
    key = "ABI-L2-CMIPF/2024/001/00/OR_ABI-L2-CMIPF-M6C02_G16_s20240011200000_e20240011210000.nc"
    dt = _parse_scan_time(key)
    assert dt is not None
    assert dt.year == 2024
    assert dt.hour == 12


def test_parse_scan_time_invalid():
    assert _parse_scan_time("no_timestamp_here.nc") is None


def test_matches_sector_and_band():
    key = "OR_ABI-L2-CMIPF-M6C02_G16_s20240011200000.nc"
    assert _matches_sector_and_band(key, "FullDisk", "C02") is True
    assert _matches_sector_and_band(key, "FullDisk", "C13") is False


def test_matches_mesoscale():
    key1 = "OR_ABI-L2-CMIPM1-M6C02_G16_s20240011200000.nc"
    key2 = "OR_ABI-L2-CMIPM2-M6C02_G16_s20240011200000.nc"
    assert _matches_sector_and_band(key1, "Mesoscale1", "C02") is True
    assert _matches_sector_and_band(key1, "Mesoscale2", "C02") is False
    assert _matches_sector_and_band(key2, "Mesoscale2", "C02") is True


def test_retry_s3_circuit_breaker_open():
    """When circuit breaker is open, should raise immediately."""
    with patch("app.circuit_breaker.s3_circuit_breaker") as mock_cb:
        mock_cb.allow_request.return_value = False
        with pytest.raises(CircuitBreakerOpen):
            _retry_s3_operation(lambda: None, operation="test")


def test_retry_s3_success_records_success():
    """Successful S3 ops should record success on circuit breaker."""
    with patch("app.circuit_breaker.s3_circuit_breaker") as mock_cb:
        mock_cb.allow_request.return_value = True
        result = _retry_s3_operation(lambda: "ok", operation="test")
        assert result == "ok"
        mock_cb.record_success.assert_called_once()
