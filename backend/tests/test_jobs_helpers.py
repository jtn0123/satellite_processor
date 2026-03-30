"""Tests for jobs router helper functions."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.routers.jobs import _calc_dir_size, _delete_job_files, _get_job_task_id


class TestCalcDirSize:
    def test_existing_dir(self, tmp_path):
        (tmp_path / "a.txt").write_bytes(b"x" * 100)
        (tmp_path / "b.txt").write_bytes(b"y" * 200)
        assert _calc_dir_size(str(tmp_path)) == 300

    def test_nonexistent_dir(self):
        assert _calc_dir_size("/nonexistent/path") == 0

    def test_empty_dir(self, tmp_path):
        assert _calc_dir_size(str(tmp_path)) == 0

    def test_nested_dir(self, tmp_path):
        sub = tmp_path / "sub"
        sub.mkdir()
        (sub / "file.txt").write_bytes(b"z" * 50)
        assert _calc_dir_size(str(tmp_path)) == 50


class TestGetJobTaskId:
    def test_from_task_id(self):
        job = SimpleNamespace(task_id="abc-123", status_message=None)
        assert _get_job_task_id(job) == "abc-123"

    def test_from_legacy_status_message(self):
        job = SimpleNamespace(task_id=None, status_message="celery_task_id:xyz-456")
        assert _get_job_task_id(job) == "xyz-456"

    def test_none_when_no_task(self):
        job = SimpleNamespace(task_id=None, status_message=None)
        assert _get_job_task_id(job) is None

    def test_none_when_unrelated_message(self):
        job = SimpleNamespace(task_id=None, status_message="Processing complete")
        assert _get_job_task_id(job) is None

    def test_task_id_takes_priority(self):
        job = SimpleNamespace(task_id="primary", status_message="celery_task_id:secondary")
        assert _get_job_task_id(job) == "primary"


class TestDeleteJobFiles:
    @pytest.mark.asyncio
    async def test_uses_asyncio_to_thread_for_dir_size(self):
        """Verify _calc_dir_size runs via asyncio.to_thread (not blocking)."""
        job = SimpleNamespace(
            id="test-job-1",
            output_path=None,
        )

        db = AsyncMock()
        # No frames found
        frames_result = MagicMock()
        frames_result.scalars.return_value.all.return_value = []
        db.execute.return_value = frames_result

        with (
            patch("app.routers.jobs.os.path.isdir", return_value=False),
            patch("app.routers.jobs.asyncio.to_thread") as mock_to_thread,
        ):
            mock_to_thread.return_value = 0
            result = await _delete_job_files(db, job)

        # to_thread should NOT have been called since isdir returned False
        mock_to_thread.assert_not_called()
        assert result == 0

    @pytest.mark.asyncio
    async def test_bulk_deletes_frames(self):
        """Verify frames are deleted in bulk, not one at a time."""
        frame1 = SimpleNamespace(id="f1", file_path="/tmp/f1.nc", thumbnail_path=None)
        frame2 = SimpleNamespace(id="f2", file_path="/tmp/f2.nc", thumbnail_path="/tmp/f2_thumb.jpg")

        job = SimpleNamespace(id="test-job-2", output_path=None)

        frames_result = MagicMock()
        frames_result.scalars.return_value.all.return_value = [frame1, frame2]

        db = AsyncMock()
        # First execute: GoesFrame query, then bulk CollectionFrame delete,
        # then bulk GoesFrame delete, then JobLog delete
        db.execute.return_value = frames_result

        with (
            patch("app.routers.jobs.os.path.isdir", return_value=False),
            patch("app.routers.jobs.safe_remove", return_value=100) as mock_remove,
        ):
            result = await _delete_job_files(db, job)

        # safe_remove called for each file (f1.nc, f2.nc, f2_thumb.jpg)
        assert mock_remove.call_count == 3
        assert result == 300

        # Check that bulk deletes were executed (CollectionFrame + GoesFrame + JobLog = 3 more)
        # Total db.execute calls: 1 (select frames) + 1 (bulk CF delete) + 1 (bulk GF delete) + 1 (JobLog) = 4
        assert db.execute.call_count == 4

    @pytest.mark.asyncio
    async def test_no_frames_skips_bulk_delete(self):
        """When no frames exist, bulk delete queries should not be executed."""
        job = SimpleNamespace(id="test-job-3", output_path=None)

        frames_result = MagicMock()
        frames_result.scalars.return_value.all.return_value = []

        db = AsyncMock()
        db.execute.return_value = frames_result

        with patch("app.routers.jobs.os.path.isdir", return_value=False):
            result = await _delete_job_files(db, job)

        assert result == 0
        # 1 (select frames) + 1 (JobLog delete) = 2 calls (no bulk frame deletes)
        assert db.execute.call_count == 2

    @pytest.mark.asyncio
    async def test_to_thread_called_for_existing_dir(self):
        """Verify asyncio.to_thread is used for directory size calculation."""
        job = SimpleNamespace(id="test-job-4", output_path="/tmp/output-dir")

        frames_result = MagicMock()
        frames_result.scalars.return_value.all.return_value = []
        db = AsyncMock()
        db.execute.return_value = frames_result

        with (
            patch("app.routers.jobs.os.path.isdir", side_effect=lambda p: p == "/tmp/output-dir"),
            patch("app.routers.jobs.asyncio.to_thread", return_value=5000) as mock_to_thread,
            patch("app.routers.jobs.shutil.rmtree"),
        ):
            result = await _delete_job_files(db, job)

        mock_to_thread.assert_called_once_with(_calc_dir_size, "/tmp/output-dir")
        assert result == 5000
