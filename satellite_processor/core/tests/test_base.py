import pytest
from pathlib import Path
import tempfile
import shutil
from unittest.mock import patch, MagicMock


class VideoTestBase:
    """Base class for video processing tests with common utilities."""

    @pytest.fixture(autouse=True)
    def setup_test_environment(self, qtbot, monkeypatch):
        """Set up test environment with mocks and temp directories."""
        self.temp_dir = tempfile.mkdtemp()
        self.input_dir = Path(self.temp_dir) / "input"
        self.output_dir = Path(self.temp_dir) / "output"
        self.input_dir.mkdir(parents=True)
        self.output_dir.mkdir(parents=True)

        # Create test frames
        for i in range(5):
            (self.input_dir / f"frame{i:04d}.png").touch()

        # Mock filesystem operations
        def mock_exists(path):
            return True if str(path).startswith(str(self.temp_dir)) else False

        def mock_is_dir(path):
            return True if str(path).startswith(str(self.temp_dir)) else False

        monkeypatch.setattr("satellite_processor.core.file_manager.Path.exists", mock_exists)
        monkeypatch.setattr("satellite_processor.core.file_manager.Path.is_dir", mock_is_dir)

        # Mock FFmpeg
        self.ffmpeg_mock = MagicMock(return_value=MagicMock(returncode=0))
        monkeypatch.setattr("subprocess.run", self.ffmpeg_mock)

        yield

        # Cleanup
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def assert_validation_error(self, func, *args, expected_message):
        """Helper to test validation errors."""
        with pytest.raises(ValueError) as exc_info:
            func(*args)
        assert expected_message in str(exc_info.value)

    def create_test_video_options(self, **kwargs):
        """Create VideoOptionsWidget with specific settings."""
        from satellite_processor.gui.widgets.video_options import VideoOptionsWidget

        widget = VideoOptionsWidget()
        widget.testing = True

        # Apply settings
        if "fps" in kwargs:
            widget.fps_spinbox.setValue(kwargs["fps"])
        if "bitrate" in kwargs:
            widget.bitrate_spin.setValue(kwargs["bitrate"])
        if "encoder" in kwargs:
            widget.encoder_combo.setCurrentText(kwargs["encoder"])
        if "interpolation" in kwargs:
            widget.enable_interpolation.setChecked(kwargs["interpolation"])
        if "quality" in kwargs:
            widget.quality_combo.setCurrentText(kwargs["quality"])
        if "factor" in kwargs:
            widget.factor_spin.setValue(kwargs["factor"])

        return widget
