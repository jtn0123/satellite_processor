"""Real tests for settings_schema.py — no mocking."""

import pytest

from satellite_processor.core.settings_schema import (
    _crf_to_quality,
    from_core_settings,
    to_core_settings,
)


class TestCrfToQuality:
    def test_high(self):
        assert _crf_to_quality(18) == "high"
        assert _crf_to_quality(20) == "high"

    def test_medium(self):
        assert _crf_to_quality(21) == "medium"
        assert _crf_to_quality(25) == "medium"

    def test_low(self):
        assert _crf_to_quality(26) == "low"
        assert _crf_to_quality(51) == "low"

    def test_very_low_crf_is_high(self):
        assert _crf_to_quality(0) == "high"


class TestToCoreSettings:
    def test_int_to_string(self):
        result = to_core_settings({"video_quality": 23})
        assert result["video_quality"] == "medium"

    def test_string_passthrough(self):
        result = to_core_settings({"video_quality": "high"})
        assert result["video_quality"] == "high"

    def test_no_video_quality(self):
        result = to_core_settings({"fps": 30})
        assert result == {"fps": 30}

    def test_preserves_other_keys(self):
        result = to_core_settings({"video_quality": 18, "fps": 30})
        assert result == {"video_quality": "high", "fps": 30}


class TestFromCoreSettings:
    def test_string_to_int(self):
        result = from_core_settings({"video_quality": "high"})
        assert result["video_quality"] == 18

    def test_medium(self):
        result = from_core_settings({"video_quality": "medium"})
        assert result["video_quality"] == 23

    def test_low(self):
        result = from_core_settings({"video_quality": "low"})
        assert result["video_quality"] == 28

    def test_unknown_string_passthrough(self):
        result = from_core_settings({"video_quality": "ultra"})
        assert result["video_quality"] == "ultra"

    def test_int_passthrough(self):
        result = from_core_settings({"video_quality": 18})
        assert result["video_quality"] == 18

    def test_no_video_quality(self):
        result = from_core_settings({"fps": 30})
        assert result == {"fps": 30}
