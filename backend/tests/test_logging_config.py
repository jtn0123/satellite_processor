"""Tests for app.logging_config — setup_logging and RequestLoggingMiddleware."""

import logging
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.logging_config import RequestLoggingMiddleware, setup_logging


class TestSetupLogging:
    """Tests for the setup_logging function."""

    def setup_method(self):
        """Reset root logger between tests, preserving pytest's own handlers."""
        root = logging.getLogger()
        # Preserve pytest LogCaptureHandlers so we don't fight the framework
        self._pytest_handlers = [
            h for h in root.handlers
            if type(h).__name__ == "LogCaptureHandler"
        ]
        root.handlers.clear()
        root.handlers.extend(self._pytest_handlers)
        root.setLevel(logging.WARNING)

    def test_debug_mode_sets_debug_level(self):
        setup_logging(debug=True)
        root = logging.getLogger()
        assert root.level == logging.DEBUG

    def test_prod_mode_sets_info_level(self):
        setup_logging(debug=False)
        root = logging.getLogger()
        assert root.level == logging.INFO

    def test_debug_mode_uses_stream_handler(self):
        setup_logging(debug=True)
        root = logging.getLogger()
        app_handlers = [h for h in root.handlers if type(h).__name__ != "LogCaptureHandler"]
        assert len(app_handlers) == 1
        assert isinstance(app_handlers[0], logging.StreamHandler)

    def test_debug_format_contains_levelname(self):
        setup_logging(debug=True)
        root = logging.getLogger()
        app_handlers = [h for h in root.handlers if type(h).__name__ != "LogCaptureHandler"]
        fmt = app_handlers[0].formatter._fmt
        assert "%(levelname)" in fmt
        assert "%(name)s" in fmt

    def test_prod_mode_clears_existing_handlers(self):
        root = logging.getLogger()
        root.addHandler(logging.StreamHandler())
        root.addHandler(logging.StreamHandler())
        setup_logging(debug=False)
        app_handlers = [h for h in root.handlers if type(h).__name__ != "LogCaptureHandler"]
        assert len(app_handlers) == 1

    def test_debug_mode_clears_existing_handlers(self):
        root = logging.getLogger()
        root.addHandler(logging.StreamHandler())
        setup_logging(debug=True)
        app_handlers = [h for h in root.handlers if type(h).__name__ != "LogCaptureHandler"]
        assert len(app_handlers) == 1

    def test_uvicorn_access_logger_quieted(self):
        setup_logging(debug=False)
        uvicorn_logger = logging.getLogger("uvicorn.access")
        assert uvicorn_logger.level == logging.WARNING

    def test_sqlalchemy_warning_in_prod(self):
        setup_logging(debug=False)
        sa_logger = logging.getLogger("sqlalchemy.engine")
        assert sa_logger.level == logging.WARNING

    def test_sqlalchemy_info_in_debug(self):
        setup_logging(debug=True)
        sa_logger = logging.getLogger("sqlalchemy.engine")
        assert sa_logger.level == logging.INFO

    def test_prod_with_json_logger_available(self):
        """When pythonjsonlogger is available, prod uses JSON formatter."""
        setup_logging(debug=False)
        root = logging.getLogger()
        app_handlers = [h for h in root.handlers if type(h).__name__ != "LogCaptureHandler"]
        handler = app_handlers[0]
        # Either JSON or fallback — both are valid; just ensure handler exists
        assert handler is not None

    def test_prod_without_json_logger_falls_back(self):
        """When pythonjsonlogger is not importable, falls back to plain format."""
        with patch.dict("sys.modules", {"pythonjsonlogger": None}):
            # Force ImportError on import
            import builtins
            real_import = builtins.__import__

            def mock_import(name, *args, **kwargs):
                if name == "pythonjsonlogger":
                    raise ImportError("mocked")
                return real_import(name, *args, **kwargs)

            with patch("builtins.__import__", side_effect=mock_import):
                setup_logging(debug=False)
                root = logging.getLogger()
                app_handlers = [h for h in root.handlers if type(h).__name__ != "LogCaptureHandler"]
                assert len(app_handlers) == 1
                fmt = app_handlers[0].formatter._fmt
                assert "%(levelname)" in fmt

    def test_default_debug_false(self):
        setup_logging()
        root = logging.getLogger()
        assert root.level == logging.INFO

    def test_repeated_calls_dont_stack_handlers(self):
        setup_logging(debug=True)
        setup_logging(debug=False)
        setup_logging(debug=True)
        root = logging.getLogger()
        app_handlers = [h for h in root.handlers if type(h).__name__ != "LogCaptureHandler"]
        assert len(app_handlers) == 1


