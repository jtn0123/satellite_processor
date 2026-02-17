"""Rate limiter configuration."""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# Use Redis for persistent rate-limit storage when available (survives restarts).
_redis_url = os.getenv("REDIS_URL")

_limiter_kwargs: dict = {
    "key_func": get_remote_address,
    "default_limits": ["60/minute"],
    "in_memory_fallback_enabled": True,
    "swallow_errors": True,
}
if _redis_url:
    _limiter_kwargs["storage_uri"] = _redis_url

limiter = Limiter(**_limiter_kwargs)
