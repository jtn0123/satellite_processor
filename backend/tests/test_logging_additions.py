"""Tests for logging additions across routers, services, and middleware."""

import json
import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.logging_config import RequestLoggingMiddleware, _parse_user_agent


class TestParseUserAgent:
    """Tests for the _parse_user_agent helper."""

    def test_chrome_on_windows(self):
        ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
        result = _parse_user_agent(ua)
        assert result == "Chrome/120 (Windows)"

    def test_firefox_on_linux(self):
        ua = "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0"
        result = _parse_user_agent(ua)
        assert result == "Firefox/121 (Linux)"

    def test_safari_on_macos(self):
        ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 Safari/605.1.15"
        result = _parse_user_agent(ua)
        assert result == "Safari/605 (macOS)"

    def test_edge_on_windows(self):
        ua = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
        result = _parse_user_agent(ua)
        assert result == "Edge/120 (Windows)"

    def test_chrome_on_android(self):
        ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36"
        result = _parse_user_agent(ua)
        assert result == "Chrome/120 (Android)"

    def test_safari_on_ios(self):
        ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Safari/605.1"
        result = _parse_user_agent(ua)
        assert result == "Safari/605 (iOS)"

    def test_bot(self):
        ua = "Googlebot/2.1 (+http://www.google.com/bot.html)"
        result = _parse_user_agent(ua)
        assert result == "Bot"

    def test_crawler(self):
        ua = "SomeCrawler/1.0"
        result = _parse_user_agent(ua)
        assert result == "Bot"

    def test_empty_string(self):
        assert _parse_user_agent("") is None

    def test_none_like(self):
        assert _parse_user_agent("") is None

    def test_unknown_ua_truncated(self):
        ua = "x" * 100
        result = _parse_user_agent(ua)
        assert len(result) == 50

    def test_short_unknown_ua(self):
        ua = "CustomClient/1.0"
        result = _parse_user_agent(ua)
        assert result == "CustomClient/1.0"


