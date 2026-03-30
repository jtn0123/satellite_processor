"""Tests for composite_task helper functions."""

from __future__ import annotations

import numpy as np
from app.tasks.composite_task import _compose_rgb, _normalize_band
from PIL import Image as PILImage


class TestNormalizeBand:
    def test_normalizes_to_uint8(self):
        arr = np.array([[0.0, 50.0], [100.0, 200.0]], dtype=np.float32)
        result = _normalize_band(arr, (2, 2))
        assert result.dtype == np.uint8
        assert result.min() == 0
        assert result.max() == 255

    def test_constant_array_returns_zeros(self):
        arr = np.full((3, 3), 42.0, dtype=np.float32)
        result = _normalize_band(arr, (3, 3))
        assert np.all(result == 0)

    def test_resizes_if_shape_mismatch(self):
        arr = np.random.rand(4, 4).astype(np.float32) * 255
        result = _normalize_band(arr, (2, 2))
        assert result.shape == (2, 2)
        assert result.dtype == np.uint8


class TestComposeRgb:
    def test_three_bands(self):
        r = np.random.rand(10, 10).astype(np.float32) * 255
        g = np.random.rand(10, 10).astype(np.float32) * 255
        b = np.random.rand(10, 10).astype(np.float32) * 255
        result = _compose_rgb([r, g, b])
        assert isinstance(result, PILImage.Image)
        assert result.mode == "RGB"
        assert result.size == (10, 10)

    def test_missing_band_replaced_with_zeros(self):
        r = np.random.rand(10, 10).astype(np.float32) * 255
        result = _compose_rgb([r, None, r])
        assert isinstance(result, PILImage.Image)
        assert result.mode == "RGB"
        arr = np.array(result)
        # Green channel should be 0 (the None band)
        assert arr[:, :, 1].max() == 0

    def test_different_sizes_resized(self):
        r = np.random.rand(10, 10).astype(np.float32) * 255
        g = np.random.rand(20, 20).astype(np.float32) * 255
        b = np.random.rand(10, 10).astype(np.float32) * 255
        result = _compose_rgb([r, g, b])
        assert isinstance(result, PILImage.Image)
        # Result should match the first non-None band's shape
        assert result.size == (10, 10)
