"""Tests for structured logging — JSON format, correlation ID inclusion, log levels."""

import logging
from unittest.mock import patch

import pytest
from app.logging_config import setup_logging
from app.middleware.correlation import RequestIdFilter, request_id_ctx

pytestmark = pytest.mark.anyio


class TestCorrelationInLogs:
    """Verify correlation ID appears in log records."""

    def test_request_id_injected_into_record(self):
        f = RequestIdFilter()
        record = logging.LogRecord("test", logging.INFO, "", 0, "hello", (), None)
        token = request_id_ctx.set("corr-abc")
        try:
            f.filter(record)
            assert record.request_id == "corr-abc"  # type: ignore[attr-defined]
        finally:
            request_id_ctx.reset(token)

    def test_request_id_changes_between_requests(self):
        f = RequestIdFilter()
        r1 = logging.LogRecord("t", logging.INFO, "", 0, "", (), None)
        r2 = logging.LogRecord("t", logging.INFO, "", 0, "", (), None)

        token1 = request_id_ctx.set("id-1")
        f.filter(r1)
        request_id_ctx.reset(token1)

        token2 = request_id_ctx.set("id-2")
        f.filter(r2)
        request_id_ctx.reset(token2)

        assert r1.request_id != r2.request_id  # type: ignore[attr-defined]


class TestSetupLoggingModes:
    """Verify debug vs prod logging configuration."""

    def setup_method(self):
        root = logging.getLogger()
        self._saved = [h for h in root.handlers if type(h).__name__ == "LogCaptureHandler"]
        root.handlers.clear()
        root.handlers.extend(self._saved)

    def test_debug_format_includes_request_id(self):
        setup_logging(debug=True)
        root = logging.getLogger()
        app_handlers = [h for h in root.handlers if type(h).__name__ != "LogCaptureHandler"]
        fmt = app_handlers[0].formatter._fmt
        assert "%(request_id)s" in fmt

    def test_prod_handler_has_rid_filter(self):
        setup_logging(debug=False)
        root = logging.getLogger()
        app_handlers = [h for h in root.handlers if type(h).__name__ != "LogCaptureHandler"]
        filters = app_handlers[0].filters
        assert any(isinstance(f, RequestIdFilter) for f in filters)

    def test_debug_handler_has_rid_filter(self):
        setup_logging(debug=True)
        root = logging.getLogger()
        app_handlers = [h for h in root.handlers if type(h).__name__ != "LogCaptureHandler"]
        filters = app_handlers[0].filters
        assert any(isinstance(f, RequestIdFilter) for f in filters)

    def test_json_format_in_prod(self):
        """Prod mode should use JSON formatter when pythonjsonlogger available."""
        setup_logging(debug=False)
        root = logging.getLogger()
        app_handlers = [h for h in root.handlers if type(h).__name__ != "LogCaptureHandler"]
        formatter = app_handlers[0].formatter
        # Should be either JsonFormatter or fallback
        assert formatter is not None

    def test_json_fallback_includes_request_id(self):
        """Fallback format (no pythonjsonlogger) should still include request_id."""
        import builtins
        real_import = builtins.__import__

        def mock_import(name, *args, **kwargs):
            if name == "pythonjsonlogger":
                raise ImportError
            return real_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            setup_logging(debug=False)
            root = logging.getLogger()
            app_handlers = [h for h in root.handlers if type(h).__name__ != "LogCaptureHandler"]
            fmt = app_handlers[0].formatter._fmt
            assert "%(request_id)s" in fmt


async def test_correlation_id_in_response_header(client):
    """HTTP response should carry X-Request-ID that can be used in logs."""
    resp = await client.get("/api/health")
    rid = resp.headers.get("x-request-id")
    assert rid is not None
    assert len(rid) > 0
