"""Tests for GUI widgets and dialogs to boost coverage.

Covers ProcessingOptionsWidget, NetworkWidget, LogWidget,
PresetDialog, and AboutDialog.
"""

import importlib.util
from pathlib import Path

import pytest
from unittest.mock import patch, MagicMock

from PyQt6.QtWidgets import QLabel, QDialogButtonBox

from satellite_processor.gui.widgets.processing_options import (
    ProcessingOptionsWidget,
)
from satellite_processor.gui.widgets.network_widget import NetworkWidget
from satellite_processor.gui.widgets.log_widget import LogWidget

# dialogs.py is shadowed by the dialogs/ package so we load it directly
# with the correct package context for relative imports.
_dialogs_path = Path(__file__).resolve().parents[2] / "gui" / "dialogs.py"
_spec = importlib.util.spec_from_file_location(
    "satellite_processor.gui._dialogs_file", _dialogs_path
)
_dialogs_mod = importlib.util.module_from_spec(_spec)
_dialogs_mod.__package__ = "satellite_processor.gui"
_spec.loader.exec_module(_dialogs_mod)
AboutDialog = _dialogs_mod.AboutDialog
PresetDialog = _dialogs_mod.PresetDialog

# ---------------------------------------------------------------------------
# ProcessingOptionsWidget
# ---------------------------------------------------------------------------


class TestProcessingOptionsWidget:
    """Tests for the ProcessingOptionsWidget GUI component."""

    @pytest.fixture
    def widget(self, qtbot):
        """Create a ProcessingOptionsWidget with mocked config."""
        with patch(
            "satellite_processor.gui.widgets.processing_options.load_config",
            return_value={},
        ):
            w = ProcessingOptionsWidget()
            qtbot.addWidget(w)
            yield w

    def test_init_creates_widgets(self, widget):
        """Widget should have all expected child widgets after init."""
        assert widget.crop_enabled is not None
        assert widget.fps_spin is not None
        assert widget.codec_combo is not None
        assert widget.hardware_combo is not None
        assert widget.frame_duration_spin is not None
        assert widget.add_timestamp is not None
        assert widget.enable_false_color is not None
        assert widget.sanchez_method is not None
        assert widget.enable_interpolation is not None
        assert widget.interp_method is not None
        assert widget.interp_quality is not None
        assert widget.interp_factor is not None

    def test_default_values(self, widget):
        """Verify sensible default values after construction."""
        assert widget.fps_spin.value() == 30
        assert widget.crop_enabled.isChecked() is False
        assert widget.add_timestamp.isChecked() is True
        assert widget.enable_interpolation.isChecked() is False

    def test_get_options_returns_all_keys(self, widget):
        """get_options should return a dict with every expected key."""
        options = widget.get_options()
        expected_keys = {
            "crop_enabled",
            "crop_x",
            "crop_y",
            "crop_width",
            "crop_height",
            "add_timestamp",
            "fps",
            "codec",
            "hardware",
            "frame_duration",
            "false_color_enabled",
            "false_color_method",
            "interpolation_enabled",
            "interpolation_method",
            "interpolation_quality",
            "interpolation_factor",
        }
        assert expected_keys == set(options.keys())

    def test_load_options(self, widget):
        """load_options should update widgets to match the supplied dict."""
        options = {
            "crop_enabled": True,
            "add_timestamp": False,
            "fps": 24,
            "codec": "AV1 (Best Quality)",
            "hardware": "CPU",
            "frame_duration": 2.5,
            "false_color_enabled": True,
            "false_color_method": "Fire",
            "interpolation_enabled": True,
            "interpolation_method": "Bidirectional",
            "interpolation_quality": "high",
            "interpolation_factor": 4,
        }
        widget.load_options(options)

        assert widget.crop_enabled.isChecked() is True
        assert widget.add_timestamp.isChecked() is False
        assert widget.fps_spin.value() == 24
        assert widget.codec_combo.currentText() == "AV1 (Best Quality)"
        assert widget.frame_duration_spin.value() == 2.5
        assert widget.enable_false_color.isChecked() is True
        assert widget.sanchez_method.currentText() == "Fire"
        assert widget.enable_interpolation.isChecked() is True
        assert widget.interp_method.currentText() == "Bidirectional"
        assert widget.interp_quality.currentText() == "High (Best Quality)"
        assert widget.interp_factor.value() == 4

    def test_interpolation_toggle(self, widget):
        """Enabling interpolation should enable its child controls."""
        # Initially disabled
        assert widget.interp_method.isEnabled() is False
        assert widget.interp_quality.isEnabled() is False
        assert widget.interp_factor.isEnabled() is False

        widget.enable_interpolation.setChecked(True)

        assert widget.interp_method.isEnabled() is True
        assert widget.interp_quality.isEnabled() is True
        assert widget.interp_factor.isEnabled() is True

    def test_false_color_toggle(self, widget):
        """Enabling false color should enable the method combo."""
        widget.enable_false_color.setChecked(True)
        assert widget.sanchez_method.isEnabled() is True

        widget.enable_false_color.setChecked(False)
        assert widget.sanchez_method.isEnabled() is False

    def test_load_settings_from_config(self, qtbot):
        """Widget should load values from config on construction."""
        mock_config = {
            "processing_options": {
                "crop_enabled": True,
                "crop_x": 100,
                "crop_y": 200,
                "crop_width": 800,
                "crop_height": 600,
                "add_timestamp": False,
                "fps": 15,
                "codec": "AV1 (Best Quality)",
                "hardware": "CPU",
                "frame_duration": 3.0,
                "false_color_enabled": True,
                "false_color_method": "Enhanced",
                "interpolation_enabled": True,
                "interpolation_method": "Bidirectional",
                "interpolation_factor": 4,
            }
        }
        with patch(
            "satellite_processor.gui.widgets.processing_options.load_config",
            return_value=mock_config,
        ):
            w = ProcessingOptionsWidget()
            qtbot.addWidget(w)

        assert w.crop_enabled.isChecked() is True
        assert w.crop_x.value() == 100
        assert w.crop_y.value() == 200
        assert w.crop_width.value() == 800
        assert w.crop_height.value() == 600
        assert w.add_timestamp.isChecked() is False
        assert w.fps_spin.value() == 15
        assert w.codec_combo.currentText() == "AV1 (Best Quality)"
        assert w.frame_duration_spin.value() == 3.0
        assert w.enable_false_color.isChecked() is True
        assert w.sanchez_method.currentText() == "Enhanced"
        assert w.enable_interpolation.isChecked() is True
        assert w.interp_factor.value() == 4


