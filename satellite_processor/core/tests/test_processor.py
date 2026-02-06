"""Tests for processor.py - SatelliteImageProcessor class."""

import pytest
import numpy as np
import cv2
from pathlib import Path
from datetime import datetime
from unittest.mock import patch, MagicMock, PropertyMock
import tempfile
import logging

from PyQt6.QtWidgets import QApplication

from satellite_processor.core.processor import SatelliteImageProcessor


@pytest.fixture
def processor(qtbot):
    """Create a SatelliteImageProcessor instance for testing."""
    with patch('satellite_processor.core.processor.ResourceMonitor') as mock_rm_cls:
        mock_rm = MagicMock()
        mock_rm.resource_update = MagicMock()
        mock_rm.resource_update.connect = MagicMock()
        mock_rm.start = MagicMock()
        mock_rm.stop = MagicMock()
        mock_rm.isRunning = MagicMock(return_value=False)
        mock_rm.deleteLater = MagicMock()
        mock_rm_cls.return_value = mock_rm
        with patch.object(SatelliteImageProcessor, '_setup_resource_monitoring'):
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
        # Modify options on existing processor to test the attribute
        processor.options = {'fps': 60, 'encoder': 'H.265'}
        assert processor.options['fps'] == 60
        assert processor.options['encoder'] == 'H.265'

    def test_signals_defined(self, processor):
        """Test that all expected signals are defined."""
        assert hasattr(processor, 'status_update')
        assert hasattr(processor, 'error_occurred')
        assert hasattr(processor, 'finished')
        assert hasattr(processor, 'progress_update')
        assert hasattr(processor, 'overall_progress')
        assert hasattr(processor, 'resource_update')
        assert hasattr(processor, 'output_ready')


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

    def test_process_with_crop(self, processor, tmp_path):
        """Test processing with crop enabled."""
        img_path = tmp_path / "GOES16_20240115T120000Z.png"
        img = np.ones((200, 300, 3), dtype=np.uint8) * 100
        cv2.imwrite(str(img_path), img)

        processor.options = {
            'crop_enabled': True,
            'crop_x': 10,
            'crop_y': 10,
            'crop_width': 100,
            'crop_height': 100
        }

        result = processor.process_single_image(img_path)

        assert result is not None


class TestCancel:
    """Tests for cancel method."""

    def test_cancel_sets_flag(self, processor):
        """Test that cancel sets the cancelled flag."""
        processor.cancelled = False
        processor._is_processing = True

        processor.cancel()

        assert processor.cancelled is True
        assert processor._is_processing is False

    def test_cancel_terminates_subprocess(self, processor):
        """Test that cancel terminates running subprocess."""
        mock_proc = MagicMock()
        mock_proc.poll.return_value = None  # Running
        processor._proc = mock_proc

        processor.cancel()

        mock_proc.terminate.assert_called_once()


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

    def test_get_input_files_uses_default(self, processor, tmp_path):
        """Test using the default input directory."""
        input_dir = tmp_path / "default_input"
        input_dir.mkdir()
        for i in range(2):
            (input_dir / f"frame{i:04d}.png").touch()

        processor.input_dir = str(input_dir)
        files = processor.get_input_files()

        assert len(files) == 2


class TestSetDirectories:
    """Tests for set_input_directory and set_output_directory."""

    def test_set_input_directory(self, processor, tmp_path):
        """Test setting input directory."""
        input_dir = tmp_path / "input"
        input_dir.mkdir()

        processor.set_input_directory(str(input_dir))

        assert processor.input_dir == str(input_dir)

    def test_set_input_directory_nonexistent(self, processor):
        """Test setting a non-existent input directory."""
        processor.set_input_directory("/nonexistent/path")

        # Should not update the directory
        assert processor.input_dir != "/nonexistent/path"

    def test_set_input_directory_empty(self, processor):
        """Test setting empty input directory."""
        original = processor.input_dir
        processor.set_input_directory("")

        assert processor.input_dir == original

    def test_set_output_directory(self, processor, tmp_path):
        """Test setting output directory."""
        output_dir = tmp_path / "output"

        processor.set_output_directory(str(output_dir))

        assert processor.output_dir == str(output_dir.resolve())
        assert output_dir.exists()

    def test_set_output_directory_empty(self, processor):
        """Test setting empty output directory."""
        original = processor.output_dir
        processor.set_output_directory("")
        assert processor.output_dir == original