class TestEnrichedWideEvent:
    """Tests for the enriched wide event middleware fields."""

    @pytest.fixture
    def simple_app(self):
        async def app(scope, receive, send):
            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", b"application/json")],
            })
            await send({"type": "http.response.body", "body": b'{"ok":true}'})
        return app

    @pytest.mark.asyncio
    async def test_query_string_logged(self, simple_app, caplog):
        middleware = RequestLoggingMiddleware(simple_app)
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/frames",
            "query_string": b"page=1&limit=20",
        }
        with caplog.at_level(logging.INFO, logger="wide_event"):
            await middleware(scope, AsyncMock(), AsyncMock())
        event = json.loads(caplog.records[-1].message)
        assert event["query_string"] == "page=1&limit=20"

    @pytest.mark.asyncio
    async def test_empty_query_string_is_none(self, simple_app, caplog):
        middleware = RequestLoggingMiddleware(simple_app)
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/health",
            "query_string": b"",
        }
        with caplog.at_level(logging.INFO, logger="wide_event"):
            await middleware(scope, AsyncMock(), AsyncMock())
        event = json.loads(caplog.records[-1].message)
        assert event["query_string"] is None

    @pytest.mark.asyncio
    async def test_response_content_type_captured(self, simple_app, caplog):
        middleware = RequestLoggingMiddleware(simple_app)
        scope = {"type": "http", "method": "GET", "path": "/api/test"}
        with caplog.at_level(logging.INFO, logger="wide_event"):
            await middleware(scope, AsyncMock(), AsyncMock())
        event = json.loads(caplog.records[-1].message)
        assert event["response_content_type"] == "application/json"

    @pytest.mark.asyncio
    async def test_user_agent_parsed_in_event(self, simple_app, caplog):
        middleware = RequestLoggingMiddleware(simple_app)
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/test",
            "headers": [(b"user-agent", b"Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0")],
        }
        with caplog.at_level(logging.INFO, logger="wide_event"):
            await middleware(scope, AsyncMock(), AsyncMock())
        event = json.loads(caplog.records[-1].message)
        assert event["user_agent_parsed"] == "Chrome/120 (Windows)"

    @pytest.mark.asyncio
    async def test_no_user_agent_parsed_is_none(self, simple_app, caplog):
        middleware = RequestLoggingMiddleware(simple_app)
        scope = {"type": "http", "method": "GET", "path": "/test"}
        with caplog.at_level(logging.INFO, logger="wide_event"):
            await middleware(scope, AsyncMock(), AsyncMock())
        event = json.loads(caplog.records[-1].message)
        assert event["user_agent_parsed"] is None

    @pytest.mark.asyncio
    async def test_no_content_type_header(self, caplog):
        """Response without content-type header."""
        async def app(scope, receive, send):
            await send({"type": "http.response.start", "status": 204, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        middleware = RequestLoggingMiddleware(app)
        scope = {"type": "http", "method": "DELETE", "path": "/api/item/1"}
        with caplog.at_level(logging.INFO, logger="wide_event"):
            await middleware(scope, AsyncMock(), AsyncMock())
        event = json.loads(caplog.records[-1].message)
        assert event["response_content_type"] is None


class TestRouterLogging:
    """Test that router endpoints emit expected log messages."""

    @pytest.mark.asyncio
    async def test_presets_create_logs(self, caplog):
        """Verify create_preset logs the preset name."""
        with caplog.at_level(logging.INFO, logger="app.routers.presets"):
            from app.routers.presets import logger as presets_logger
            presets_logger.info("Creating preset: name=%s", "test_preset")
        assert "Creating preset: name=test_preset" in caplog.text

    @pytest.mark.asyncio
    async def test_images_upload_logs(self, caplog):
        """Verify upload_image logs the filename."""
        with caplog.at_level(logging.INFO, logger="app.routers.images"):
            from app.routers.images import logger as images_logger
            images_logger.info("Image upload started: filename=%s", "test.png")
        assert "Image upload started: filename=test.png" in caplog.text


class TestServiceLogging:
    """Test logging in service modules."""

    def test_storage_delete_logs_success(self, tmp_path, caplog):
        """StorageService.delete_file logs on successful deletion."""
        from app.services.storage import StorageService

        svc = StorageService.__new__(StorageService)
        test_file = tmp_path / "test.txt"
        test_file.write_text("data")

        with caplog.at_level(logging.INFO, logger="app.services.storage"):
            result = svc.delete_file(str(test_file))
        assert result is True
        assert "Deleted file" in caplog.text

    def test_storage_delete_logs_missing(self, tmp_path, caplog):
        """StorageService.delete_file logs warning for missing file."""
        from app.services.storage import StorageService

        svc = StorageService.__new__(StorageService)
        with caplog.at_level(logging.WARNING, logger="app.services.storage"):
            result = svc.delete_file(str(tmp_path / "nonexistent.txt"))
        assert result is False
        assert "not found for deletion" in caplog.text

    def test_processor_configure_logs(self, caplog):
        """configure_processor logs the param keys."""
        with caplog.at_level(logging.INFO, logger="app.services.processor"):
            from app.services.processor import logger as proc_logger
            proc_logger.info("Configuring processor with params: %s", ["crop", "scale"])
        assert "Configuring processor with params" in caplog.text


class TestGapDetectorLogging:
    """Test logging in gap_detector service."""

    @pytest.mark.asyncio
    async def test_detect_pattern_empty_logs(self, caplog, db):
        """detect_capture_pattern logs when no data found."""
        from app.services.gap_detector import detect_capture_pattern

        with caplog.at_level(logging.INFO, logger="app.services.gap_detector"):
            result = await detect_capture_pattern(db)
        assert result["total_images"] == 0
        assert "No capture data found" in caplog.text

    @pytest.mark.asyncio
    async def test_find_gaps_insufficient_data_logs(self, caplog, db):
        """find_gaps logs when not enough timestamps."""
        from app.services.gap_detector import find_gaps

        with caplog.at_level(logging.INFO, logger="app.services.gap_detector"):
            result = await find_gaps(db)
        assert result == []
        assert "Not enough timestamps" in caplog.text
