"""Tests for scheduling router async helper functions."""
from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.routers.scheduling import (
    _collect_age_deletions,
    _collect_storage_deletions,
    _get_protected_ids,
)


def _utcnow():
    return datetime.now(tz=UTC)


# ── _get_protected_ids ──────────────────────────────────

class TestGetProtectedIds:
    @pytest.mark.asyncio
    async def test_disabled(self):
        db = AsyncMock()
        result = await _get_protected_ids(db, False)
        assert result == set()
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_enabled(self):
        db = AsyncMock()
        # execute returns a coroutine resolving to a result obj with sync .all()
        result_obj = MagicMock()
        result_obj.all.return_value = [("f1",), ("f2",), ("f3",)]
        db.execute.return_value = result_obj

        result = await _get_protected_ids(db, True)
        assert result == {"f1", "f2", "f3"}


# ── _collect_age_deletions ──────────────────────────────

class TestCollectAgeDeletions:
    @pytest.mark.asyncio
    @patch("app.routers.scheduling.utcnow")
    async def test_returns_unprotected_old_frames(self, mock_now):
        now = datetime.now(tz=UTC)
        mock_now.return_value = now

        f1 = SimpleNamespace(id="old1")
        f2 = SimpleNamespace(id="protected1")

        result_obj = MagicMock()
        scalars = MagicMock()
        scalars.all.return_value = [f1, f2]
        result_obj.scalars.return_value = scalars

        db = AsyncMock()
        db.execute.return_value = result_obj

        rule = SimpleNamespace(value=30)
        result = await _collect_age_deletions(db, rule, {"protected1"})
        assert result == {"old1"}

    @pytest.mark.asyncio
    @patch("app.routers.scheduling.utcnow")
    async def test_empty_when_no_old_frames(self, mock_now):
        mock_now.return_value = datetime.now(tz=UTC)

        result_obj = MagicMock()
        scalars = MagicMock()
        scalars.all.return_value = []
        result_obj.scalars.return_value = scalars

        db = AsyncMock()
        db.execute.return_value = result_obj

        result = await _collect_age_deletions(db, SimpleNamespace(value=30), set())
        assert result == set()


# ── _collect_storage_deletions ──────────────────────────

class TestCollectStorageDeletions:
    @pytest.mark.asyncio
    async def test_under_limit_returns_empty(self):
        total_result = MagicMock()
        total_result.scalar.return_value = 500

        db = AsyncMock()
        db.execute.return_value = total_result

        rule = SimpleNamespace(value=1)  # 1 GB
        result = await _collect_storage_deletions(db, rule, set())
        assert result == set()

    @pytest.mark.asyncio
    async def test_over_limit_deletes_oldest_unprotected(self):
        total_result = MagicMock()
        total_result.scalar.return_value = 2 * 1024 * 1024 * 1024

        f1 = SimpleNamespace(id="f1", file_size=1024 * 1024 * 1024)
        f2 = SimpleNamespace(id="f2", file_size=1024 * 1024 * 1024)

        frames_result = MagicMock()
        scalars = MagicMock()
        scalars.all.return_value = [f1, f2]
        frames_result.scalars.return_value = scalars

        db = AsyncMock()
        db.execute.side_effect = [total_result, frames_result]

        rule = SimpleNamespace(value=1)  # 1 GB limit
        result = await _collect_storage_deletions(db, rule, set())
        assert result == {"f1"}

    @pytest.mark.asyncio
    async def test_skips_protected_frames(self):
        total_result = MagicMock()
        total_result.scalar.return_value = 2 * 1024 * 1024 * 1024

        f1 = SimpleNamespace(id="f1", file_size=1024 * 1024 * 1024)
        f2 = SimpleNamespace(id="f2", file_size=1024 * 1024 * 1024)

        frames_result = MagicMock()
        scalars = MagicMock()
        scalars.all.return_value = [f1, f2]
        frames_result.scalars.return_value = scalars

        db = AsyncMock()
        db.execute.side_effect = [total_result, frames_result]

        rule = SimpleNamespace(value=1)
        result = await _collect_storage_deletions(db, rule, {"f1"})
        assert result == {"f2"}
