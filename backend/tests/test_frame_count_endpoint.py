"""Tests for the /goes/frame-count endpoint."""
from __future__ import annotations

from unittest.mock import patch

import pytest


@pytest.mark.asyncio
@patch("app.services.goes_fetcher.list_available")
async def test_estimate_frame_count(mock_list, client):
    mock_list.return_value = [{"key": f"k{i}"} for i in range(42)]
    resp = await client.get("/api/goes/frame-count", params={
        "satellite": "GOES-16",
        "sector": "FullDisk",
        "band": "C02",
        "start_time": "2026-01-01T00:00:00Z",
        "end_time": "2026-01-01T01:00:00Z",
    })
    assert resp.status_code == 200
    assert resp.json()["count"] == 42


@pytest.mark.asyncio
@patch("app.services.goes_fetcher.list_available")
async def test_estimate_frame_count_empty(mock_list, client):
    mock_list.return_value = []
    resp = await client.get("/api/goes/frame-count", params={
        "satellite": "GOES-16",
        "sector": "FullDisk",
        "band": "C02",
        "start_time": "2026-01-01T00:00:00Z",
        "end_time": "2026-01-01T01:00:00Z",
    })
    assert resp.status_code == 200
    assert resp.json()["count"] == 0


@pytest.mark.asyncio
async def test_estimate_frame_count_invalid_range(client):
    resp = await client.get("/api/goes/frame-count", params={
        "satellite": "GOES-16",
        "sector": "FullDisk",
        "band": "C02",
        "start_time": "2026-01-01T02:00:00Z",
        "end_time": "2026-01-01T01:00:00Z",
    })
    assert resp.status_code == 400
