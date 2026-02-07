"""Tests for GUI widget components using pytest-qt."""

import pytest
from unittest.mock import patch, MagicMock

from PyQt6.QtWidgets import QProgressBar

from satellite_processor.gui.widgets.video_options import (
    VideoOptionsWidget,
)
from satellite_processor.gui.widgets.system_monitor_widget import (
    SystemMonitorWidget,
)


class TestVideoOptionsWidget:
    """Tests for the VideoOptionsWidget GUI component."""

    @pytest.fixture
    def widget(self, qtbot):
        """Create a VideoOptionsWidget for testing.

        Uses subprocess.run mock to guard against ffmpeg calls
        that VideoHandler may trigger during import-time side
        effects.
        """
        with patch(
            "subprocess.run",
            return_value=MagicMock(returncode=0),
        ):
            w = VideoOptionsWidget()
            w.testing = False
            qtbot.addWidget(w)
            yield w

    def test_default_fps(self, widget):
        """Default FPS should be 30."""
        assert widget.fps_spinbox.value() == 30

    def test_default_bitrate(self, widget):
        """Default bitrate should be 5000 kbps."""
        assert widget.bitrate_spin.value() == 5000

    def test_default_interpolation_enabled(self, widget):
        """Interpolation should be enabled by default."""
        assert widget.enable_interpolation.isChecked() is True

    def test_fps_spinbox_range(self, widget):
        """FPS spinbox range should be 1 to 60."""
        assert widget.fps_spinbox.minimum() == 1
        assert widget.fps_spinbox.maximum() == 60

    def test_bitrate_spinbox_range(self, widget):
        """Bitrate spinbox range should be 100 to 10000."""
        assert widget.bitrate_spin.minimum() == 100
        assert widget.bitrate_spin.maximum() == 10000

    def test_hardware_switching_updates_encoder_options(self, widget, qtbot):
        """Changing hardware should update encoder combo items."""
        widget.hardware_combo.setCurrentText("NVIDIA GPU")
        qtbot.wait(50)
        nvidia_encoders = [
            widget.encoder_combo.itemText(i)
            for i in range(widget.encoder_combo.count())
        ]
        assert "NVIDIA NVENC H.264" in nvidia_encoders
        assert "NVIDIA NVENC HEVC" in nvidia_encoders

        widget.hardware_combo.setCurrentText("CPU")
        qtbot.wait(50)
        cpu_encoders = [
            widget.encoder_combo.itemText(i)
            for i in range(widget.encoder_combo.count())
        ]
        assert "NVIDIA NVENC H.264" not in cpu_encoders
        assert "H.264" in cpu_encoders

    def test_reset_to_defaults(self, widget):
        """reset_to_defaults should restore all widget values."""
        widget.fps_spinbox.setValue(45)
        widget.bitrate_spin.setValue(8000)
        widget.enable_interpolation.setChecked(False)
        widget.enable_transcoding.setChecked(True)

        widget.reset_to_defaults()

        assert widget.fps_spinbox.value() == 30
        assert widget.bitrate_spin.value() == 5000
        assert widget.enable_interpolation.isChecked() is True
        assert widget.hardware_combo.currentIndex() == 0
        assert widget.encoder_combo.currentIndex() == 0
        assert widget.quality_combo.currentIndex() == 0
        assert widget.factor_spin.value() == 2
        assert widget.enable_transcoding.isChecked() is False

    def test_get_options_keys(self, widget):
        """get_options should return all expected dictionary keys."""
        options = widget.get_options()
        expected_keys = {
            "fps",
            "bitrate",
            "encoder",
            "hardware",
            "interpolation_enabled",
            "interpolation_factor",
            "interpolation_quality",
            "transcoding_enabled",
            "transcoding_quality",
            "frame_duration",
            "custom_ffmpeg_options",
        }
        assert expected_keys.issubset(set(options.keys()))

    def test_interpolation_toggle_disables_controls(self, widget):
        """Unchecking interpolation disables quality and factor."""
        widget.enable_interpolation.setChecked(False)
        assert widget.quality_combo.isEnabled() is False
        assert widget.factor_spin.isEnabled() is False

    def test_interpolation_toggle_enables_controls(self, widget):
        """Re-checking interpolation enables quality and factor."""
        widget.enable_interpolation.setChecked(False)
        widget.enable_interpolation.setChecked(True)
        assert widget.quality_combo.isEnabled() is True
        assert widget.factor_spin.isEnabled() is True

    def test_transcoding_toggle_shows_options(self, widget, qtbot):
        """Enabling transcoding shows the options group."""
        widget.show()
        qtbot.wait(50)
        assert widget.transcoding_options_group.isVisible() is False

        widget.enable_transcoding.setChecked(True)
        qtbot.wait(100)
        assert widget.transcoding_options_group.isVisible() is True

    def test_transcoding_toggle_hides_options(self, widget, qtbot):
        """Disabling transcoding hides the options group."""
        widget.show()
        qtbot.wait(50)
        widget.enable_transcoding.setChecked(True)
        qtbot.wait(100)

        widget.enable_transcoding.setChecked(False)
        qtbot.wait(100)
        assert widget.transcoding_options_group.isVisible() is False


class TestSystemMonitorWidget:
    """Tests for the SystemMonitorWidget GUI component."""

    @pytest.fixture
    def widget(self, qtbot):
        """Create a SystemMonitorWidget for testing.

        Stops the periodic update timer to prevent background
        activity during tests.
        """
        w = SystemMonitorWidget()
        w.update_timer.stop()
        qtbot.addWidget(w)
        return w

    def test_has_progress_bars(self, widget):
        """Widget should have CPU, RAM, upload, and download bars."""
        assert isinstance(widget.cpu_bar, QProgressBar)
        assert isinstance(widget.ram_bar, QProgressBar)
        assert isinstance(widget.upload_bar, QProgressBar)
        assert isinstance(widget.download_bar, QProgressBar)

    def test_cpu_bar_range(self, widget):
        """CPU progress bar should have range 0-100."""
        assert widget.cpu_bar.minimum() == 0
        assert widget.cpu_bar.maximum() == 100

    def test_ram_bar_range(self, widget):
        """RAM progress bar should have range 0-100."""
        assert widget.ram_bar.minimum() == 0
        assert widget.ram_bar.maximum() == 100

    def test_update_stats_does_not_crash(self, widget):
        """Calling update_stats should not raise exceptions."""
        with patch("psutil.cpu_percent", return_value=50.0), patch(
            "psutil.virtual_memory"
        ) as mock_mem, patch("psutil.net_io_counters") as mock_net:
            mock_mem.return_value = MagicMock(percent=60.0)
            mock_net.return_value = MagicMock(bytes_sent=1024, bytes_recv=2048)
            widget._update_pending = False
            widget._last_update = 0
            widget.update_stats()

    def test_format_bytes_bytes(self, widget):
        """Values under 1 KB should format as bytes."""
        assert widget._format_bytes(500) == "500.0 B"

    def test_format_bytes_kilobytes(self, widget):
        """1024 bytes should format as 1.0 KB."""
        assert widget._format_bytes(1024) == "1.0 KB"

    def test_format_bytes_megabytes(self, widget):
        """1 MB should format as 1.0 MB."""
        assert widget._format_bytes(1024 * 1024) == "1.0 MB"

    def test_format_bytes_gigabytes(self, widget):
        """1 GB should format as 1.0 GB."""
        assert widget._format_bytes(1024**3) == "1.0 GB"
