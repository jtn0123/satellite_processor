"""Real tests for settings_manager.py — uses tmp_path, no mocking."""

import json
import os

import pytest

from satellite_processor.core.settings_manager import SettingsManager


@pytest.fixture
def settings_mgr(tmp_path, monkeypatch):
    """Create a real SettingsManager using a temp directory."""
    monkeypatch.setenv("SETTINGS_DIR", str(tmp_path))
    mgr = SettingsManager()
    return mgr


class TestSettingsManager:
    def test_defaults_created(self, settings_mgr, tmp_path):
        assert (tmp_path / "settings.json").exists()
        assert settings_mgr.get("last_fps") == 30

    def test_get_default(self, settings_mgr):
        assert settings_mgr.get("nonexistent", "fallback") == "fallback"

    def test_set_and_get(self, settings_mgr):
        settings_mgr.set("last_fps", 60)
        assert settings_mgr.get("last_fps") == 60

    def test_set_persists(self, settings_mgr, tmp_path, monkeypatch):
        settings_mgr.set("last_fps", 24)
        # Create new instance to verify persistence
        mgr2 = SettingsManager()
        assert mgr2.get("last_fps") == 24

    def test_set_path_resolves(self, settings_mgr, tmp_path):
        settings_mgr.set("input_dir", str(tmp_path / "subdir"))
        val = settings_mgr.get("input_dir")
        assert "subdir" in val

    def test_update_multiple(self, settings_mgr):
        settings_mgr.update({"last_fps": 15, "crop_enabled": True})
        assert settings_mgr.get("last_fps") == 15
        assert settings_mgr.get("crop_enabled") is True

    def test_validate_preferences_ok(self, settings_mgr, tmp_path):
        settings_mgr.set("temp_directory", str(tmp_path))
        valid, msg = settings_mgr.validate_preferences()
        assert valid is True
        assert msg == ""

    def test_validate_preferences_missing_temp(self, settings_mgr):
        settings_mgr.settings["temp_directory"] = ""
        valid, msg = settings_mgr.validate_preferences()
        assert valid is False
        assert "temp_directory" in msg

    def test_validate_preferences_false_color_missing(self, settings_mgr, tmp_path):
        settings_mgr.settings["false_color"] = True
        settings_mgr.settings["temp_directory"] = str(tmp_path)
        settings_mgr.settings["sanchez_path"] = ""
        settings_mgr.settings["underlay_path"] = ""
        valid, msg = settings_mgr.validate_preferences()
        assert valid is False
        assert "sanchez_path" in msg

    def test_load_preference_alias(self, settings_mgr):
        assert settings_mgr.load_preference("last_fps") == settings_mgr.get("last_fps")

    def test_save_preference_alias(self, settings_mgr):
        settings_mgr.save_preference("last_fps", 120)
        assert settings_mgr.get("last_fps") == 120

    def test_corrupted_file_falls_back(self, tmp_path, monkeypatch):
        monkeypatch.setenv("SETTINGS_DIR", str(tmp_path))
        (tmp_path / "settings.json").write_text("NOT JSON")
        mgr = SettingsManager()
        assert mgr.get("last_fps") == 30  # defaults

    def test_default_settings_keys(self, settings_mgr):
        for key in SettingsManager.DEFAULT_SETTINGS:
            assert key in settings_mgr.settings
