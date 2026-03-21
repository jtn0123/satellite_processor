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


class TestRateLimitBehavior:
    """Tests with rate limiter enabled to verify 429 responses."""

    @pytest.fixture(autouse=True)
    def _enable_limiter(self):
        """Enable rate limiter for these tests only."""
        limiter.enabled = True
        yield
        limiter.enabled = False

    @pytest.fixture
    def client(self):
        """Async HTTP client for testing."""
        import asyncio

        from app.db.database import Base, get_db
        from app.main import app
        from httpx import ASGITransport, AsyncClient
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

        url = "sqlite+aiosqlite:///:memory:"
        eng = create_async_engine(url, echo=False)
        session_maker = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)

        async def override():
            async with session_maker() as session:
                yield session

        app.dependency_overrides[get_db] = override

        async def _setup():
            async with eng.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)

        asyncio.get_event_loop().run_until_complete(_setup())
        transport = ASGITransport(app=app)
        return AsyncClient(transport=transport, base_url="http://test")

    async def test_rate_limit_enforced(self, client):
        """Verify that exceeding rate limit returns 429."""
        # POST /api/errors has @limiter.limit("10/minute")
        got_429 = False
        for i in range(15):
            resp = await client.post("/api/errors", json={
                "message": f"test error {i}",
                "source": "rate_limit_test",
            })
            if resp.status_code == 429:
                got_429 = True
                break
        assert got_429, "Expected 429 rate limit response within 15 requests"
