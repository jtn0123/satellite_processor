"""Rate limiter configuration."""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# Use Redis for persistent rate-limit storage when available (survives restarts).
_redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
_storage_uri = _redis_url if _redis_url else "memory://"

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["60/minute"],
    storage_uri=_storage_uri,
)
