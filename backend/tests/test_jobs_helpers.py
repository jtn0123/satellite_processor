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
    async def test_skips_to_thread_when_no_dirs_exist(self):
        """Verify asyncio.to_thread is skipped when neither cleanup directory exists."""
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
    async def test_bulk_deletes_chunks_large_frame_sets(self):
        """Verify frames are deleted in chunks when exceeding chunk_size of 500."""
        frames = [SimpleNamespace(id=f"f{i}", file_path=None, thumbnail_path=None) for i in range(501)]

        job = SimpleNamespace(id="test-job-chunked", output_path=None)

        frames_result = MagicMock()
        frames_result.scalars.return_value.all.return_value = frames

        db = AsyncMock()
        db.execute.return_value = frames_result

        with patch("app.routers.jobs.os.path.isdir", return_value=False):
            await _delete_job_files(db, job)

        # 1 (select frames) + 2 (CF deletes for 2 chunks) + 2 (GF deletes for 2 chunks) + 1 (JobLog) = 6
        assert db.execute.call_count == 6

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
        """Verify asyncio.to_thread is used for both size calc and rmtree."""
        import shutil

        job = SimpleNamespace(id="test-job-4", output_path="/tmp/output-dir")

        frames_result = MagicMock()
        frames_result.scalars.return_value.all.return_value = []
        db = AsyncMock()
        db.execute.return_value = frames_result

        # to_thread is called twice: once for _calc_dir_size (returns 5000), once for rmtree (returns None)
        with (
            patch("app.routers.jobs.os.path.isdir", side_effect=lambda p: p == "/tmp/output-dir"),
            patch("app.routers.jobs.asyncio.to_thread", side_effect=[5000, None]) as mock_to_thread,
        ):
            result = await _delete_job_files(db, job)

        assert mock_to_thread.call_count == 2
        mock_to_thread.assert_any_call(_calc_dir_size, "/tmp/output-dir")
        mock_to_thread.assert_any_call(shutil.rmtree, "/tmp/output-dir", True)
        assert result == 5000

    @pytest.mark.asyncio
    async def test_to_thread_called_for_goes_dir(self):
        """Verify goes_<job_id> directory is also cleaned via to_thread."""
        job = SimpleNamespace(id="test-job-5", output_path=None)

        frames_result = MagicMock()
        frames_result.scalars.return_value.all.return_value = []
        db = AsyncMock()
        db.execute.return_value = frames_result

        def isdir_side_effect(p):
            # The output_path doesn't exist, but the goes_ dir does
            return "goes_test-job-5" in p

        # to_thread called twice for goes_dir: _calc_dir_size + rmtree
        with (
            patch("app.routers.jobs.os.path.isdir", side_effect=isdir_side_effect),
            patch("app.routers.jobs.asyncio.to_thread", side_effect=[3000, None]) as mock_to_thread,
        ):
            result = await _delete_job_files(db, job)

        assert mock_to_thread.call_count == 2
        assert result == 3000

    @pytest.mark.asyncio
    async def test_both_dirs_cleaned(self):
        """Verify both output_path and goes_ directories are cleaned."""
        job = SimpleNamespace(id="test-job-6", output_path="/tmp/my-output")

        frames_result = MagicMock()
        frames_result.scalars.return_value.all.return_value = []
        db = AsyncMock()
        db.execute.return_value = frames_result

        # 4 to_thread calls: calc_size(output) + rmtree(output) + calc_size(goes) + rmtree(goes)
        with (
            patch("app.routers.jobs.os.path.isdir", return_value=True),
            patch("app.routers.jobs.asyncio.to_thread", side_effect=[2000, None, 2000, None]) as mock_to_thread,
        ):
            result = await _delete_job_files(db, job)

        assert mock_to_thread.call_count == 4
        assert result == 4000
