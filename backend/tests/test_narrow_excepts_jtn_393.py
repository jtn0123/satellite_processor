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


# ── bulk_delete_jobs + delete_job broker-down coverage ─────────────


@pytest.mark.asyncio
class TestBulkAndSingleDeleteRevokeBrokerDown:
    """The narrowed ``except _REVOKE_ERRORS`` block lives in THREE sites:
    cancel_job, bulk_delete_jobs, and delete_job. The first is covered
    above; these tests lock in the other two so a future refactor can't
    silently widen the catch again.
    """

    async def test_bulk_delete_tolerates_broker_outage(self, client, db, caplog):
        """``bulk_delete_jobs`` revokes tasks for each pending/processing
        job it deletes. A broker outage in the middle must log, not 500."""
        from app.db.models import Job

        jobs = [
            Job(id=f"3{i}345678-1234-1234-1234-123456789012", status="processing", task_id=f"task-{i}")
            for i in range(2)
        ]
        for j in jobs:
            db.add(j)
        await db.commit()

        with (
            patch("app.routers.jobs.celery_app") as mock_celery,
            caplog.at_level(logging.WARNING, logger="app.routers.jobs"),
        ):
            mock_celery.control.revoke.side_effect = OperationalError("bulk broker down")
            resp = await client.request(
                "DELETE",
                "/api/jobs/bulk",
                json={"job_ids": [j.id for j in jobs]},
            )

        assert resp.status_code == 200
        # Both task IDs should appear in the warning logs.
        task_ids_in_logs = {
            tid for record in caplog.records for tid in ("task-0", "task-1") if tid in record.getMessage()
        }
        assert task_ids_in_logs == {"task-0", "task-1"}

    async def test_delete_job_tolerates_broker_outage(self, client, db, caplog):
        """``delete_job`` also revokes a Celery task. A broker outage
        still proceeds with the DB delete — a dangling task is harmless
        once the row is gone."""
        from app.db.models import Job

        job = Job(
            id="42345678-1234-1234-1234-123456789012",
            status="processing",
            task_id="delete-task-xyz",
        )
        db.add(job)
        await db.commit()

        with (
            patch("app.routers.jobs.celery_app") as mock_celery,
            caplog.at_level(logging.WARNING, logger="app.routers.jobs"),
        ):
            mock_celery.control.revoke.side_effect = OperationalError("delete broker down")
            resp = await client.delete(f"/api/jobs/{job.id}")

        assert resp.status_code == 200
        assert any("delete-task-xyz" in r.getMessage() for r in caplog.records)


# ── bulk_download end-to-end hits _collect_job_files path branches ──


@pytest.mark.asyncio
class TestBulkDownloadExercisesCollectJobFiles:
    """``_collect_job_files`` runs inside ``bulk_download``. The existing
    unit tests stub the function directly; this test goes through the
    real endpoint so the narrowed ``except PathTraversalError`` /
    ``except OSError`` branches are hit in a realistic call stack.
    """

    async def test_bulk_download_skips_traversal_job_and_returns_others(self, client, db, tmp_path):
        from app.db.models import Job

        allowed = tmp_path / "allowed"
        allowed.mkdir()
        good_output = allowed / "good"
        good_output.mkdir()
        (good_output / "frame.png").write_text("x")

        good_job = Job(
            id="52345678-1234-1234-1234-123456789012",
            status="completed",
            output_path=str(good_output),
        )
        evil_job = Job(
            id="62345678-1234-1234-1234-123456789012",
            status="completed",
            # Path outside settings.output_dir → PathTraversalError inside
            # _collect_job_files. Must be skipped, not 500.
            output_path="/etc/passwd-fake",
        )
        db.add(good_job)
        db.add(evil_job)
        await db.commit()

        with patch("app.routers.download.settings") as mock_settings:
            mock_settings.output_dir = str(allowed)
            resp = await client.post(
                "/api/jobs/bulk-download",
                json={"ids": [good_job.id, evil_job.id]},
            )

        # The evil job is skipped (PathTraversalError branch inside
        # ``_collect_job_files``) but the good job's frame still streams,
        # so the endpoint returns a 200 zip rather than bubbling up a
        # 500. The assertion message includes the body so a future
        # regression surfaces "No completed jobs found" / "Output not
        # found" instead of a bare 404.
        assert resp.status_code == 200, f"body={resp.text[:300]}"
        assert len(resp.content) > 0
