"""Tests for settings_schema.py — to_core_settings / from_core_settings (#143)."""

from satellite_processor.core.settings_schema import from_core_settings, to_core_settings


class TestToCoreSettings:
    def test_int_to_string_high(self):
        assert to_core_settings({"video_quality": 18})["video_quality"] == "high"

    def test_int_to_string_medium(self):
        assert to_core_settings({"video_quality": 23})["video_quality"] == "medium"

    def test_int_to_string_low(self):
        assert to_core_settings({"video_quality": 30})["video_quality"] == "low"

    def test_passthrough_string(self):
        assert to_core_settings({"video_quality": "high"})["video_quality"] == "high"

    def test_other_keys_preserved(self):
        result = to_core_settings({"fps": 30, "video_quality": 18})
        assert result["fps"] == 30


class TestFromCoreSettings:
    def test_string_to_int_high(self):
        assert from_core_settings({"video_quality": "high"})["video_quality"] == 18

    def test_string_to_int_medium(self):
        assert from_core_settings({"video_quality": "medium"})["video_quality"] == 23

    def test_string_to_int_low(self):
        assert from_core_settings({"video_quality": "low"})["video_quality"] == 28

    def test_passthrough_int(self):
        assert from_core_settings({"video_quality": 18})["video_quality"] == 18

    def test_unknown_string_passthrough(self):
        assert from_core_settings({"video_quality": "ultra"})["video_quality"] == "ultra"
