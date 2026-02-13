"""Shared Redis connection pool for WebSocket and pub/sub usage.

Avoids creating a new Redis connection per WebSocket or task.
"""

from __future__ import annotations

import logging

import redis.asyncio as aioredis

from .config import settings

logger = logging.getLogger(__name__)

_pool: aioredis.ConnectionPool | None = None
_redis_client: aioredis.Redis | None = None


def get_redis_pool() -> aioredis.ConnectionPool:
    """Get or create the shared async Redis connection pool."""
    global _pool
    if _pool is None:
        _pool = aioredis.ConnectionPool.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
        )
    return _pool


def get_redis_client() -> aioredis.Redis:
    """Get a shared async Redis client using the connection pool."""
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.Redis(connection_pool=get_redis_pool())
    return _redis_client


async def close_redis_pool() -> None:
    """Close the shared Redis pool on shutdown."""
    global _pool, _redis_client
    if _redis_client is not None:
        await _redis_client.close()
        _redis_client = None
    if _pool is not None:
        await _pool.disconnect()
        _pool = None