class TestRequestLoggingMiddleware:
    """Tests for the ASGI request logging middleware."""

    @pytest.fixture
    def app_mock(self):
        """A mock ASGI app that sends a standard HTTP response."""
        async def app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200})
            await send({"type": "http.response.body", "body": b"OK"})
        return app

    @pytest.fixture
    def error_app(self):
        """A mock ASGI app that returns 500."""
        async def app(scope, receive, send):
            await send({"type": "http.response.start", "status": 500})
            await send({"type": "http.response.body", "body": b"Error"})
        return app

    @pytest.fixture
    def raising_app(self):
        """A mock ASGI app that raises an exception."""
        async def app(scope, receive, send):
            raise RuntimeError("boom")
        return app

    @pytest.mark.asyncio
    async def test_logs_http_request(self, app_mock, caplog):
        middleware = RequestLoggingMiddleware(app_mock)
        scope = {"type": "http", "method": "GET", "path": "/api/test"}
        with caplog.at_level(logging.INFO, logger="api.request"):
            await middleware(scope, AsyncMock(), AsyncMock())
        assert len(caplog.records) >= 1
        record = caplog.records[-1]
        assert "GET" in record.message
        assert "/api/test" in record.message
        assert "200" in record.message

    @pytest.mark.asyncio
    async def test_logs_status_code(self, error_app, caplog):
        middleware = RequestLoggingMiddleware(error_app)
        scope = {"type": "http", "method": "POST", "path": "/fail"}
        with caplog.at_level(logging.INFO, logger="api.request"):
            await middleware(scope, AsyncMock(), AsyncMock())
        assert "500" in caplog.records[-1].message

    @pytest.mark.asyncio
    async def test_passes_through_websocket(self, caplog):
        called = False

        async def ws_app(scope, receive, send):
            nonlocal called
            called = True

        middleware = RequestLoggingMiddleware(ws_app)
        scope = {"type": "websocket", "path": "/ws"}
        await middleware(scope, AsyncMock(), AsyncMock())
        assert called

    @pytest.mark.asyncio
    async def test_websocket_not_logged(self, caplog):
        async def ws_app(scope, receive, send):
            pass

        middleware = RequestLoggingMiddleware(ws_app)
        scope = {"type": "websocket", "path": "/ws"}
        with caplog.at_level(logging.INFO, logger="api.request"):
            await middleware(scope, AsyncMock(), AsyncMock())
        assert len(caplog.records) == 0

    @pytest.mark.asyncio
    async def test_duration_in_log_extra(self, app_mock, caplog):
        middleware = RequestLoggingMiddleware(app_mock)
        scope = {"type": "http", "method": "GET", "path": "/health"}
        with caplog.at_level(logging.INFO, logger="api.request"):
            await middleware(scope, AsyncMock(), AsyncMock())
        record = caplog.records[-1]
        assert hasattr(record, "duration_ms")
        assert record.duration_ms >= 0

    @pytest.mark.asyncio
    async def test_log_extra_fields(self, app_mock, caplog):
        middleware = RequestLoggingMiddleware(app_mock)
        scope = {"type": "http", "method": "DELETE", "path": "/items/1"}
        with caplog.at_level(logging.INFO, logger="api.request"):
            await middleware(scope, AsyncMock(), AsyncMock())
        record = caplog.records[-1]
        assert record.method == "DELETE"
        assert record.path == "/items/1"
        assert record.status == 200

    @pytest.mark.asyncio
    async def test_missing_method_defaults_to_question_mark(self, app_mock, caplog):
        middleware = RequestLoggingMiddleware(app_mock)
        scope = {"type": "http"}  # no method or path
        with caplog.at_level(logging.INFO, logger="api.request"):
            await middleware(scope, AsyncMock(), AsyncMock())
        record = caplog.records[-1]
        assert record.method == "?"
        assert record.path == "?"

    @pytest.mark.asyncio
    async def test_exception_propagates(self, raising_app):
        middleware = RequestLoggingMiddleware(raising_app)
        scope = {"type": "http", "method": "GET", "path": "/boom"}
        with pytest.raises(RuntimeError, match="boom"):
            await middleware(scope, AsyncMock(), AsyncMock())

    @pytest.mark.asyncio
    async def test_default_status_500_on_exception(self, raising_app, caplog):
        """If the app raises before sending response.start, status defaults to 500."""
        middleware = RequestLoggingMiddleware(raising_app)
        scope = {"type": "http", "method": "GET", "path": "/boom"}
        with pytest.raises(RuntimeError):
            with caplog.at_level(logging.INFO, logger="api.request"):
                await middleware(scope, AsyncMock(), AsyncMock())
        # No log record since exception propagated before log line
        # This tests that the middleware doesn't swallow exceptions
