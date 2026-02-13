"""Unit tests for error handling module."""

import pytest
from fastapi import Request
from starlette.testclient import TestClient

from app.errors import APIError, api_error_handler


class TestAPIError:
    def test_attributes(self):
        err = APIError(404, "not_found", "Item missing")
        assert err.status_code == 404
        assert err.error == "not_found"
        assert err.detail == "Item missing"

    def test_default_detail(self):
        err = APIError(500, "internal")
        assert err.detail == ""

    def test_is_exception(self):
        err = APIError(400, "bad_request")
        assert isinstance(err, Exception)


@pytest.mark.asyncio
async def test_api_error_handler_response():
    """Verify the handler returns correct JSON structure."""
    exc = APIError(422, "validation_error", "bad field")
    # Create a mock request
    scope = {"type": "http", "method": "GET", "path": "/test"}
    request = Request(scope)
    response = api_error_handler(request, exc)
    assert response.status_code == 422
    assert response.body == b'{"error":"validation_error","detail":"bad field"}'


@pytest.mark.asyncio
async def test_api_error_handler_empty_detail():
    exc = APIError(500, "internal")
    scope = {"type": "http", "method": "GET", "path": "/test"}
    request = Request(scope)
    response = api_error_handler(request, exc)
    assert response.status_code == 500
    body = response.body.decode()
    assert '"detail":""' in body