# ---------------------------------------------------------------------------
# NetworkWidget
# ---------------------------------------------------------------------------


class TestNetworkWidget:
    """Tests for the NetworkWidget GUI component."""

    @pytest.fixture
    def widget(self, qtbot):
        """Create a NetworkWidget and stop its timer."""
        w = NetworkWidget()
        w.timer.stop()
        qtbot.addWidget(w)
        return w

    def test_init(self, widget):
        """Widget should have upload/download bars and speed labels."""
        assert widget.upload_bar is not None
        assert widget.download_bar is not None
        assert widget.upload_speed is not None
        assert widget.download_speed is not None

    def test_format_bytes_kb(self, widget):
        """2048 bytes should format as 2.0 KB."""
        assert widget._format_bytes(2048) == "2.0 KB"

    def test_format_bytes_mb(self, widget):
        """5 MB should format as 5.0 MB."""
        assert widget._format_bytes(5 * 1024 * 1024) == "5.0 MB"

    def test_update_network_stats(self, widget):
        """update_network_stats should update bars and speed labels."""
        net_io = MagicMock(bytes_sent=1000, bytes_recv=2000)
        widget.update_network_stats(1024, 2048, net_io)

        assert widget.upload_bar.value() >= 0
        assert widget.download_bar.value() >= 0
        assert "KB" in widget.upload_speed.text() or "B" in widget.upload_speed.text()
        assert (
            "KB" in widget.download_speed.text() or "B" in widget.download_speed.text()
        )


# ---------------------------------------------------------------------------
# LogWidget
# ---------------------------------------------------------------------------


