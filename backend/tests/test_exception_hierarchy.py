"""Tests for the backend exception hierarchy (JTN-392).

These cover:
* Every concrete subclass of :class:`APIError` — default status code /
  error code, detail passthrough, and the one-way ``isinstance``
  relationship to the base.
* :class:`ProcessorError` is kept deliberately outside the HTTP
  hierarchy so router-level handlers never map a Celery-side crash to
  a 500 response through the wrong code path.
* The :func:`api_error_handler` emits the same JSON envelope for every
  subclass, so callers can swap ``raise APIError(...)`` for a narrow
  subclass without the response shape drifting.
* Positional-argument backward compatibility for :class:`APIError`
  itself — call sites that pre-date the hierarchy still work.
"""

from __future__ import annotations

import json

import pytest
from app.errors import (
    APIError,
    ConflictError,
    FetchError,
    ForbiddenError,
    NotFoundError,
    PathTraversalError,
    ProcessorConfigError,
    ProcessorError,
    ProcessorRuntimeError,
    RateLimitError,
    StorageError,
    UnauthorizedError,
    ValidationError,
    api_error_handler,
    validate_safe_path,
    validate_uuid,
)
from fastapi import Request


def _fake_request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/test"})


class TestBackwardCompatAPIError:
    def test_positional_args_still_work(self):
        exc = APIError(418, "teapot", "I'm a teapot")
        assert exc.status_code == 418
        assert exc.error == "teapot"
        assert exc.detail == "I'm a teapot"

    def test_default_detail_blank(self):
        exc = APIError(500, "internal")
        assert exc.detail == ""

    def test_inherits_from_exception(self):
        exc = APIError(500, "internal", "boom")
        assert isinstance(exc, Exception)
        # ``str(exc)`` should give back something useful for logs.
        assert "boom" in str(exc)


class TestValidationError:
    def test_defaults(self):
        exc = ValidationError("bad field")
        assert exc.status_code == 422
        assert exc.error == "validation_error"
        assert exc.detail == "bad field"
        assert isinstance(exc, APIError)

    def test_custom_error_code(self):
        exc = ValidationError("too many", error="too_many_items")
        assert exc.error == "too_many_items"
        assert exc.status_code == 422

    def test_custom_status_code(self):
        exc = ValidationError("nope", error="no_jobs", status_code=400)
        assert exc.status_code == 400
        assert exc.error == "no_jobs"


class TestNotFoundError:
    def test_defaults(self):
        exc = NotFoundError("missing")
        assert exc.status_code == 404
        assert exc.error == "not_found"
        assert exc.detail == "missing"
        assert isinstance(exc, APIError)

    def test_custom_error_code(self):
        exc = NotFoundError("gone", error="images_not_found")
        assert exc.error == "images_not_found"
        assert exc.status_code == 404


class TestForbiddenError:
    def test_defaults(self):
        exc = ForbiddenError("nope")
        assert exc.status_code == 403
        assert exc.error == "forbidden"
        assert isinstance(exc, APIError)


class TestConflictError:
    def test_defaults(self):
        exc = ConflictError("raced")
        assert exc.status_code == 409
        assert exc.error == "conflict"
        assert isinstance(exc, APIError)


class TestUnauthorizedError:
    def test_defaults(self):
        exc = UnauthorizedError("bad key")
        assert exc.status_code == 401
        assert exc.error == "unauthorized"
        assert isinstance(exc, APIError)


class TestRateLimitError:
    def test_defaults(self):
        exc = RateLimitError("slow down")
        assert exc.status_code == 429
        assert exc.error == "rate_limited"
        assert isinstance(exc, APIError)


class TestFetchError:
    def test_defaults(self):
        exc = FetchError("upstream down")
        assert exc.status_code == 502
        assert exc.error == "fetch_failed"
        assert isinstance(exc, APIError)

    def test_override_status_for_timeout(self):
        exc = FetchError("too slow", status_code=504, error="fetch_timeout")
        assert exc.status_code == 504
        assert exc.error == "fetch_timeout"


class TestStorageError:
    def test_defaults(self):
        exc = StorageError("disk full")
        assert exc.status_code == 500
        assert exc.error == "storage_error"
        assert isinstance(exc, APIError)

    def test_override_status(self):
        exc = StorageError("bad input", status_code=400, error="bad_path")
        assert exc.status_code == 400
        assert exc.error == "bad_path"


