"""Tests for refactored goes_fetcher helpers: _read_cmi_data, _normalize_cmi_to_image, etc."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import numpy as np


class TestNormalizeCmiToImage:
    """Tests for _normalize_cmi_to_image."""

    def test_all_nan_returns_black_image(self):
        from app.services.goes_fetcher import _normalize_cmi_to_image
        cmi = np.full((50, 50), np.nan, dtype=np.float32)
        img = _normalize_cmi_to_image(cmi)
        assert img.size == (50, 50)

    def test_uniform_values_returns_image(self):
        from app.services.goes_fetcher import _normalize_cmi_to_image
        cmi = np.full((30, 40), 5.0, dtype=np.float32)
        img = _normalize_cmi_to_image(cmi)
        assert img.size == (40, 30)

    def test_normal_range_normalizes(self):
        from app.services.goes_fetcher import _normalize_cmi_to_image
        cmi = np.linspace(0, 100, 100).reshape(10, 10).astype(np.float32)
        img = _normalize_cmi_to_image(cmi)
        arr = np.array(img)
        assert arr.max() == 255
        assert arr.min() == 0

    def test_1d_nan_array(self):
        from app.services.goes_fetcher import _normalize_cmi_to_image
        cmi = np.full((10,), np.nan, dtype=np.float32)
        # Should handle gracefully (shape[1] missing)
        img = _normalize_cmi_to_image(cmi)
        assert img is not None


class TestReadCmiData:
    """Tests for _read_cmi_data."""

    @patch("app.services.goes_fetcher.logger")
    def test_returns_none_on_missing_file(self, mock_logger):
        from app.services.goes_fetcher import _read_cmi_data
        result = _read_cmi_data(Path("/nonexistent/file.nc"), "FullDisk")
        assert result is None

    @patch("app.services.goes_fetcher.logger")
    def test_returns_none_on_import_error(self, mock_logger):
        from app.services.goes_fetcher import _read_cmi_data
        with patch.dict("sys.modules", {"netCDF4": None}):
            result = _read_cmi_data(Path("/tmp/fake.nc"), "CONUS")
            assert result is None


class TestNetcdfToPngFromFile:
    """Tests for _netcdf_to_png_from_file with the refactored code."""

    @patch("app.services.goes_fetcher._normalize_cmi_to_image")
    @patch("app.services.goes_fetcher._read_cmi_data")
    def test_returns_placeholder_when_read_fails(self, mock_read, mock_norm, tmp_path):
        from app.services.goes_fetcher import _netcdf_to_png_from_file
        mock_read.return_value = None
        out = tmp_path / "out.png"
        result = _netcdf_to_png_from_file(Path("fake.nc"), out)
        assert result == out
        assert out.exists()
        mock_norm.assert_not_called()

    @patch("app.services.goes_fetcher._normalize_cmi_to_image")
    @patch("app.services.goes_fetcher._read_cmi_data")
    def test_calls_normalize_on_success(self, mock_read, mock_norm, tmp_path):
        from app.services.goes_fetcher import _netcdf_to_png_from_file
        from PIL import Image as PILImage
        cmi = np.ones((10, 10), dtype=np.float32)
        mock_read.return_value = cmi
        mock_norm.return_value = PILImage.new("L", (10, 10), 128)
        out = tmp_path / "out.png"
        _netcdf_to_png_from_file(Path("fake.nc"), out)
        mock_norm.assert_called_once()


class TestS3RetryHelpers:
    """Tests for extracted S3 retry helper functions."""

    def test_is_retryable_client_error(self):
        from app.services.goes_fetcher import _is_retryable_client_error
        from botocore.exceptions import ClientError

        exc = ClientError({"Error": {"Code": "SlowDown", "Message": ""}}, "op")
        assert _is_retryable_client_error(exc) is True

        exc2 = ClientError({"Error": {"Code": "NoSuchKey", "Message": ""}}, "op")
        assert _is_retryable_client_error(exc2) is False

    def test_s3_retry_delay(self):
        from app.services.goes_fetcher import _s3_retry_delay
        assert _s3_retry_delay(1) == 1.0
        assert _s3_retry_delay(2) == 2.0
        assert _s3_retry_delay(3) == 4.0


class TestBuildFetchResult:
    """Tests for _build_fetch_result."""

    def test_returns_expected_keys(self):
        from app.services.goes_fetcher import _build_fetch_result
        result = _build_fetch_result([], 0, False, 0, 0)
        assert set(result.keys()) == {"frames", "total_available", "capped", "attempted", "failed_downloads"}

    def test_with_data(self):
        from app.services.goes_fetcher import _build_fetch_result
        result = _build_fetch_result([{"x": 1}], 10, True, 5, 2)
        assert result["total_available"] == 10
        assert result["capped"] is True
        assert result["failed_downloads"] == 2