class TestLogWidget:
    """Tests for the LogWidget GUI component."""

    @pytest.fixture
    def widget(self, qtbot):
        """Create a LogWidget for testing."""
        w = LogWidget()
        qtbot.addWidget(w)
        return w

    def test_init(self, widget):
        """LogWidget should be read-only."""
        assert widget.isReadOnly() is True

    def test_append_message(self, widget):
        """append_message should add text to the widget."""
        widget.append_message("test")
        assert "test" in widget.toPlainText()

    def test_append_error(self, widget):
        """append_error should include 'Error' in the HTML output."""
        widget.append_error("bad")
        assert "Error" in widget.toHtml()

    def test_clear_log(self, widget):
        """clear_log should remove all content."""
        widget.append_message("some text")
        widget.clear_log()
        assert widget.toPlainText().strip() == ""


# ---------------------------------------------------------------------------
# AboutDialog
# ---------------------------------------------------------------------------


class TestAboutDialog:
    """Tests for the AboutDialog."""

    @pytest.fixture
    def dialog(self, qtbot):
        """Create an AboutDialog for testing."""
        d = AboutDialog()
        qtbot.addWidget(d)
        return d

    def test_about_dialog_init(self, dialog):
        """Window title should contain 'About'."""
        assert "About" in dialog.windowTitle()

    def test_about_dialog_has_label(self, dialog):
        """Dialog should contain a QLabel with the application name."""
        labels = dialog.findChildren(QLabel)
        texts = [label.text() for label in labels]
        assert any("Satellite Image Processor" in t for t in texts)


# ---------------------------------------------------------------------------
# PresetDialog
# ---------------------------------------------------------------------------


class TestPresetDialog:
    """Tests for the PresetDialog."""

    @pytest.fixture
    def dialog(self, qtbot):
        """Create a PresetDialog for testing."""
        d = PresetDialog(params={"fps": 30})
        qtbot.addWidget(d)
        return d

    def test_preset_dialog_init(self, dialog):
        """Dialog should have name_input and description fields."""
        assert dialog.name_input is not None
        assert dialog.description is not None

    def test_preset_dialog_has_buttons(self, dialog):
        """Dialog should contain a QDialogButtonBox."""
        button_boxes = dialog.findChildren(QDialogButtonBox)
        assert len(button_boxes) > 0


# ---------------------------------------------------------------------------
# SettingsDialog (from dialogs/ package)
# ---------------------------------------------------------------------------

from satellite_processor.gui.dialogs.settings_dialog import SettingsDialog


class TestSettingsDialog:
    """Tests for the SettingsDialog."""

    @pytest.fixture
    def dialog(self, qtbot):
        """Create a SettingsDialog with mocked config."""
        with patch(
            "satellite_processor.gui.dialogs.settings_dialog.load_config",
            return_value={},
        ):
            d = SettingsDialog()
            qtbot.addWidget(d)
            yield d

    def test_init(self, dialog):
        """Window title should be 'Settings'."""
        assert dialog.windowTitle() == "Settings"

    def test_has_input_fields(self, dialog):
        """Dialog should have path input fields."""
        assert dialog.input_dir is not None
        assert dialog.output_dir is not None
        assert dialog.sanchez_path is not None
        assert dialog.underlay_path is not None

    def test_has_button_box(self, dialog):
        """Dialog should contain a QDialogButtonBox."""
        button_boxes = dialog.findChildren(QDialogButtonBox)
        assert len(button_boxes) > 0

    def test_load_settings_populates_fields(self, qtbot):
        """load_settings should populate input fields from config."""
        mock_config = {
            "sanchez_path": "/path/to/sanchez",
            "underlay_path": "/path/to/underlay.jpg",
            "last_input_dir": "/input/dir",
            "last_output_dir": "/output/dir",
        }
        with patch(
            "satellite_processor.gui.dialogs.settings_dialog.load_config",
            return_value=mock_config,
        ):
            d = SettingsDialog()
            qtbot.addWidget(d)

        assert d.sanchez_path.text() == "/path/to/sanchez"
        assert d.underlay_path.text() == "/path/to/underlay.jpg"
        assert d.input_dir.text() == "/input/dir"
        assert d.output_dir.text() == "/output/dir"

    def test_minimum_width(self, dialog):
        """Dialog should have minimum width of 600."""
        assert dialog.minimumWidth() == 600
