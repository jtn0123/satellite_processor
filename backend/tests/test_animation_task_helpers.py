"""Tests for animation_tasks helper functions."""

from __future__ import annotations

from app.tasks.animation_tasks import QUALITY_CRF, _apply_loop_style


class TestQualityCrf:
    def test_quality_levels(self):
        assert QUALITY_CRF["low"] == "28"
        assert QUALITY_CRF["medium"] == "23"
        assert QUALITY_CRF["high"] == "18"

    def test_lower_crf_means_higher_quality(self):
        assert int(QUALITY_CRF["high"]) < int(QUALITY_CRF["medium"]) < int(QUALITY_CRF["low"])


class TestApplyLoopStyle:
    def test_none_style_returns_unchanged(self):
        frames = [1, 2, 3, 4, 5]
        result = _apply_loop_style(frames, "none", 30)
        assert result == frames

    def test_pingpong_style(self):
        frames = [1, 2, 3, 4, 5]
        result = _apply_loop_style(frames, "pingpong", 30)
        # Forward: 1,2,3,4,5 + Reverse (excluding first and last): 4,3,2
        assert result == [1, 2, 3, 4, 5, 4, 3, 2]

    def test_pingpong_two_frames(self):
        frames = [1, 2]
        result = _apply_loop_style(frames, "pingpong", 30)
        # Only 2 frames: forward + reverse excluding last = [1, 2, 1]
        assert result == [1, 2, 1]

    def test_hold_style(self):
        frames = [1, 2, 3]
        fps = 5
        result = _apply_loop_style(frames, "hold", fps)
        # Original + last frame repeated fps*2 times
        expected = [1, 2, 3] + [3] * (fps * 2)
        assert result == expected

    def test_empty_frames(self):
        assert _apply_loop_style([], "pingpong", 30) == []
        assert _apply_loop_style([], "hold", 30) == []

    def test_single_frame_pingpong(self):
        result = _apply_loop_style([1], "pingpong", 30)
        # Single frame: reversed(frames[:-1]) = reversed([]) = []
        assert result == [1]

    def test_unknown_style_returns_unchanged(self):
        frames = [1, 2, 3]
        result = _apply_loop_style(frames, "unknown", 30)
        assert result == frames
