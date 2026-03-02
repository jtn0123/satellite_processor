"""Redis caching layer for expensive API queries."""

from __future__ import annotations

import hashlib
import inspect
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import redis.exceptions

from ..redis_pool import get_redis_client

logger = logging.getLogger(__name__)


def make_cache_key(prefix: str, params: dict[str, Any] | None = None) -> str:
    """Build a cache key from prefix and optional params."""
    if not params:
        return f"cache:{prefix}"
    raw = json.dumps(params, sort_keys=True, default=str)
    h = hashlib.md5(raw.encode(), usedforsecurity=False).hexdigest()[:12]
    return f"cache:{prefix}:{h}"


async def get_cached(
    key: str,
    ttl: int,
    fetch_fn: Callable[[], Any] | Callable[[], Awaitable[Any]],
) -> Any:
    """Return cached value or call fetch_fn, cache result, and return it."""
    redis_client = get_redis_client()
    try:
        cached = await redis_client.get(key)
        if cached is not None:
            return json.loads(cached)
    except (redis.exceptions.RedisError, ConnectionError, TimeoutError, OSError, RuntimeError):
        logger.warning("Redis cache read failed for %s", key, exc_info=True)

    raw = fetch_fn()
    result = await raw if inspect.isawaitable(raw) else raw

    try:
        await redis_client.set(key, json.dumps(result, default=str), ex=ttl)
    except (redis.exceptions.RedisError, ConnectionError, TimeoutError, OSError, RuntimeError):
        logger.warning("Redis cache write failed for %s", key, exc_info=True)

    return result


async def invalidate(pattern: str) -> int:
    """Delete keys matching a glob pattern. Returns count deleted."""
    redis_client = get_redis_client()
    try:
        keys: list[str] = []
        async for key in redis_client.scan_iter(match=pattern, count=100):
            keys.append(key)
        if keys:
            deleted: int = await redis_client.delete(*keys)
            return deleted
    except (redis.exceptions.RedisError, ConnectionError, TimeoutError, OSError, RuntimeError):
        logger.warning("Redis cache invalidate failed for %s", pattern, exc_info=True)
    return 0
