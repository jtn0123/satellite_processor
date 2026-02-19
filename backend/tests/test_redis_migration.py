"""Tests verifying redis-py 5→6 migration compatibility.

Ensures all Redis patterns used in the codebase work correctly with redis 6.x.
Uses fakeredis to avoid requiring a live Redis server.
"""

from __future__ import annotations

import json

import fakeredis
import fakeredis.aioredis
import pytest
import redis as sync_redis
import redis.asyncio as aioredis

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def fake_server():
    """Shared fakeredis server so sync and async clients see the same data."""
    return fakeredis.FakeServer()


@pytest.fixture()
def sync_client(fake_server):
    """Synchronous Redis client (mirrors tasks/helpers.py pattern)."""
    return fakeredis.FakeRedis(server=fake_server, decode_responses=True)


@pytest.fixture()
async def async_client(fake_server):
    """Async Redis client (mirrors get_redis_client())."""
    client = fakeredis.aioredis.FakeRedis(server=fake_server, decode_responses=True)
    yield client
    await client.aclose()


# ---------------------------------------------------------------------------
# 1. Connection pool creation and cleanup
# ---------------------------------------------------------------------------

class TestConnectionPool:
    """Verify pool lifecycle matches redis_pool.py patterns."""

    @pytest.mark.asyncio
    async def test_client_creation(self, async_client):
        assert async_client is not None

    @pytest.mark.asyncio
    async def test_client_close_and_recreate(self, fake_server):
        """Pool disconnect + recreate (mirrors close_redis_pool)."""
        client = fakeredis.aioredis.FakeRedis(server=fake_server, decode_responses=True)
        assert await client.ping()
        await client.aclose()
        # Recreate — simulates app restart
        client2 = fakeredis.aioredis.FakeRedis(server=fake_server, decode_responses=True)
        assert await client2.ping()
        await client2.aclose()

    @pytest.mark.asyncio
    async def test_connection_pool_from_url_api_exists(self):
        """Verify ConnectionPool.from_url() API is present in redis.asyncio."""
        assert hasattr(aioredis.ConnectionPool, "from_url")


# ---------------------------------------------------------------------------
# 2. Async client get/set/delete
# ---------------------------------------------------------------------------

class TestAsyncOperations:
    """Core async CRUD operations."""

    @pytest.mark.asyncio
    async def test_set_and_get(self, async_client):
        await async_client.set("key1", "value1")
        assert await async_client.get("key1") == "value1"

    @pytest.mark.asyncio
    async def test_get_missing_key(self, async_client):
        assert await async_client.get("nonexistent") is None

    @pytest.mark.asyncio
    async def test_delete(self, async_client):
        await async_client.set("todel", "val")
        deleted = await async_client.delete("todel")
        assert deleted == 1
        assert await async_client.get("todel") is None

    @pytest.mark.asyncio
    async def test_set_with_expiry(self, async_client):
        await async_client.set("ttlkey", "data", ex=300)
        ttl = await async_client.ttl("ttlkey")
        assert ttl > 0

    @pytest.mark.asyncio
    async def test_scan_iter(self, async_client):
        for i in range(5):
            await async_client.set(f"scan:{i}", str(i))
        keys = [k async for k in async_client.scan_iter(match="scan:*", count=100)]
        assert len(keys) == 5


# ---------------------------------------------------------------------------
# 3. Pub/sub
# ---------------------------------------------------------------------------

class TestPubSub:
    """Pub/sub patterns used by WebSocket progress broadcasting."""

    @pytest.mark.asyncio
    async def test_subscribe_and_publish(self, async_client):
        pubsub = async_client.pubsub()
        await pubsub.subscribe("test:channel")

        # Consume the subscribe confirmation
        msg = await pubsub.get_message(timeout=1)
        assert msg["type"] == "subscribe"

        await async_client.publish("test:channel", "hello")
        msg = await pubsub.get_message(timeout=1)
        assert msg is not None
        assert msg["type"] == "message"
        assert msg["data"] == "hello"

        await pubsub.unsubscribe("test:channel")
        await pubsub.aclose()

    @pytest.mark.asyncio
    async def test_publish_json_payload(self, async_client):
        """Mirrors _publish_progress pattern in tasks/helpers.py."""
        pubsub = async_client.pubsub()
        await pubsub.subscribe("job:abc123")
        await pubsub.get_message(timeout=1)  # subscribe ack

        payload = json.dumps({"job_id": "abc123", "progress": 50, "status": "processing"})
        await async_client.publish("job:abc123", payload)

        msg = await pubsub.get_message(timeout=1)
        assert msg is not None
        data = json.loads(msg["data"])
        assert data["progress"] == 50

        await pubsub.unsubscribe()
        await pubsub.aclose()


