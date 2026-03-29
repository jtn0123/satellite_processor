"""Tests for utility functions."""

from datetime import datetime

from app.utils import sanitize_log, utcnow


class TestUtcNow:
    def test_returns_datetime(self):
        result = utcnow()
        assert isinstance(result, datetime)

    def test_naive_no_tzinfo(self):
        result = utcnow()
        assert result.tzinfo is None

    def test_reasonable_time(self):
        before = utcnow()
        result = utcnow()
        after = utcnow()
        assert before <= result <= after

    def test_different_calls_are_close(self):
        a = utcnow()
        b = utcnow()
        assert abs((b - a).total_seconds()) < 1.0


class TestSanitizeLog:
    def test_strips_newlines(self):
        assert sanitize_log("hello\nworld") == "helloworld"

    def test_strips_carriage_return(self):
        assert sanitize_log("hello\r\nworld") == "helloworld"

    def test_strips_tabs(self):
        assert sanitize_log("hello\tworld") == "helloworld"

    def test_strips_null_bytes(self):
        assert sanitize_log("hello\x00world") == "helloworld"

    def test_preserves_normal_text(self):
        assert sanitize_log("abc-123_test") == "abc-123_test"

    def test_handles_non_string(self):
        assert sanitize_log(42) == "42"
        assert sanitize_log(None) == "None"

    def test_preserves_unicode(self):
        assert sanitize_log("café ☕") == "café ☕"
