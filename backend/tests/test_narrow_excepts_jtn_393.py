"""Tests for narrowed ``except`` blocks (JTN-393).

These regression tests lock in the three sites the original issue
called out:

1. ``backend/app/routers/download.py`` — ``_collect_job_files`` used to
   catch a bare ``Exception`` with no logging, hiding both path-traversal
   attempts and genuine I/O bugs. It now narrows to
   :class:`PathTraversalError` and :class:`OSError` and emits a warning
   log line containing the job id.
2. ``backend/app/routers/jobs.py`` — three ``celery_app.control.revoke``
   call sites all had broad ``except Exception`` catches with no stack
   trace. They now narrow to
   :data:`app.routers.jobs._REVOKE_ERRORS` and log ``exc_info=True``.
3. ``backend/app/tasks/processing.py`` — the task-boundary ``except``
   used to catch bare ``Exception`` and swallow bugs like
   ``AttributeError`` into a generic "Processing failed" status. It now
   splits expected and unexpected failures into two handlers so
   unexpected crashes still mark the job failed but get a distinct
   ``Crash:`` status message and a real traceback in the logs.
"""

from __future__ import annotations

import logging
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from app.errors import PathTraversalError
from app.routers.download import _collect_job_files
from app.routers.jobs import _REVOKE_ERRORS
from app.tasks.processing import _EXPECTED_PROCESSING_ERRORS
from celery.exceptions import CeleryError
from kombu.exceptions import KombuError, OperationalError

# ── _collect_job_files narrowing (JTN-393 site 1) ─────────────────


