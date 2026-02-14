"""Tests for WebSocket endpoints."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import app.main as main_module
import pytest


async def _slow_get_message(**kwargs):
    """Mock get_message that yields control like real Redis would."""
    await asyncio.sleep(0.5)
    return None


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


@pytest.mark.asyncio
async def test_job_websocket_connect(client):
    """WebSocket should accept connection and send connected message."""
    from starlette.testclient import TestClient

    mock_client = _mock_redis_client()
    original = main_module.get_redis_client

    main_module.get_redis_client = lambda: mock_client
    try:
        with TestClient(main_module.app) as sync_client:
            with sync_client.websocket_connect("/ws/jobs/test-job-id") as ws:
                data = ws.receive_json()
                assert data["type"] == "connected"
                assert data["job_id"] == "test-job-id"
    finally:
        main_module.get_redis_client = original


@pytest.mark.asyncio
async def test_events_websocket_connect(client):
    """Global events WebSocket should accept and send connected message."""
    from starlette.testclient import TestClient

    mock_client = _mock_redis_client()
    original = main_module.get_redis_client

    main_module.get_redis_client = lambda: mock_client
    try:
        with TestClient(main_module.app) as sync_client:
            with sync_client.websocket_connect("/ws/events") as ws:
                data = ws.receive_json()
                assert data["type"] == "connected"
    finally:
        main_module.get_redis_client = original


@pytest.mark.asyncio
async def test_status_websocket_connect(client):
    """Status heartbeat WebSocket should accept and send connected message."""
    from starlette.testclient import TestClient

    with TestClient(main_module.app) as sync_client:
        with sync_client.websocket_connect("/ws/status") as ws:
            data = ws.receive_json()
            assert data["type"] == "connected"
