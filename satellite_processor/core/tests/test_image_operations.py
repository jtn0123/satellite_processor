"""Tests for image_operations.py - ImageOperations class."""

from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

from satellite_processor.core.image_operations import ImageOperations


class TestCropImage:
    """Tests for ImageOperations.crop_image()"""

    def test_crop_basic(self):
        """Test basic cropping returns correct region."""
        img = np.zeros((100, 200, 3), dtype=np.uint8)
        img[10:30, 20:60] = 255  # White rectangle in the crop area

        cropped = ImageOperations.crop_image(img, x=20, y=10, width=40, height=20)

        assert cropped.shape == (20, 40, 3)
        assert np.all(cropped == 255)

    def test_crop_full_image(self):
        """Test cropping with full image dimensions returns same shape."""
        img = np.ones((50, 80, 3), dtype=np.uint8) * 128
        cropped = ImageOperations.crop_image(img, x=0, y=0, width=80, height=50)

        assert cropped.shape == img.shape
        assert np.array_equal(cropped, img)

    def test_crop_single_pixel(self):
        """Test cropping to a single pixel."""
        img = np.arange(12, dtype=np.uint8).reshape(2, 2, 3)
        cropped = ImageOperations.crop_image(img, x=1, y=0, width=1, height=1)

        assert cropped.shape == (1, 1, 3)

    def test_crop_preserves_content(self):
        """Test that crop preserves pixel values from original image."""
        img = np.random.randint(0, 256, (100, 100, 3), dtype=np.uint8)
        x, y, w, h = 10, 20, 30, 40
        cropped = ImageOperations.crop_image(img, x=x, y=y, width=w, height=h)

        assert np.array_equal(cropped, img[y : y + h, x : x + w])


class TestAddTimestamp:
    """Tests for ImageOperations.add_timestamp()"""

    def test_add_timestamp_from_datetime(self):
        """Test adding timestamp from a datetime object."""
        img = np.zeros((100, 400, 3), dtype=np.uint8)
        ts = datetime(2024, 1, 15, 12, 30, 45)

        result = ImageOperations.add_timestamp(img, ts)

        # Should return a modified copy, not the original
        assert result is not img
        assert result.shape == img.shape
        # The image should have changed (white text added)
        assert not np.array_equal(result, img)

    def test_add_timestamp_from_filename_path(self):
        """Test adding timestamp from a filename with satellite timestamp pattern."""
        img = np.zeros((100, 400, 3), dtype=np.uint8)
        path = Path("GOES16_20240115T123045Z_ch13.png")

        result = ImageOperations.add_timestamp(img, path)

        assert result.shape == img.shape
        assert not np.array_equal(result, img)

    def test_add_timestamp_from_string_filename(self):
        """Test adding timestamp from a string filename."""
        img = np.zeros((100, 400, 3), dtype=np.uint8)

        result = ImageOperations.add_timestamp(img, "GOES16_20240115T123045Z_ch13.png")

        assert result.shape == img.shape
        assert not np.array_equal(result, img)

    def test_add_timestamp_invalid_filename_returns_original(self):
        """Test that an invalid filename returns the original image unchanged."""
        img = np.zeros((100, 400, 3), dtype=np.uint8)

        result = ImageOperations.add_timestamp(img, "no_timestamp_here.png")

        assert np.array_equal(result, img)

    def test_add_timestamp_none_image_returns_none(self):
        """Test that None image input is handled gracefully."""
        result = ImageOperations.add_timestamp(None, datetime.now())
        assert result is None

    def test_add_timestamp_invalid_source_type(self):
        """Test that invalid source type returns original image."""
        img = np.zeros((100, 400, 3), dtype=np.uint8)

        result = ImageOperations.add_timestamp(img, 12345)

        assert np.array_equal(result, img)

    def test_add_timestamp_does_not_modify_original(self):
        """Test that the original image is not modified."""
        img = np.zeros((100, 400, 3), dtype=np.uint8)
        original_copy = img.copy()

        ImageOperations.add_timestamp(img, datetime(2024, 1, 1, 0, 0, 0))

        assert np.array_equal(img, original_copy)