class TestCollectJobFilesNarrowExcept:
    def test_happy_path_returns_files(self, tmp_path):
        output = tmp_path / "output"
        output.mkdir()
        (output / "a.png").write_text("a")
        (output / "b.png").write_text("b")

        with patch("app.routers.download.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            job = SimpleNamespace(id="job1", output_path=str(output))
            files = _collect_job_files(job)

        names = sorted(arc for _, arc in files)
        assert names == ["a.png", "b.png"]

    def test_path_traversal_skipped_with_warning(self, tmp_path, caplog):
        """A traversal attempt must be logged so it is traceable."""
        allowed = tmp_path / "allowed"
        allowed.mkdir()
        evil = tmp_path / "outside"
        evil.mkdir()

        with patch("app.routers.download.settings") as mock_settings:
            mock_settings.output_dir = str(allowed)
            job = SimpleNamespace(id="abc-1", output_path=str(evil))
            with caplog.at_level(logging.WARNING, logger="app.routers.download"):
                result = _collect_job_files(job)

        assert result == []
        # Warning must carry the job id so ops can correlate.
        assert any("abc-1" in record.getMessage() for record in caplog.records)
        # And must identify the escaped path.
        assert any("escapes" in record.getMessage() for record in caplog.records)

    def test_os_error_skipped_with_warning(self, tmp_path, caplog):
        """An OSError from path resolution is skipped with a warning.

        The narrow except covers both :class:`PathTraversalError` and
        :class:`OSError` — stat failures on broken mounts must not
        crash the whole bulk-download.
        """
        allowed = tmp_path / "allowed"
        allowed.mkdir()

        def _boom(*_args, **_kwargs):
            raise OSError("stat failed")

        with (
            patch("app.routers.download.settings") as mock_settings,
            patch("app.routers.download.validate_safe_path", side_effect=_boom),
        ):
            mock_settings.output_dir = str(allowed)
            job = SimpleNamespace(id="xyz-2", output_path=str(allowed / "missing"))
            with caplog.at_level(logging.WARNING, logger="app.routers.download"):
                result = _collect_job_files(job)

        assert result == []
        assert any("xyz-2" in record.getMessage() for record in caplog.records)
        assert any("stat failed" in record.getMessage() for record in caplog.records)

    def test_unexpected_exception_not_swallowed(self, tmp_path):
        """A ``TypeError`` (or any non-OSError bug) must NOT be caught.

        This is the regression that motivated JTN-393: the old bare
        ``except Exception`` hid genuine bugs. After narrowing, the
        function should propagate the original exception.
        """
        allowed = tmp_path / "allowed"
        allowed.mkdir()

        def _boom(*_args, **_kwargs):
            raise TypeError("unexpected bug")

        with (
            patch("app.routers.download.settings") as mock_settings,
            patch("app.routers.download.validate_safe_path", side_effect=_boom),
        ):
            mock_settings.output_dir = str(allowed)
            job = SimpleNamespace(id="bug-3", output_path=str(allowed / "x"))
            with pytest.raises(TypeError, match="unexpected bug"):
                _collect_job_files(job)

    def test_path_traversal_error_type_explicitly(self, tmp_path):
        """Double-check the specific class (not a parent) is caught."""
        allowed = tmp_path / "allowed"
        allowed.mkdir()

        def _boom(*_args, **_kwargs):
            raise PathTraversalError("custom detail")

        with (
            patch("app.routers.download.settings") as mock_settings,
            patch("app.routers.download.validate_safe_path", side_effect=_boom),
        ):
            mock_settings.output_dir = str(allowed)
            job = SimpleNamespace(id="trav-4", output_path=str(allowed / "x"))
            assert _collect_job_files(job) == []


# ── Revoke error tuple (JTN-393 site 2) ────────────────────────────


class TestRevokeErrorTuple:
    """``_REVOKE_ERRORS`` is the narrowed catch for Celery control.revoke."""

    def test_contains_kombu_and_celery_and_oserror(self):
        assert KombuError in _REVOKE_ERRORS
        assert CeleryError in _REVOKE_ERRORS
        assert OSError in _REVOKE_ERRORS

    def test_operational_error_matches_via_subclass(self):
        """kombu.exceptions.OperationalError subclasses KombuError."""
        assert issubclass(OperationalError, KombuError)
        try:
            raise OperationalError("broker down")
        except _REVOKE_ERRORS as caught:
            assert isinstance(caught, OperationalError)
        else:  # pragma: no cover - defensive
            pytest.fail("OperationalError was not caught by _REVOKE_ERRORS")

    def test_does_not_catch_runtime_error(self):
        """A bare RuntimeError must NOT be caught — that's a bug we want to see."""
        with pytest.raises(RuntimeError):
            try:
                raise RuntimeError("unexpected")
            except _REVOKE_ERRORS:
                pytest.fail("RuntimeError was silently swallowed")


# ── Expected processing errors tuple (JTN-393 site 3) ──────────────


class TestExpectedProcessingErrorsTuple:
    """``_EXPECTED_PROCESSING_ERRORS`` is the narrowed catch for the task body."""

    def test_contains_common_io_errors(self):
        assert ValueError in _EXPECTED_PROCESSING_ERRORS
        assert FileNotFoundError in _EXPECTED_PROCESSING_ERRORS
        assert PermissionError in _EXPECTED_PROCESSING_ERRORS
        assert OSError in _EXPECTED_PROCESSING_ERRORS
        assert TimeoutError in _EXPECTED_PROCESSING_ERRORS
        assert ConnectionError in _EXPECTED_PROCESSING_ERRORS

    def test_contains_processor_error(self):
        from app.errors import ProcessorError

        assert ProcessorError in _EXPECTED_PROCESSING_ERRORS

    def test_does_not_contain_attribute_error(self):
        """AttributeError is the canonical "bug" signal we must surface.

        JTN-393 explicitly calls this out: a misconfigured
        ``processor.process()`` used to AttributeError and get masked.
        """
        assert AttributeError not in _EXPECTED_PROCESSING_ERRORS
        # Also not a parent class.
        for cls in _EXPECTED_PROCESSING_ERRORS:
            assert not issubclass(AttributeError, cls)

    def test_does_not_contain_type_error(self):
        """TypeError is also a bug signal, not an expected failure mode."""
        assert TypeError not in _EXPECTED_PROCESSING_ERRORS
        for cls in _EXPECTED_PROCESSING_ERRORS:
            assert not issubclass(TypeError, cls)

    def test_connection_error_catches_timeout(self):
        """TimeoutError subclasses OSError in Python 3, so the tuple overlaps
        correctly — we still list both for clarity."""
        assert issubclass(TimeoutError, OSError)


# ── End-to-end cancel_job revoke failure (JTN-393 site 2) ──────────


@pytest.mark.asyncio
class TestCancelJobRevokeBrokerDown:
    """Cancel flow must tolerate revoke() raising a broker error.

    The DB transition is atomic and already committed by the time
    ``revoke`` is called — a broker outage at that point used to be
    caught by a bare ``except Exception`` with a bare one-line
    warning. It's now narrowed to ``_REVOKE_ERRORS`` with
    ``exc_info=True`` so the stack is visible in the logs.
    """

    async def test_operational_error_does_not_fail_cancel(self, client, db, caplog):
        from app.db.models import Job

        job = Job(
            id="12345678-1234-1234-1234-123456789012",
            status="processing",
            task_id="celery-task-abc",
        )
        db.add(job)
        await db.commit()

        with (
            patch("app.routers.jobs.celery_app") as mock_celery,
            caplog.at_level(logging.WARNING, logger="app.routers.jobs"),
        ):
            mock_celery.control.revoke.side_effect = OperationalError("broker down")
            resp = await client.post(f"/api/jobs/{job.id}/cancel")

        # The cancel endpoint still returns 200 because the DB
        # transition succeeded; the revoke failure is logged, not
        # fatal.
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["cancelled"] is True
        # And the log line must include enough context to debug.
        assert any("celery-task-abc" in record.getMessage() for record in caplog.records)

    async def test_unrelated_exception_would_propagate(self, db):
        """A ``RuntimeError`` from revoke is NOT in ``_REVOKE_ERRORS`` and
        must therefore propagate — otherwise narrowing is pointless.

        We use a dedicated client with ``raise_app_exceptions=False`` so
        the unhandled exception bubbles up to the exception-handler
        middleware (HTTP 500) instead of ASGITransport's default
        behaviour of re-raising into the test.
        """
        from app.db.models import Job
        from app.main import app
        from httpx import ASGITransport, AsyncClient

        job = Job(
            id="22345678-1234-1234-1234-123456789012",
            status="processing",
            task_id="celery-task-xyz",
        )
        db.add(job)
        await db.commit()

        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            with patch("app.routers.jobs.celery_app") as mock_celery:
                mock_celery.control.revoke.side_effect = RuntimeError("this is a bug")
                resp = await ac.post(f"/api/jobs/{job.id}/cancel")

        # The global exception handler in ``app.main`` maps any
        # unhandled exception to 500 — we just care that the narrow
        # ``except _REVOKE_ERRORS`` did NOT swallow the RuntimeError.
        assert resp.status_code == 500
