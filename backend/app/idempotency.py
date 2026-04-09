"""HTTP Idempotency-Key support for resource-creating POST endpoints.

JTN-391: mobile clients and script wrappers occasionally submit the same
``POST /api/jobs`` or ``POST /api/satellite/fetch`` request twice after a
retry, double-tap, or stale TanStack Query mutation replay. Without a
server-side guard the second call creates an extra Job row, a second
Celery task, and — for fetch endpoints — a duplicate download.

The contract is the standard one popularised by Stripe:

* Clients opt in by sending an ``Idempotency-Key`` header (UUID, ULID, or
  any opaque string up to 255 ASCII chars).
* On the first request the handler runs normally, then the resulting
  status code and JSON body are cached in Redis for 24 hours keyed by
  ``(method, path, key)``.
* A repeat request with the same tuple returns the cached response
  verbatim without running the handler.

The store lives on the shared async Redis pool so there is no extra
connection churn. When Redis is unreachable the header is treated as
best-effort — the handler runs normally and the caller gets the usual
2xx/4xx. That keeps a flaky broker from flipping POSTs to 500s.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import redis.exceptions
from fastapi import Header

from .errors import APIError
from .redis_pool import get_redis_client

logger = logging.getLogger(__name__)

#: TTL for cached idempotent responses. 24h is long enough to cover
#: retries across a user session but short enough that a stale cached
#: success doesn't haunt a resubmitted fetch a week later.
IDEMPOTENCY_TTL_SECONDS = 86_400

#: Max length for the ``Idempotency-Key`` header value. 255 is generous
#: (UUIDs are 36 chars, ULIDs 26) and bounds Redis key size.
MAX_KEY_LENGTH = 255

#: Allowed characters in an idempotency key. Matches UUIDs, ULIDs, and
#: any other printable ASCII identifier without whitespace or control
#: characters. Rejects anything else with a 400 so callers notice
#: typos instead of silently missing the dedup window.
_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_\-:.]{1,255}$")

_REDIS_NAMESPACE = "idem"


def _build_redis_key(method: str, path: str, key: str) -> str:
    """Return the Redis key used to cache the response for ``(method, path, key)``."""
    return f"{_REDIS_NAMESPACE}:{method.upper()}:{path}:{key}"


def _validate_key(raw_key: str) -> str:
    """Validate and normalise an ``Idempotency-Key`` header value.

    Raises :class:`APIError` 400 on invalid keys so callers get fast
    feedback instead of silently opting out of dedup.
    """
    key = raw_key.strip()
    if not key:
        raise APIError(400, "invalid_idempotency_key", "Idempotency-Key must not be empty")
    if len(key) > MAX_KEY_LENGTH:
        raise APIError(
            400,
            "invalid_idempotency_key",
            f"Idempotency-Key must be {MAX_KEY_LENGTH} characters or fewer",
        )
    if not _KEY_PATTERN.match(key):
        raise APIError(
            400,
            "invalid_idempotency_key",
            "Idempotency-Key may only contain letters, digits, '-', '_', ':' or '.'",
        )
    return key


async def get_cached_response(method: str, path: str, key: str) -> dict[str, Any] | None:
    """Return the cached ``{status, body}`` payload for this key, or ``None``.

    Network or decode failures are logged and treated as cache misses so
    a flaky Redis doesn't wedge the request path.
    """
    redis_key = _build_redis_key(method, path, key)
    try:
        client = get_redis_client()
        raw = await client.get(redis_key)
    except (redis.exceptions.RedisError, OSError):
        logger.debug("Idempotency cache lookup failed for %s", redis_key, exc_info=True)
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        logger.warning("Corrupt idempotency cache entry at %s — ignoring", redis_key)
        return None


async def store_response(method: str, path: str, key: str, status_code: int, body: Any) -> None:
    """Persist ``(status_code, body)`` for future duplicate requests.

    Uses ``SET NX EX`` so two concurrent first-time requests with the
    same key race cleanly — only the winner writes, and the loser will
    find the cached entry on its next retry. Silently drops the write
    if Redis is unavailable; the caller already received a real
    response, so losing the cache only means the duplicate will be
    re-processed.
    """
    redis_key = _build_redis_key(method, path, key)
    payload = json.dumps({"status_code": status_code, "body": body}, default=str)
    try:
        client = get_redis_client()
        await client.set(redis_key, payload, ex=IDEMPOTENCY_TTL_SECONDS, nx=True)
    except (redis.exceptions.RedisError, OSError):
        logger.debug("Idempotency cache write failed for %s", redis_key, exc_info=True)


def idempotency_key_dependency(
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> str | None:
    """FastAPI dependency that validates the optional ``Idempotency-Key`` header.

    Returns the normalised key, or ``None`` when the header is absent.
    The dependency deliberately does not look up the cache itself — the
    router needs the key both before (hit check) and after (store)
    running its own logic, so the lookup is done explicitly in the
    handler via :func:`get_cached_response` / :func:`store_response`.

    Declared synchronous because the only work it does is header
    parsing — FastAPI will run it in a threadpool automatically.
    """
    if idempotency_key is None:
        return None
    return _validate_key(idempotency_key)
