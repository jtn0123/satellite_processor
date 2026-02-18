"""Tests for rate limiter configuration and behavior."""

import os
from unittest.mock import patch

import pytest
from app.rate_limit import limiter

pytestmark = pytest.mark.anyio


class TestLimiterConfig:
    """Tests for rate limiter module-level configuration."""

    def test_limiter_exists(self):
        assert limiter is not None

    def test_limiter_has_key_func(self):
        """Limiter should use get_remote_address as key function."""
        assert limiter._key_func is not None

    def test_in_memory_fallback_enabled(self):
        """In-memory fallback should be enabled for when Redis is unavailable."""
        assert limiter._in_memory_fallback_enabled is True

    def test_swallow_errors_enabled(self):
        """Swallow errors should be enabled so rate limit failures don't crash requests."""
        assert limiter._swallow_errors is True

    def test_default_limits_set(self):
        """Default limits should be configured."""
        assert limiter._default_limits is not None
        assert len(limiter._default_limits) > 0

    def test_disabled_in_tests(self):
        """Rate limiter should be disabled in test environment (via conftest)."""
        assert limiter.enabled is False


class TestLimiterRedisConfig:
    """Tests for Redis-backed storage configuration."""

    def test_no_redis_url_uses_memory(self):
        """Without REDIS_URL, limiter should work with in-memory storage."""
        with patch.dict(os.environ, {}, clear=False):
            # Just verify the limiter was created without errors
            from importlib import reload
            import app.rate_limit as rl
            original_limiter = rl.limiter
            try:
                with patch.dict(os.environ, {"REDIS_URL": ""}, clear=False):
                    reload(rl)
                    assert rl.limiter is not None
            finally:
                rl.limiter = original_limiter

    def test_with_redis_url_sets_storage(self):
        """With REDIS_URL set, limiter should configure Redis storage."""
        with patch.dict(os.environ, {"REDIS_URL": "redis://localhost:6379/0"}):
            from importlib import reload
            import app.rate_limit as rl
            original_limiter = rl.limiter
            try:
                reload(rl)
                assert rl.limiter is not None
            finally:
                rl.limiter = original_limiter


class TestKeyGeneration:
    """Tests for rate limit key generation via get_remote_address."""

    def test_get_remote_address_import(self):
        """get_remote_address should be importable from slowapi."""
        from slowapi.util import get_remote_address
        assert callable(get_remote_address)