class TestProcessImage:
    """Tests for ImageOperations.process_image()"""

    def test_process_image_with_crop(self, tmp_path):
        """Test processing an image with cropping enabled."""
        img_path = tmp_path / "test.png"
        img = np.ones((100, 200, 3), dtype=np.uint8) * 128
        cv2.imwrite(str(img_path), img)

        options = {
            "crop_enabled": True,
            "crop_x": 10,
            "crop_y": 10,
            "crop_width": 50,
            "crop_height": 50,
        }

        result = ImageOperations.process_image(str(img_path), options)

        assert result is not None

    def test_process_image_nonexistent_file(self):
        """Test processing a non-existent file returns None."""
        result = ImageOperations.process_image("/nonexistent/file.png", {})
        assert result is None

    def test_process_image_no_options(self, tmp_path):
        """Test processing with empty options returns the image."""
        img_path = tmp_path / "test.png"
        img = np.ones((100, 100, 3), dtype=np.uint8) * 64
        cv2.imwrite(str(img_path), img)

        result = ImageOperations.process_image(str(img_path), {})

        assert result is not None
        assert result.shape == img.shape

    def test_process_image_with_interpolation_enabled(self, tmp_path):
        """Test process_image with interpolation flag set."""
        img_path = tmp_path / "test.png"
        img = np.ones((100, 100, 3), dtype=np.uint8) * 128
        cv2.imwrite(str(img_path), img)

        options = {
            "interpolation_enabled": True,
            "interpolation_factor": 2,
            "interpolation_method": "Linear",
        }

        result = ImageOperations.process_image(str(img_path), options)
        assert result is not None


class TestProcessImageStaticValidation:
    """Tests for ImageOperations.process_image() static validation method."""

    def test_none_image_returns_none(self):
        """Test that None input returns None."""
        result = ImageOperations.process_image(None, {})
        assert result is None

    def test_empty_image_returns_none(self):
        """Test that empty ndarray returns None."""
        result = ImageOperations.process_image(np.array([]), {})
        assert result is None


class TestInterpolateFrames:
    """Tests for ImageOperations.interpolate_frames() static method."""

    def test_linear_interpolation(self):
        """Test linear interpolation between two frames."""
        frame1 = np.zeros((50, 50, 3), dtype=np.uint8)
        frame2 = np.ones((50, 50, 3), dtype=np.uint8) * 255

        frames = ImageOperations.interpolate_frames(
            frame1, frame2, factor=2, method="Linear"
        )

        assert len(frames) == 1  # factor=2 produces 1 intermediate frame
        # The intermediate frame should have values near 127-128
        assert 120 < frames[0].mean() < 135

    def test_cubic_interpolation(self):
        """Test cubic interpolation between two frames."""
        frame1 = np.zeros((50, 50, 3), dtype=np.uint8)
        frame2 = np.ones((50, 50, 3), dtype=np.uint8) * 200

        frames = ImageOperations.interpolate_frames(
            frame1, frame2, factor=3, method="Cubic"
        )

        assert len(frames) == 2  # factor=3 produces 2 intermediate frames

    def test_interpolation_factor_1_returns_empty(self):
        """Test that factor=1 produces no intermediate frames."""
        frame1 = np.zeros((10, 10, 3), dtype=np.uint8)
        frame2 = np.ones((10, 10, 3), dtype=np.uint8) * 255

        frames = ImageOperations.interpolate_frames(frame1, frame2, factor=1)

        assert len(frames) == 0

    def test_interpolation_output_type(self):
        """Test that interpolated frames are uint8."""
        frame1 = np.zeros((10, 10, 3), dtype=np.uint8)
        frame2 = np.ones((10, 10, 3), dtype=np.uint8) * 255

        frames = ImageOperations.interpolate_frames(frame1, frame2, factor=4)

        for frame in frames:
            assert frame.dtype == np.uint8


class TestProcessImageBatch:
    """Tests for ImageOperations.process_image_batch()."""

    def test_empty_input_returns_empty(self):
        """Test that empty input returns empty list."""
        result = ImageOperations.process_image_batch([], {})
        assert result == []

    def test_batch_with_valid_images(self, tmp_path):
        """Test batch processing with valid images."""
        paths = []
        for i in range(3):
            img_path = tmp_path / f"test_{i}.png"
            img = np.ones((50, 50, 3), dtype=np.uint8) * (i * 50)
            cv2.imwrite(str(img_path), img)
            paths.append(img_path)

        result = ImageOperations.process_image_batch(paths, {})

        assert len(result) == 3
