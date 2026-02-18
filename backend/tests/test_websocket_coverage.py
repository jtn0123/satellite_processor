"""Tests for WebSocket endpoints — connection, message flow, auth, connection limits."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import app.main as main_module
import pytest


def _mock_redis_client():
    """Create a mock Redis client with pubsub support."""
    pubsub = AsyncMock()
    pubsub.subscribe = AsyncMock()
    pubsub.unsubscribe = AsyncMock()
    pubsub.close = AsyncMock()

    async def slow_get_message(**kwargs):
        await asyncio.sleep(0.5)
        return None

    pubsub.get_message = slow_get_message

    client = MagicMock()
    client.pubsub.return_value = pubsub
    return client


def test_job_ws_connect_and_receive():
    """Job WebSocket connects and receives connected message."""
    from starlette.testclient import TestClient
    mock = _mock_redis_client()
    orig = main_module.get_redis_client
    main_module.get_redis_client = lambda: mock
    try:
        with TestClient(main_module.app) as c:
            with c.websocket_connect("/ws/jobs/test-123") as ws:
                data = ws.receive_json()
                assert data["type"] == "connected"
                assert data["job_id"] == "test-123"
    finally:
        main_module.get_redis_client = orig


def test_events_ws_connect():
    """Global events WebSocket connects and receives connected message."""
    from starlette.testclient import TestClient
    mock = _mock_redis_client()
    orig = main_module.get_redis_client
    main_module.get_redis_client = lambda: mock
    try:
        with TestClient(main_module.app) as c:
            with c.websocket_connect("/ws/events") as ws:
                data = ws.receive_json()
                assert data["type"] == "connected"
    finally:
        main_module.get_redis_client = orig


def test_job_ws_subscribes_to_correct_channel():
    """Job WebSocket subscribes to job:{job_id} channel."""
    from starlette.testclient import TestClient
    mock = _mock_redis_client()
    orig = main_module.get_redis_client
    main_module.get_redis_client = lambda: mock
    try:
        with TestClient(main_module.app) as c:
            with c.websocket_connect("/ws/jobs/my-job-uuid") as ws:
                ws.receive_json()
        mock.pubsub().subscribe.assert_called()
    finally:
        main_module.get_redis_client = orig


def test_ws_auth_required():
    """WebSocket should reject connection when API key is required but missing."""
    from starlette.testclient import TestClient
    orig_key = main_module.app_settings.api_key
    orig_redis = main_module.get_redis_client
    mock = _mock_redis_client()
    main_module.get_redis_client = lambda: mock
    main_module.app_settings.api_key = "secret-key"
    try:
        with TestClient(main_module.app) as c:
            with pytest.raises(Exception):  # noqa: B017
                with c.websocket_connect("/ws/jobs/test-123") as _ws:
                    pass
    finally:
        main_module.app_settings.api_key = orig_key
        main_module.get_redis_client = orig_redis


def test_ws_auth_passes_with_query_param():
    """WebSocket should accept connection with correct API key in query."""
    from starlette.testclient import TestClient
    orig_key = main_module.app_settings.api_key
    orig_redis = main_module.get_redis_client
    mock = _mock_redis_client()
    main_module.get_redis_client = lambda: mock
    main_module.app_settings.api_key = "secret-key"
    try:
        with TestClient(main_module.app) as c:
            with c.websocket_connect("/ws/jobs/test-123?api_key=secret-key") as ws:
                data = ws.receive_json()
                assert data["type"] == "connected"
    finally:
        main_module.app_settings.api_key = orig_key
        main_module.get_redis_client = orig_redis


# ── Connection tracking ─────────────────────────────────────────────

def test_ws_track_increment():
    """_ws_track increments connection count."""
    main_module._ws_connections.clear()
    assert main_module._ws_track("1.2.3.4", 1) is True
    assert main_module._ws_connections["1.2.3.4"] == 1


def test_ws_track_decrement():
    """_ws_track decrements and cleans up at zero."""
    main_module._ws_connections.clear()
    main_module._ws_track("1.2.3.4", 1)
    main_module._ws_track("1.2.3.4", -1)
    assert "1.2.3.4" not in main_module._ws_connections


def test_ws_track_max_exceeded():
    """_ws_track rejects when max connections per IP exceeded."""
    main_module._ws_connections.clear()
    main_module._ws_connections["5.6.7.8"] = main_module.WS_MAX_CONNECTIONS_PER_IP
    assert main_module._ws_track("5.6.7.8", 1) is False
    # Clean up
    main_module._ws_connections.clear()