class TestPathTraversalError:
    def test_is_storage_subclass(self):
        exc = PathTraversalError()
        assert isinstance(exc, StorageError)
        assert isinstance(exc, APIError)

    def test_uses_forbidden_status(self):
        exc = PathTraversalError()
        assert exc.status_code == 403
        assert exc.error == "forbidden"

    def test_default_detail(self):
        exc = PathTraversalError()
        assert "outside allowed directory" in exc.detail

    def test_custom_detail(self):
        exc = PathTraversalError("File path outside allowed directories")
        assert exc.detail == "File path outside allowed directories"
        assert exc.status_code == 403


class TestProcessorHierarchy:
    def test_processor_error_not_api_error(self):
        """ProcessorError is deliberately *not* an APIError.

        Celery tasks raise / catch it; routers never do. Keeping them
        in disjoint hierarchies makes it a compile-time error (well,
        ``isinstance`` check) if someone tries to raise one in an HTTP
        path by mistake.
        """
        exc = ProcessorError("boom")
        assert not isinstance(exc, APIError)
        assert isinstance(exc, Exception)

    def test_config_and_runtime_are_processor_errors(self):
        assert isinstance(ProcessorConfigError("bad opts"), ProcessorError)
        assert isinstance(ProcessorRuntimeError("crashed"), ProcessorError)

    def test_message_passthrough(self):
        exc = ProcessorRuntimeError("pipeline stage 3 failed")
        assert exc.message == "pipeline stage 3 failed"
        assert "pipeline stage 3 failed" in str(exc)


class TestAPIErrorHandlerAcrossHierarchy:
    """The FastAPI handler must produce the same envelope for every subclass."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("exc", "expected_status", "expected_error"),
        [
            (NotFoundError("x"), 404, "not_found"),
            (ValidationError("x"), 422, "validation_error"),
            (ValidationError("x", status_code=400), 400, "validation_error"),
            (ForbiddenError("x"), 403, "forbidden"),
            (ConflictError("x"), 409, "conflict"),
            (UnauthorizedError("x"), 401, "unauthorized"),
            (RateLimitError("x"), 429, "rate_limited"),
            (FetchError("x"), 502, "fetch_failed"),
            (StorageError("x"), 500, "storage_error"),
            (PathTraversalError(), 403, "forbidden"),
        ],
    )
    async def test_handler_returns_expected_envelope(self, exc, expected_status, expected_error):
        response = api_error_handler(_fake_request(), exc)
        assert response.status_code == expected_status
        body = json.loads(response.body)
        assert body == {
            "error": expected_error,
            "detail": exc.detail,
            "status_code": expected_status,
        }


class TestValidateUuidRaises404:
    """``validate_uuid`` raises an ``APIError`` with status 404 on invalid input.

    JTN-392 preserves the existing APIError call style in the helper so
    migration can be incremental — subclasses are available for new code
    but existing raises keep working.
    """

    def test_valid_uuid_returns_value(self):
        value = "12345678-1234-1234-1234-123456789012"
        assert validate_uuid(value) == value

    def test_invalid_uuid_raises_not_found(self):
        with pytest.raises(APIError) as exc_info:
            validate_uuid("not-a-uuid")
        assert exc_info.value.status_code == 404
        assert "invalid id" in exc_info.value.detail

    def test_custom_name_in_detail(self):
        with pytest.raises(APIError) as exc_info:
            validate_uuid("nope", name="job_id")
        assert "invalid job_id" in exc_info.value.detail


class TestValidateSafePathUsesPathTraversalError:
    def test_rejects_escape_with_traversal_subclass(self, tmp_path):
        root = tmp_path / "allowed"
        root.mkdir()
        evil = tmp_path / "outside.txt"
        evil.touch()

        with pytest.raises(PathTraversalError) as exc_info:
            validate_safe_path(str(evil), str(root))

        err = exc_info.value
        assert isinstance(err, StorageError)
        assert isinstance(err, APIError)
        assert err.status_code == 403

    def test_accepts_path_within_root(self, tmp_path):
        root = tmp_path / "allowed"
        root.mkdir()
        child = root / "file.txt"
        child.touch()

        result = validate_safe_path(str(child), str(root))
        assert result == child.resolve()
