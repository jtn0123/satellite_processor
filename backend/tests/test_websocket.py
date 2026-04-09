"""Tests for WebSocket endpoints."""

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock

# Ensure DEBUG mode so the lifespan doesn't require API_KEY
os.environ.setdefault("DEBUG", "true")

import app.main as main_module


async def _slow_get_message(**kwargs):
    """Mock get_message that yields control like real Redis would."""
    await asyncio.sleep(0.5)
    return


def _mock_redis_client():
    """Create a mock Redis client with pubsub support."""
    pubsub = AsyncMock()
    pubsub.subscribe = AsyncMock()
    pubsub.unsubscribe = AsyncMock()
    pubsub.close = AsyncMock()
    pubsub.get_message = _slow_get_message

    client = MagicMock()
    client.pubsub.return_value = pubsub
    return client


def test_job_websocket_connect():
    """WebSocket should accept connection and send connected message."""
    from starlette.testclient import TestClient

    mock_client = _mock_redis_client()
    original = main_module.get_redis_client

    main_module.get_redis_client = lambda: mock_client
    try:
        with TestClient(main_module.app) as sync_client:  # noqa: SIM117
            with sync_client.websocket_connect("/ws/jobs/11111111-2222-3333-4444-555555555555") as ws:
                data = ws.receive_json()
                assert data["type"] == "connected"
                # JTN-470: job_id must be a valid UUID. The mock test
                # used to pass the literal "test-job-id" which is now
                # rejected by the validation gate.
                assert data["job_id"] == "11111111-2222-3333-4444-555555555555"
    finally:
        main_module.get_redis_client = original


def test_events_websocket_connect():
    """Global events WebSocket should accept and send connected message."""
    from starlette.testclient import TestClient

    mock_client = _mock_redis_client()
    original = main_module.get_redis_client

    main_module.get_redis_client = lambda: mock_client
    try:
        with TestClient(main_module.app) as sync_client:  # noqa: SIM117
            with sync_client.websocket_connect("/ws/events") as ws:
                data = ws.receive_json()
                assert data["type"] == "connected"
    finally:
        main_module.get_redis_client = original


def test_status_websocket_connect():
    """Status heartbeat WebSocket should accept and send connected message."""
    from starlette.testclient import TestClient

    with TestClient(main_module.app) as sync_client:  # noqa: SIM117
        with sync_client.websocket_connect("/ws/status") as ws:
            data = ws.receive_json()
            assert data["type"] == "connected"