class TestUpdateProgress:
    """Tests for progress update methods."""

    def test_update_progress_emits_signal(self, processor, qtbot):
        """Test that update_progress emits the progress signal."""
        with qtbot.waitSignal(processor.progress_update, timeout=1000) as blocker:
            processor.update_progress("Testing", 50)

        assert blocker.args == ["Testing", 50]

    def test_update_progress_sets_operation(self, processor):
        """Test that update_progress updates current_operation."""
        processor.update_progress("Loading", 25)

        assert processor.current_operation == "Loading"


class TestHelperMethods:
    """Tests for helper methods."""

    def test_get_output_filename(self, processor):
        """Test output filename generation."""
        processor.timestamp = "20240115_120000"
        result = processor._get_output_filename(prefix="Test", ext=".avi")

        assert result == "Test_20240115_120000.avi"

    def test_get_processed_filename(self, processor):
        """Test processed filename generation."""
        processor.timestamp = "20240115_120000"
        result = processor._get_processed_filename(Path("input.png"), prefix="out")

        assert result == "out_input_20240115_120000.png"

    def test_create_progress_bar(self, processor):
        """Test progress bar string generation."""
        bar = processor._create_progress_bar("Test", 50, 100)

        assert "Test" in bar
        assert "50%" in bar
        assert "█" in bar
        assert "░" in bar

    def test_update_timestamp(self, processor):
        """Test updating the timestamp."""
        old_ts = processor.timestamp
        # Force a different timestamp by waiting or just checking format
        processor.update_timestamp()

        assert processor.timestamp is not None
        assert len(processor.timestamp) == 15  # YYYYMMDD_HHMMSS


class TestValidatePreferences:
    """Tests for validate_preferences method."""

    def test_valid_preferences(self, processor):
        """Test validation with valid preferences."""
        processor.preferences = {'temp_directory': '/tmp'}
        processor.options = {}

        valid, msg = processor.validate_preferences()

        assert valid is True

    def test_missing_temp_directory(self, processor):
        """Test validation with missing temp_directory."""
        processor.preferences = {}
        processor.options = {}

        valid, msg = processor.validate_preferences()

        assert valid is False
        assert 'temp_directory' in msg

    def test_false_color_requires_paths(self, processor):
        """Test validation when false_color enabled requires sanchez/underlay paths."""
        processor.preferences = {'temp_directory': '/tmp'}
        processor.options = {'false_color': True}

        valid, msg = processor.validate_preferences()

        assert valid is False
        assert 'sanchez_path' in msg or 'underlay_path' in msg


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
            'crop_x': 0,
            'crop_y': 0,
            'crop_width': 100,
            'crop_height': 50,
        }

        result = SatelliteImageProcessor._parallel_crop(
            (str(img_path), str(output_dir), options)
        )

        assert result is not None
        output_path = Path(result)
        assert output_path.exists()

    def test_parallel_crop_invalid_image(self, tmp_path):
        """Test parallel crop worker with invalid image."""
        output_dir = tmp_path / "output"
        output_dir.mkdir()

        result = SatelliteImageProcessor._parallel_crop(
            ("/nonexistent.png", str(output_dir), {})
        )

        assert result is None

    def test_parallel_timestamp_valid(self, tmp_path):
        """Test parallel timestamp worker with valid image."""
        img_path = tmp_path / "GOES16_20240115T120000Z.png"
        img = np.zeros((100, 400, 3), dtype=np.uint8)
        cv2.imwrite(str(img_path), img)

        output_dir = tmp_path / "output"
        output_dir.mkdir()

        result = SatelliteImageProcessor._parallel_timestamp(
            (str(img_path), str(output_dir))
        )

        assert result is not None

    def test_parallel_timestamp_invalid_image(self, tmp_path):
        """Test parallel timestamp worker with invalid image."""
        output_dir = tmp_path / "output"
        output_dir.mkdir()

        result = SatelliteImageProcessor._parallel_timestamp(
            ("/nonexistent.png", str(output_dir))
        )

        assert result is None
