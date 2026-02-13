"""Tests for WebSocket endpoints."""


import pytest


@pytest.mark.asyncio
async def test_job_websocket_connect(client):
    """WebSocket should accept connection and send connected message."""
    from app.main import app
    from starlette.testclient import TestClient

    # Use sync test client for WebSocket testing
    with TestClient(app) as sync_client:
        with sync_client.websocket_connect("/ws/jobs/test-job-id") as ws:
            data = ws.receive_json()
            assert data["type"] == "connected"
            assert data["job_id"] == "test-job-id"


@pytest.mark.asyncio
async def test_events_websocket_connect(client):
    """Global events WebSocket should accept and send connected message."""
    from app.main import app
    from starlette.testclient import TestClient

    with TestClient(app) as sync_client:
        with sync_client.websocket_connect("/ws/events") as ws:
            data = ws.receive_json()
            assert data["type"] == "connected"
