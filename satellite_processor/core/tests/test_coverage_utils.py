"""Tests for utility modules to boost coverage."""

import json
import logging
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from satellite_processor.utils.helpers import parse_satellite_timestamp
from satellite_processor.utils.logging_config import setup_logging
from satellite_processor.utils.presets import PresetManager
from satellite_processor.utils.url_handler import (
    create_file_url,
    create_link_data,
    normalize_path,
)
from satellite_processor.utils.utils import (
    calculate_uits,
    get_default_settings,
    is_closing,
    load_config,
    save_config,
    validate_uits,
)


class TestGetDefaultSettings:
    def test_returns_dict(self):
        result = get_default_settings()
        assert isinstance(result, dict)

    def test_has_expected_keys(self):
        result = get_default_settings()
        assert "last_input_dir" in result
        assert "last_output_dir" in result
        assert "sanchez_path" in result
        assert "window_size" in result
        assert "window_pos" in result


class TestLoadSaveConfig:
    def test_load_config_no_file(self, tmp_path):
        config_path = tmp_path / "nonexistent.json"
        result = load_config(config_path)
        assert isinstance(result, dict)
        assert "last_input_dir" in result

    def test_save_then_load(self, tmp_path):
        config_path = tmp_path / "config.json"
        config = {"test_key": "test_value", "number": 42}
        assert save_config(config, config_path) is True

        loaded = load_config(config_path)
        assert loaded["test_key"] == "test_value"
        assert loaded["number"] == 42

    def test_save_creates_parent_dirs(self, tmp_path):
        config_path = tmp_path / "subdir" / "deep" / "config.json"
        assert save_config({"key": "val"}, config_path) is True
        assert config_path.exists()

    def test_load_corrupt_file(self, tmp_path):
        config_path = tmp_path / "bad.json"
        config_path.write_text("not valid json{{{")
        result = load_config(config_path)
        # Should return defaults on error
        assert isinstance(result, dict)

    def test_load_merges_with_defaults(self, tmp_path):
        config_path = tmp_path / "partial.json"
        config_path.write_text(json.dumps({"custom_key": "custom_value"}))
        result = load_config(config_path)
        assert result["custom_key"] == "custom_value"
        assert "last_input_dir" in result  # defaults merged in


class TestIsClosing:
    def test_not_closing(self):
        obj = MagicMock(spec=[])
        assert is_closing(obj) is False

    def test_is_closing_true(self):
        obj = MagicMock()
        obj._is_closing = True
        assert is_closing(obj) is True

    def test_is_closing_false(self):
        obj = MagicMock()
        obj._is_closing = False
        assert is_closing(obj) is False


class TestCalculateUits:
    def test_returns_float(self):
        result = calculate_uits({})
        assert isinstance(result, float)

    def test_returns_zero(self):
        assert calculate_uits({"fps": 30}) == 0.0


class TestValidateUits:
    def test_returns_bool(self):
        assert validate_uits(0.5) is True

    def test_zero_valid(self):
        assert validate_uits(0.0) is True


class TestParseTimestamp:
    def test_valid_timestamp(self):
        result = parse_satellite_timestamp("GOES16_20230615T120000Z.png")
        assert result.year == 2023
        assert result.month == 6
        assert result.day == 15
        assert result.hour == 12

    def test_no_timestamp(self):
        from datetime import datetime

        result = parse_satellite_timestamp("random_file.png")
        assert result == datetime.min

    def test_invalid_format(self):
        from datetime import datetime

        result = parse_satellite_timestamp("20230615_120000.png")
        assert result == datetime.min


class TestSetupLogging:
    def test_basic_setup(self):
        # Remove existing handlers to test clean
        root = logging.getLogger()
        original_handlers = root.handlers[:]

        setup_logging()

        # Should have added at least a console handler
        assert len(root.handlers) > 0

        # Cleanup: restore original handlers
        root.handlers = original_handlers

    def test_debug_mode(self):
        root = logging.getLogger()
        original_handlers = root.handlers[:]
        original_level = root.level

        setup_logging(debug=True)
        assert root.level == logging.DEBUG

        root.handlers = original_handlers
        root.level = original_level

    def test_with_log_dir(self, tmp_path):
        root = logging.getLogger()
        original_handlers = root.handlers[:]

        log_dir = tmp_path / "logs"
        setup_logging(log_dir=str(log_dir))

        assert log_dir.exists()
        log_files = list(log_dir.glob("*.log"))
        assert len(log_files) >= 1

        root.handlers = original_handlers


class TestNormalizePath:
    def test_normalizes_relative(self):
        result = normalize_path("./test.txt")
        assert Path(result).is_absolute()

    def test_absolute_unchanged(self, tmp_path):
        p = str(tmp_path / "file.txt")
        result = normalize_path(p)
        assert result == p


class TestCreateFileUrl:
    def test_returns_file_url(self, tmp_path):
        p = str(tmp_path / "test.txt")
        result = create_file_url(p)
        assert result.startswith("file://")
        assert "test.txt" in result


class TestCreateLinkData:
    def test_returns_dict(self, tmp_path):
        p = tmp_path / "image.png"
        result = create_link_data(p)
        assert "url" in result
        assert "display_name" in result
        assert result["display_name"] == "image.png"


try:
    import pytestqt  # noqa: F401
    _has_qt = True
except ImportError:
    _has_qt = False


@pytest.mark.skipif(not _has_qt, reason="pytest-qt not installed")
class TestPresetManager:
    def test_save_and_load_preset(self, qapp):
        pm = PresetManager()
        # Clean slate
        pm.settings.clear()

        params = {"fps": 30, "encoder": "H.264"}
        pm.save_preset("test_preset", params)

        loaded = pm.load_preset("test_preset")
        assert loaded["fps"] == 30
        assert loaded["encoder"] == "H.264"

        # Cleanup
        pm.settings.clear()

    def test_get_presets_empty(self, qapp):
        pm = PresetManager()
        pm.settings.clear()
        result = pm.get_presets()
        assert isinstance(result, dict)

    def test_delete_preset(self, qapp):
        pm = PresetManager()
        pm.settings.clear()

        pm.save_preset("to_delete", {"fps": 24})
        pm.delete_preset("to_delete")

        loaded = pm.load_preset("to_delete")
        assert loaded == {}

        pm.settings.clear()

    def test_export_presets(self, qapp, tmp_path):
        pm = PresetManager()
        pm.settings.clear()

        pm.save_preset("export_test", {"fps": 60})
        export_path = tmp_path / "presets.json"
        assert pm.export_presets(export_path) is True
        assert export_path.exists()

        data = json.loads(export_path.read_text())
        assert "export_test" in data

        pm.settings.clear()

    def test_import_presets(self, qapp, tmp_path):
        pm = PresetManager()
        pm.settings.clear()

        # Write a presets file
        presets = {
            "imported": {"params": {"fps": 48, "bitrate": 8000}},
        }
        import_path = tmp_path / "import.json"
        import_path.write_text(json.dumps(presets))

        assert pm.import_presets(import_path) is True
        loaded = pm.load_preset("imported")
        assert loaded["fps"] == 48

        pm.settings.clear()

    def test_load_nonexistent_preset(self, qapp):
        pm = PresetManager()
        pm.settings.clear()
        result = pm.load_preset("does_not_exist")
        assert result == {}
        pm.settings.clear()

    def test_preset_exists(self, qapp):
        pm = PresetManager()
        pm.settings.clear()

        pm.save_preset("exists_test", {"fps": 30})
        presets = pm.get_presets()
        assert "exists_test" in presets

        pm.settings.clear()
