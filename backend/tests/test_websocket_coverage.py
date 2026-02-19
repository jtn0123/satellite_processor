"""Comprehensive WebSocket tests — connection tracking, auth, ping, status.

These tests use the synchronous Starlette TestClient for WebSocket testing.
They are placed in a separate module and only test pure-sync / unit logic
to avoid event-loop conflicts with the async test fixtures.
"""

from unittest.mock import AsyncMock, patch

import app.main as main_module
import pytest
from app.main import WS_MAX_CONNECTIONS_PER_IP, _ws_track

# ── Connection tracking (async unit tests) ─────────────────────────


class TestWsTrack:
    def setup_method(self):
        main_module._ws_connections.clear()

    def teardown_method(self):
        main_module._ws_connections.clear()

    @pytest.mark.asyncio
    async def test_first_connection_allowed(self):
        assert await _ws_track("1.2.3.4", 1) is True
        assert main_module._ws_connections["1.2.3.4"] == 1

    @pytest.mark.asyncio
    async def test_disconnect_decrements(self):
        await _ws_track("1.2.3.4", 1)
        await _ws_track("1.2.3.4", -1)
        assert "1.2.3.4" not in main_module._ws_connections

    @pytest.mark.asyncio
    async def test_max_connections_enforced(self):
        for _ in range(WS_MAX_CONNECTIONS_PER_IP):
            assert await _ws_track("1.2.3.4", 1) is True
        assert await _ws_track("1.2.3.4", 1) is False

    @pytest.mark.asyncio
    async def test_different_ips_independent(self):
        for _ in range(WS_MAX_CONNECTIONS_PER_IP):
            await _ws_track("1.1.1.1", 1)
        assert await _ws_track("2.2.2.2", 1) is True

    @pytest.mark.asyncio
    async def test_negative_doesnt_go_below_zero(self):
        await _ws_track("1.2.3.4", -1)
        assert "1.2.3.4" not in main_module._ws_connections

    @pytest.mark.asyncio
    async def test_cleanup_on_zero(self):
        await _ws_track("1.2.3.4", 1)
        await _ws_track("1.2.3.4", 1)
        await _ws_track("1.2.3.4", -1)
        await _ws_track("1.2.3.4", -1)
        assert "1.2.3.4" not in main_module._ws_connections

    def test_max_connections_constant(self):
        assert WS_MAX_CONNECTIONS_PER_IP == 10


# ── WS auth helper unit test ─────────────────────────────────────


class TestWsAuthenticate:
    """Test _ws_authenticate logic without actual WebSocket connections."""

    @pytest.mark.asyncio
    async def test_no_api_key_always_passes(self):
        """When api_key is empty, auth should always pass."""

        ws = AsyncMock()
        with patch.object(main_module.app_settings, "api_key", ""):
            result = await main_module._ws_authenticate(ws)
        assert result is True

    @pytest.mark.asyncio
    async def test_correct_key_via_query_param(self):
        """Correct API key in query params should pass."""

        ws = AsyncMock()
        ws.query_params = {"api_key": "secret"}
        ws.headers = {}
        with patch.object(main_module.app_settings, "api_key", "secret"):
            result = await main_module._ws_authenticate(ws)
        assert result is True

    @pytest.mark.asyncio
    async def test_correct_key_via_header(self):
        """Correct API key in x-api-key header should pass."""

        ws = AsyncMock()
        ws.query_params = {}
        ws.headers = {"x-api-key": "secret"}
        with patch.object(main_module.app_settings, "api_key", "secret"):
            result = await main_module._ws_authenticate(ws)
        assert result is True

    @pytest.mark.asyncio
    async def test_wrong_key_fails(self):
        """Wrong API key should return False and close connection."""

        ws = AsyncMock()
        ws.query_params = {"api_key": "wrong"}
        ws.headers = {}
        with patch.object(main_module.app_settings, "api_key", "secret"):
            result = await main_module._ws_authenticate(ws)
        assert result is False
        ws.close.assert_called_once()


# ── WS ping interval ─────────────────────────────────────────────


def test_ping_interval_is_30s():
    assert main_module.WS_PING_INTERVAL == 30
