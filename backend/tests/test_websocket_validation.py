"""Tests for WebSocket input validation and metrics auth (JTN-470).

These tests are kept separate from ``test_websocket.py`` because the legacy
``*websocket_connect`` tests in that file are flaky in this repo. The
validation tests here exercise the close code path which does not depend on
Redis pub/sub or per-message timing, so they're reliably synchronous.
"""

from __future__ import annotations

import os

# Ensure DEBUG before any app import so the lifespan doesn't demand API_KEY.
os.environ["DEBUG"] = "true"

from unittest.mock import AsyncMock, MagicMock  # noqa: E402

import app.main as main_module  # noqa: E402

# Force debug mode regardless of what config.py loaded at import time — this
# prevents the startup lifespan from raising SystemExit when API_KEY is unset.
main_module.app_settings.debug = True

from starlette.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402


def _mock_redis_client():
    """Create a no-op Redis client with a blocking pubsub."""

    async def _slow_get_message(**_):
        import asyncio

        await asyncio.sleep(0.5)

    pubsub = AsyncMock()
    pubsub.subscribe = AsyncMock()
    pubsub.unsubscribe = AsyncMock()
    pubsub.close = AsyncMock()
    pubsub.get_message = _slow_get_message

    client = MagicMock()
    client.pubsub.return_value = pubsub
    return client


# ── JTN-470: /ws/jobs/{job_id} UUID validation ──────────────────────


def _ws_close_code(client: TestClient, path: str) -> int:
    """Connect to a WS path and return the close code observed."""
    try:
        with client.websocket_connect(path) as ws:
            # If the server accepts and then closes, receive() will raise
            # with the close code. If it closes during handshake, connect()
            # itself raises.
            try:
                ws.receive_json()
            except WebSocketDisconnect as e:
                return e.code
    except WebSocketDisconnect as e:
        return e.code
    return 0


def test_ws_jobs_rejects_non_uuid():
    """A non-UUID job_id must be rejected with close code 4400."""
    with TestClient(main_module.app) as client:
        code = _ws_close_code(client, "/ws/jobs/not-a-uuid")
        assert code == 4400


def test_ws_jobs_rejects_sql_injection_shape():
    """A SQL-injection-shaped id is rejected and never echoed."""
    with TestClient(main_module.app) as client:
        payload = "1'%20OR%20'1'='1"
        code = _ws_close_code(client, f"/ws/jobs/{payload}")
        assert code == 4400


def test_ws_jobs_rejects_very_long_id():
    """A very long id (10KB) is rejected immediately."""
    with TestClient(main_module.app) as client:
        long_id = "a" * 10_000
        code = _ws_close_code(client, f"/ws/jobs/{long_id}")
        assert code == 4400


def test_ws_jobs_accepts_valid_uuid():
    """A valid UUID passes the validation gate and reaches Redis subscribe."""
    mock_client = _mock_redis_client()
    original = main_module.get_redis_client
    main_module.get_redis_client = lambda: mock_client
    try:
        with TestClient(main_module.app) as client:  # noqa: SIM117
            with client.websocket_connect("/ws/jobs/11111111-2222-3333-4444-555555555555") as ws:
                data = ws.receive_json()
                assert data["type"] == "connected"
                assert data["job_id"] == "11111111-2222-3333-4444-555555555555"
    finally:
        main_module.get_redis_client = original


# ── JTN-470: /api/metrics auth gate ─────────────────────────────────


def test_metrics_unauth_when_no_api_key():
    """With no API_KEY set, metrics are reachable (dev/debug behaviour)."""
    with TestClient(main_module.app) as client:
        resp = client.get("/api/metrics")
        assert resp.status_code == 200


def test_metrics_requires_key_when_api_key_set(monkeypatch):
    """With API_KEY set, /api/metrics must 401 without a valid key."""
    monkeypatch.setattr(main_module.app_settings, "api_key", "s3cr3t")
    with TestClient(main_module.app) as client:
        resp = client.get("/api/metrics")
        assert resp.status_code == 401
        resp2 = client.get("/api/metrics", headers={"X-API-Key": "s3cr3t"})
        assert resp2.status_code == 200
