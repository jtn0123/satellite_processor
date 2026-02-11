"""Tests for processor.py - SatelliteImageProcessor class."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest

from satellite_processor.core.processor import SatelliteImageProcessor


@pytest.fixture
def processor():
    """Create a SatelliteImageProcessor instance for testing."""
    with patch("satellite_processor.core.processor.ResourceMonitor") as mock_rm_cls:
        mock_rm = MagicMock()
        mock_rm.resource_update = MagicMock()
        mock_rm.resource_update.connect = MagicMock()
        mock_rm.start = MagicMock()
        mock_rm.stop = MagicMock()
        mock_rm.isRunning = MagicMock(return_value=False)
        mock_rm.deleteLater = MagicMock()
        mock_rm_cls.return_value = mock_rm
        proc = SatelliteImageProcessor(options={})
        yield proc
        proc._is_deleted = True


class TestProcessorInit:
    """Tests for SatelliteImageProcessor initialization."""

    def test_default_init(self, processor):
        """Test default initialization values."""
        assert processor.cancelled is False
        assert processor._is_processing is False
        assert processor.options == {}
        assert processor.max_workers > 0
        assert processor.chunk_size > 0

    def test_init_with_options(self, processor):
        """Test initialization with custom options."""
        processor.options = {"fps": 60, "encoder": "H.265"}
        assert processor.options["fps"] == 60
        assert processor.options["encoder"] == "H.265"


class TestProcessSingleImage:
    """Tests for process_single_image method."""

    def test_process_valid_image(self, processor, tmp_path):
        """Test processing a valid image."""
        img_path = tmp_path / "GOES16_20240115T120000Z_ch13.png"
        img = np.ones((100, 100, 3), dtype=np.uint8) * 128
        cv2.imwrite(str(img_path), img)

        result = processor.process_single_image(img_path)
        assert result is not None
        assert isinstance(result, np.ndarray)

    def test_process_nonexistent_image(self, processor):
        """Test processing a non-existent image returns None."""
        result = processor.process_single_image(Path("/nonexistent/image.png"))
        assert result is None


class TestCancel:
    """Tests for cancel method."""

    def test_cancel_sets_flag(self, processor):
        """Test that cancel sets the cancelled flag."""
        processor.cancelled = False
        processor._is_processing = True
        processor.cancel()
        assert processor.cancelled is True
        assert processor._is_processing is False


class TestGetInputFiles:
    """Tests for get_input_files method."""

    def test_get_input_files_delegates(self, processor, tmp_path):
        """Test that get_input_files delegates to FileManager."""
        input_dir = tmp_path / "input"
        input_dir.mkdir()
        for i in range(3):
            (input_dir / f"frame{i:04d}.png").touch()

        files = processor.get_input_files(str(input_dir))
        assert len(files) == 3


class TestSetDirectories:
    """Tests for set_input_directory and set_output_directory."""

    def test_set_input_directory(self, processor, tmp_path):
        """Test setting input directory."""
        input_dir = tmp_path / "input"
        input_dir.mkdir()
        processor.set_input_directory(str(input_dir))
        assert processor.input_dir == str(input_dir)

    def test_set_output_directory(self, processor, tmp_path):
        """Test setting output directory."""
        output_dir = tmp_path / "output"
        processor.set_output_directory(str(output_dir))
        assert processor.output_dir == str(output_dir.resolve())
        assert output_dir.exists()


class TestHelperMethods:
    """Tests for helper methods."""

    def test_get_output_filename(self, processor):
        """Test output filename generation."""
        processor.timestamp = "20240115_120000"
        result = processor._get_output_filename(prefix="Test", ext=".avi")
        assert result == "Test_20240115_120000.avi"

    def test_update_timestamp(self, processor):
        """Test updating the timestamp."""
        processor.update_timestamp()
        assert processor.timestamp is not None
        assert len(processor.timestamp) == 15  # YYYYMMDD_HHMMSS


class TestParallelWorkers:
    """Tests for static parallel worker methods."""

    def test_parallel_crop_valid(self, tmp_path):
        """Test parallel crop worker with valid input."""
        img_path = tmp_path / "test.png"
        img = np.ones((100, 200, 3), dtype=np.uint8) * 128
        cv2.imwrite(str(img_path), img)

        output_dir = tmp_path / "output"
        output_dir.mkdir()

        options = {
            "crop_x": 0, "crop_y": 0,
            "crop_width": 100, "crop_height": 50,
        }

        result = SatelliteImageProcessor._parallel_crop(
            (str(img_path), str(output_dir), options)
        )
        assert result is not None

    def test_parallel_crop_invalid_image(self, tmp_path):
        """Test parallel crop worker with invalid image."""
        output_dir = tmp_path / "output"
        output_dir.mkdir()

        result = SatelliteImageProcessor._parallel_crop(
            ("/nonexistent.png", str(output_dir), {})
        )
        assert result is None
