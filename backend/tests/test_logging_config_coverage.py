"""Tests for structured logging — JSON format, correlation ID inclusion."""

import logging
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from app.logging_config import setup_logging, RequestLoggingMiddleware
from app.middleware.correlation import request_id_ctx


def test_setup_logging_debug_mode():
    """Debug mode uses human-readable format."""
    setup_logging(debug=True)
    root = logging.getLogger()
    assert root.level == logging.DEBUG
    assert len(root.handlers) >= 1


def test_setup_logging_prod_mode():
    """Production mode configures logging (JSON if available)."""
    setup_logging(debug=False)
    root = logging.getLogger()
    assert root.level == logging.INFO


def test_setup_logging_quiets_noisy_loggers():
    """Noisy loggers should be set to WARNING."""
    setup_logging(debug=False)
    assert logging.getLogger("uvicorn.access").level == logging.WARNING


def test_request_id_in_log_output():
    """Log records should include request_id from context."""
    setup_logging(debug=True)
    token = request_id_ctx.set("test-rid-123")
    try:
        logger = logging.getLogger("test.rid")
        # The filter should inject request_id
        record = logger.makeRecord("test", logging.INFO, "", 0, "hello", (), None)
        for handler in logging.getLogger().handlers:
            for f in handler.filters:
                f.filter(record)
        assert getattr(record, "request_id", "") == "test-rid-123"
    finally:
        request_id_ctx.reset(token)


def test_setup_logging_json_fallback():
    """When pythonjsonlogger is unavailable, falls back to text format."""
    import sys
    # Temporarily remove pythonjsonlogger from sys.modules
    saved = {}
    for key in list(sys.modules):
        if "pythonjsonlogger" in key:
            saved[key] = sys.modules.pop(key)

    orig_import = __builtins__.__import__ if hasattr(__builtins__, '__import__') else __import__

    def mock_import(name, *args, **kwargs):
        if "pythonjsonlogger" in name:
            raise ImportError("mocked")
        return orig_import(name, *args, **kwargs)

    with patch("builtins.__import__", side_effect=mock_import):
        setup_logging(debug=False)
        root = logging.getLogger()
        assert len(root.handlers) >= 1

    # Restore
    sys.modules.update(saved)


# ── RequestLoggingMiddleware ────────────────────────────────────────

@pytest.mark.anyio
async def test_request_logging_middleware_logs_request():
    """Middleware logs method, path, status, duration."""
    logged = []

    async def fake_app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    mw = RequestLoggingMiddleware(fake_app)

    sent = []
    async def mock_send(msg):
        sent.append(msg)

    with patch("app.logging_config.logging") as mock_logging:
        mock_logger = MagicMock()
        mock_logging.getLogger.return_value = mock_logger
        await mw({"type": "http", "method": "GET", "path": "/api/test"}, None, mock_send)
    mock_logger.info.assert_called_once()


@pytest.mark.anyio
async def test_request_logging_skips_non_http():
    """Middleware passes through non-HTTP scopes."""
    calls = []

    async def fake_app(scope, receive, send):
        calls.append(scope["type"])

    mw = RequestLoggingMiddleware(fake_app)
    await mw({"type": "websocket"}, None, None)
    assert calls == ["websocket"]