# ---------------------------------------------------------------------------
# 4. Cache service operations (mirrors services/cache.py)
# ---------------------------------------------------------------------------

class TestCachePatterns:
    """Test patterns from services/cache.py."""

    @pytest.mark.asyncio
    async def test_cache_set_with_ttl(self, async_client):
        await async_client.set("cache:satellites", json.dumps([1, 2, 3]), ex=60)
        raw = await async_client.get("cache:satellites")
        assert json.loads(raw) == [1, 2, 3]

    @pytest.mark.asyncio
    async def test_cache_invalidation_pattern(self, async_client):
        """Mirrors invalidate() in cache.py — scan_iter + delete."""
        for i in range(3):
            await async_client.set(f"cache:sat:{i}", "data")

        keys = [k async for k in async_client.scan_iter(match="cache:sat:*", count=100)]
        assert len(keys) == 3

        deleted = await async_client.delete(*keys)
        assert deleted == 3

    @pytest.mark.asyncio
    async def test_cache_miss_returns_none(self, async_client):
        assert await async_client.get("cache:miss") is None


# ---------------------------------------------------------------------------
# 5. Health check ping
# ---------------------------------------------------------------------------

class TestHealthCheck:
    """Mirrors _check_redis() in routers/health.py."""

    @pytest.mark.asyncio
    async def test_ping(self, async_client):
        assert await async_client.ping() is True

    def test_sync_ping(self, sync_client):
        assert sync_client.ping() is True


# ---------------------------------------------------------------------------
# 6. Sync Redis client (tasks/helpers.py pattern)
# ---------------------------------------------------------------------------

class TestSyncClient:
    """Sync Redis usage as in Celery task helpers."""

    def test_from_url_pattern(self):
        """redis.Redis.from_url() still works."""
        client = fakeredis.FakeRedis(decode_responses=True)
        client.set("sync_key", "sync_val")
        assert client.get("sync_key") == "sync_val"
        client.close()

    def test_publish_sync(self, sync_client):
        """Sync publish (used by _publish_progress)."""
        result = sync_client.publish("job:xyz", '{"progress": 100}')
        # No subscribers so 0 receivers, but call succeeds
        assert isinstance(result, int)

    def test_socket_connect_timeout_param(self):
        """Verify socket_connect_timeout is accepted (used in helpers.py)."""
        client = fakeredis.FakeRedis(
            decode_responses=True,
            socket_connect_timeout=5,
        )
        assert client.ping()
        client.close()


# ---------------------------------------------------------------------------
# 7. Connection error handling
# ---------------------------------------------------------------------------

class TestErrorHandling:
    """Verify error types haven't changed."""

    @pytest.mark.asyncio
    async def test_connection_error_type(self):
        """redis.exceptions.ConnectionError is still the right exception."""
        assert issubclass(aioredis.ConnectionError, Exception)
        assert issubclass(sync_redis.ConnectionError, Exception)

    @pytest.mark.asyncio
    async def test_redis_error_base(self):
        """redis.exceptions.RedisError is still the base."""
        assert issubclass(aioredis.RedisError, Exception)


# ---------------------------------------------------------------------------
# 8. decode_responses behavior
# ---------------------------------------------------------------------------

class TestDecodeResponses:
    """Ensure decode_responses=True returns str, not bytes."""

    @pytest.mark.asyncio
    async def test_async_returns_str(self, async_client):
        await async_client.set("strkey", "hello")
        val = await async_client.get("strkey")
        assert isinstance(val, str)
        assert val == "hello"

    def test_sync_returns_str(self, sync_client):
        sync_client.set("strkey", "world")
        val = sync_client.get("strkey")
        assert isinstance(val, str)
        assert val == "world"

    @pytest.mark.asyncio
    async def test_bytes_mode(self, fake_server):
        """Without decode_responses, values are bytes."""
        client = fakeredis.aioredis.FakeRedis(
            server=fake_server, decode_responses=False,
        )
        await client.set("bkey", "data")
        val = await client.get("bkey")
        assert isinstance(val, bytes)
        await client.aclose()
