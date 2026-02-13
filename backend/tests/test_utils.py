"""Tests for utility functions."""

from datetime import datetime

import pytest

from app.utils import utcnow


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
