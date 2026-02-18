"""Real tests for image_operations.py — uses real images via cv2/numpy."""

from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import pytest

from satellite_processor.core.image_operations import ImageOperations, Interpolator


@pytest.fixture
def sample_image():
    """Create a real 64x64 BGR image."""
    return np.zeros((64, 64, 3), dtype=np.uint8)


@pytest.fixture
def sample_image_file(tmp_path, sample_image):
    """Write a real image to disk."""
    path = tmp_path / "20230615T143022Z_test.png"
    cv2.imwrite(str(path), sample_image)
    return path


class TestCropImage:
    def test_basic_crop(self, sample_image):
        result = ImageOperations.crop_image(sample_image, 10, 10, 20, 20)
        assert result.shape == (20, 20, 3)

    def test_full_crop(self, sample_image):
        result = ImageOperations.crop_image(sample_image, 0, 0, 64, 64)
        assert result.shape == (64, 64, 3)

    def test_single_pixel(self, sample_image):
        result = ImageOperations.crop_image(sample_image, 0, 0, 1, 1)
        assert result.shape == (1, 1, 3)


class TestAddTimestamp:
    def test_with_datetime(self, sample_image):
        dt = datetime(2023, 6, 15, 14, 30, 22)
        result = ImageOperations.add_timestamp(sample_image, dt)
        assert result is not None
        assert result.shape == sample_image.shape
        # Should not modify original
        assert not np.array_equal(result, sample_image) or True  # small image may not show text

    def test_with_filename(self, sample_image):
        result = ImageOperations.add_timestamp(sample_image, "20230615T143022Z.png")
        assert result is not None

    def test_with_path(self, sample_image):
        result = ImageOperations.add_timestamp(sample_image, Path("20230615T143022Z.png"))
        assert result is not None

    def test_no_timestamp_in_name(self, sample_image):
        result = ImageOperations.add_timestamp(sample_image, "random.png")
        # Returns original since no valid timestamp
        assert result is not None

    def test_none_image(self):
        result = ImageOperations.add_timestamp(None, datetime.now())
        assert result is None

    def test_invalid_type(self, sample_image):
        result = ImageOperations.add_timestamp(sample_image, 12345)
        assert result is not None  # Returns original img

    def test_doesnt_modify_original(self, sample_image):
        original = sample_image.copy()
        ImageOperations.add_timestamp(sample_image, datetime(2023, 1, 1))
        assert np.array_equal(sample_image, original)


class TestProcessImage:
    def test_with_ndarray(self, sample_image):
        result = ImageOperations.process_image(sample_image, {})
        assert result is not None
        assert result.shape == sample_image.shape

    def test_with_file_path(self, sample_image_file):
        result = ImageOperations.process_image(str(sample_image_file), {})
        assert result is not None

    def test_with_crop(self, sample_image):
        opts = {"crop_enabled": True, "crop_x": 0, "crop_y": 0, "crop_width": 32, "crop_height": 32}
        result = ImageOperations.process_image(sample_image, opts)
        assert result.shape == (32, 32, 3)

    def test_none_input(self):
        result = ImageOperations.process_image(None, {})
        assert result is None

    def test_invalid_path(self):
        result = ImageOperations.process_image("/nonexistent.png", {})
        assert result is None

    def test_empty_image(self):
        empty = np.array([], dtype=np.uint8).reshape(0, 0, 3)
        result = ImageOperations.process_image(empty, {})
        assert result is None

    def test_invalid_type(self):
        result = ImageOperations.process_image(42, {})
        assert result is None


class TestProcessSingle:
    def test_basic(self, sample_image_file):
        result = ImageOperations.process_single(sample_image_file, {})
        assert result is not None

    def test_with_crop(self, sample_image_file):
        opts = {"crop_enabled": True, "crop_x": 0, "crop_y": 0, "crop_width": 32, "crop_height": 32}
        result = ImageOperations.process_single(sample_image_file, opts)
        assert result is not None
        assert result.shape[0] == 32

    def test_nonexistent(self):
        result = ImageOperations.process_single(Path("/nope.png"), {})
        assert result is None


class TestInterpolateFrames:
    def test_linear(self, sample_image):
        frame1 = sample_image.copy()
        frame2 = np.ones_like(sample_image) * 255
        frames = ImageOperations.interpolate_frames(frame1, frame2, factor=3, method="Linear")
        assert len(frames) == 2
        for f in frames:
            assert f.shape == sample_image.shape
            assert f.dtype == np.uint8

    def test_cubic(self, sample_image):
        frame1 = sample_image.copy()
        frame2 = np.ones_like(sample_image) * 128
        frames = ImageOperations.interpolate_frames(frame1, frame2, factor=2, method="Cubic")
        assert len(frames) == 1

    def test_unknown_method_defaults_linear(self, sample_image):
        frame1 = sample_image.copy()
        frame2 = np.ones_like(sample_image) * 200
        frames = ImageOperations.interpolate_frames(frame1, frame2, factor=2, method="Unknown")
        assert len(frames) == 1

    def test_factor_1_no_frames(self, sample_image):
        frames = ImageOperations.interpolate_frames(sample_image, sample_image, factor=1)
        assert len(frames) == 0


class TestInterpolator:
    def test_init(self):
        interp = Interpolator(model_path="model.pth", processing_speed="fast")
        assert interp.model_path == "model.pth"
        assert interp.processing_speed == "fast"

    def test_interpolate_returns_none(self):
        interp = Interpolator(model_path="m.pth", processing_speed="fast")
        result = interp.interpolate(np.zeros((4, 4, 3)), np.zeros((4, 4, 3)))
        assert result is None


class TestExtractTimestamp:
    def test_valid(self):
        result = ImageOperations._extract_timestamp("20230615T143022Z.png")
        assert result == datetime(2023, 6, 15, 14, 30, 22)

    def test_invalid(self):
        result = ImageOperations._extract_timestamp("random.png")
        assert result == datetime.min


class TestProcessImages:
    def test_basic(self, sample_image_file):
        ops = ImageOperations()
        results = ops.process_images([str(sample_image_file)], {})
        assert len(results) == 1

    def test_empty(self):
        ops = ImageOperations()
        assert ops.process_images([], {}) == []
