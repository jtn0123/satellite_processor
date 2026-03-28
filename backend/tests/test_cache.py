"""Tests for Redis caching layer."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from app.services.cache import get_cached, invalidate, make_cache_key


class TestMakeCacheKey:
    def test_prefix_only(self):
        key = make_cache_key("frames")
        assert key == "cache:frames"

    def test_with_params(self):
        key = make_cache_key("frames", {"satellite": "GOES-16", "band": "C02"})
        assert key.startswith("cache:frames:")
        assert len(key) > len("cache:frames:")

    def test_deterministic(self):
        params = {"satellite": "GOES-16", "band": "C02"}
        key1 = make_cache_key("frames", params)
        key2 = make_cache_key("frames", params)
        assert key1 == key2

    def test_different_params_different_keys(self):
        key1 = make_cache_key("frames", {"satellite": "GOES-16"})
        key2 = make_cache_key("frames", {"satellite": "GOES-18"})
        assert key1 != key2

    def test_param_order_irrelevant(self):
        key1 = make_cache_key("x", {"a": 1, "b": 2})
        key2 = make_cache_key("x", {"b": 2, "a": 1})
        assert key1 == key2

    def test_empty_params(self):
        key = make_cache_key("frames", {})
        assert key == "cache:frames"

    def test_none_params(self):
        key = make_cache_key("frames", None)
        assert key == "cache:frames"


class TestGetCached:
    @pytest.mark.asyncio
    async def test_returns_cached_value(self, mock_redis):
        await mock_redis.set("test-key", json.dumps({"value": 42}))
        fetch_fn = AsyncMock(return_value={"value": 99})

        result = await get_cached("test-key", ttl=60, fetch_fn=fetch_fn)

        assert result == {"value": 42}
        fetch_fn.assert_not_called()

    @pytest.mark.asyncio
    async def test_calls_fetch_on_miss(self, mock_redis):
        fetch_fn = AsyncMock(return_value={"value": 99})

        result = await get_cached("miss-key", ttl=60, fetch_fn=fetch_fn)

        assert result == {"value": 99}
        fetch_fn.assert_called_once()

    @pytest.mark.asyncio
    async def test_caches_result_after_fetch(self, mock_redis):
        fetch_fn = AsyncMock(return_value={"value": 99})

        await get_cached("new-key", ttl=300, fetch_fn=fetch_fn)

        cached = await mock_redis.get("new-key")
        assert json.loads(cached) == {"value": 99}

    @pytest.mark.asyncio
    async def test_sync_fetch_fn(self, mock_redis):
        def sync_fn():
            return [1, 2, 3]

        result = await get_cached("sync-key", ttl=60, fetch_fn=sync_fn)
        assert result == [1, 2, 3]

    @pytest.mark.asyncio
    async def test_redis_read_failure_falls_through(self, mock_redis):
        """If Redis read fails, fetch_fn is called."""
        import redis.exceptions

        with patch.object(mock_redis, "get", side_effect=redis.exceptions.ConnectionError):
            fetch_fn = AsyncMock(return_value="fallback")
            result = await get_cached("fail-key", ttl=60, fetch_fn=fetch_fn)
            assert result == "fallback"


class TestInvalidate:
    @pytest.mark.asyncio
    async def test_deletes_matching_keys(self, mock_redis):
        await mock_redis.set("cache:frames:abc", "1")
        await mock_redis.set("cache:frames:def", "2")
        await mock_redis.set("cache:other:xyz", "3")

        deleted = await invalidate("cache:frames:*")
        assert deleted == 2

    @pytest.mark.asyncio
    async def test_no_matching_keys(self, mock_redis):
        deleted = await invalidate("cache:nonexistent:*")
        assert deleted == 0

    @pytest.mark.asyncio
    async def test_redis_failure_returns_zero(self, mock_redis):
        import redis.exceptions

        with patch.object(
            mock_redis, "scan_iter", side_effect=redis.exceptions.ConnectionError
        ):
            deleted = await invalidate("cache:*")
            assert deleted == 0
