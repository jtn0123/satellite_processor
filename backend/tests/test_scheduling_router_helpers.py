"""Tests for scheduling router async helper functions."""
from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.routers.scheduling import (
    _collect_age_deletions,
    _collect_storage_deletions,
    _get_frames_to_cleanup,
    _get_protected_ids,
    _schedule_response,
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
        result_obj = MagicMock()
        result_obj.all.return_value = [("f1",), ("f2",), ("f3",)]
        db.execute.return_value = result_obj

        result = await _get_protected_ids(db, True)
        assert result == {"f1", "f2", "f3"}

    @pytest.mark.asyncio
    async def test_enabled_empty(self):
        db = AsyncMock()
        result_obj = MagicMock()
        result_obj.all.return_value = []
        db.execute.return_value = result_obj

        result = await _get_protected_ids(db, True)
        assert result == set()


# ── _collect_age_deletions ──────────────────────────────

class TestCollectAgeDeletions:
    @pytest.mark.asyncio
    @patch("app.routers.scheduling.utcnow")
    async def test_returns_unprotected_old_frames(self, mock_now):
        now = datetime.now(tz=UTC)
        mock_now.return_value = now

        # Function now uses select(GoesFrame.id) and filters protected in query
        # so the DB result only contains unprotected IDs as raw tuples
        result_obj = MagicMock()
        result_obj.all.return_value = [("old1",)]

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
        result_obj.all.return_value = []

        db = AsyncMock()
        db.execute.return_value = result_obj

        result = await _collect_age_deletions(db, SimpleNamespace(value=30), set())
        assert result == set()

    @pytest.mark.asyncio
    @patch("app.routers.scheduling.utcnow")
    async def test_all_protected(self, mock_now):
        mock_now.return_value = datetime.now(tz=UTC)

        # Protected IDs are filtered in the query, so DB returns empty
        result_obj = MagicMock()
        result_obj.all.return_value = []

        db = AsyncMock()
        db.execute.return_value = result_obj

        result = await _collect_age_deletions(db, SimpleNamespace(value=30), {"f1"})
        assert result == set()


# ── _collect_storage_deletions ──────────────────────────

class TestCollectStorageDeletions:
    @pytest.mark.asyncio
    async def test_under_limit_returns_empty(self):
        total_result = MagicMock()
        total_result.scalar.return_value = 500

        db = AsyncMock()
        db.execute.return_value = total_result

        rule = SimpleNamespace(value=1)
        result = await _collect_storage_deletions(db, rule, set())
        assert result == set()

    @pytest.mark.asyncio
    async def test_over_limit_deletes_oldest_unprotected(self):
        total_result = MagicMock()
        total_result.scalar.return_value = 2 * 1024 * 1024 * 1024

        frames_result = MagicMock()
        frames_result.all.return_value = [
            ("f1", 1024 * 1024 * 1024),
            ("f2", 1024 * 1024 * 1024),
        ]

        db = AsyncMock()
        db.execute.side_effect = [total_result, frames_result]

        rule = SimpleNamespace(value=1)
        result = await _collect_storage_deletions(db, rule, set())
        assert result == {"f1"}

    @pytest.mark.asyncio
    async def test_skips_protected_frames(self):
        total_result = MagicMock()
        total_result.scalar.return_value = 2 * 1024 * 1024 * 1024

        # Protected IDs are filtered in the query, so only unprotected returned
        frames_result = MagicMock()
        frames_result.all.return_value = [
            ("f2", 1024 * 1024 * 1024),
        ]

        db = AsyncMock()
        db.execute.side_effect = [total_result, frames_result]

        rule = SimpleNamespace(value=1)
        result = await _collect_storage_deletions(db, rule, {"f1"})
        assert result == {"f2"}

    @pytest.mark.asyncio
    async def test_none_file_size(self):
        total_result = MagicMock()
        total_result.scalar.return_value = 2 * 1024 * 1024 * 1024

        frames_result = MagicMock()
        frames_result.all.return_value = [
            ("f1", None),
            ("f2", 2 * 1024 * 1024 * 1024),
        ]

        db = AsyncMock()
        db.execute.side_effect = [total_result, frames_result]

        rule = SimpleNamespace(value=1)
        result = await _collect_storage_deletions(db, rule, set())
        assert "f1" in result
        assert "f2" in result

    @pytest.mark.asyncio
    async def test_zero_total(self):
        total_result = MagicMock()
        total_result.scalar.return_value = 0

        db = AsyncMock()
        db.execute.return_value = total_result

        rule = SimpleNamespace(value=1)
        result = await _collect_storage_deletions(db, rule, set())
        assert result == set()


# ── _get_frames_to_cleanup ──────────────────────────────

class TestGetFramesToCleanup:
    @pytest.mark.asyncio
    @patch("app.routers.scheduling._collect_storage_deletions")
    @patch("app.routers.scheduling._collect_age_deletions")
    @patch("app.routers.scheduling._get_protected_ids")
    async def test_no_rules(self, mock_prot, mock_age, mock_storage):
        rules_result = MagicMock()
        scalars = MagicMock()
        scalars.all.return_value = []
        rules_result.scalars.return_value = scalars

        db = AsyncMock()
        db.execute.return_value = rules_result

        result = await _get_frames_to_cleanup(db)
        assert result == []

    @pytest.mark.asyncio
    @patch("app.routers.scheduling._collect_age_deletions")
    @patch("app.routers.scheduling._get_protected_ids")
    async def test_age_rule(self, mock_prot, mock_age):
        rule = SimpleNamespace(rule_type="max_age_days", protect_collections=False)
        rules_result = MagicMock()
        scalars = MagicMock()
        scalars.all.return_value = [rule]
        rules_result.scalars.return_value = scalars

        mock_prot.return_value = set()
        mock_age.return_value = {"f1", "f2"}

        frame1 = SimpleNamespace(id="f1")
        frame2 = SimpleNamespace(id="f2")
        frames_result = MagicMock()
        frames_scalars = MagicMock()
        frames_scalars.all.return_value = [frame1, frame2]
        frames_result.scalars.return_value = frames_scalars

        db = AsyncMock()
        db.execute.side_effect = [rules_result, frames_result]

        result = await _get_frames_to_cleanup(db)
        assert len(result) == 2

    @pytest.mark.asyncio
    @patch("app.routers.scheduling._collect_storage_deletions")
    @patch("app.routers.scheduling._get_protected_ids")
    async def test_storage_rule(self, mock_prot, mock_storage):
        rule = SimpleNamespace(rule_type="max_storage_gb", protect_collections=False)
        rules_result = MagicMock()
        scalars = MagicMock()
        scalars.all.return_value = [rule]
        rules_result.scalars.return_value = scalars

        mock_prot.return_value = set()
        mock_storage.return_value = {"f1"}

        frame1 = SimpleNamespace(id="f1")
        frames_result = MagicMock()
        frames_scalars = MagicMock()
        frames_scalars.all.return_value = [frame1]
        frames_result.scalars.return_value = frames_scalars

        db = AsyncMock()
        db.execute.side_effect = [rules_result, frames_result]

        result = await _get_frames_to_cleanup(db)
        assert len(result) == 1

    @pytest.mark.asyncio
    @patch("app.routers.scheduling._get_protected_ids")
    async def test_no_deletions_returns_empty(self, mock_prot):
        rule = SimpleNamespace(rule_type="max_age_days", protect_collections=False)
        rules_result = MagicMock()
        scalars = MagicMock()
        scalars.all.return_value = [rule]
        rules_result.scalars.return_value = scalars

        mock_prot.return_value = set()

        db = AsyncMock()

        # First call returns rules, second returns age query with empty
        age_result = MagicMock()
        age_scalars = MagicMock()
        age_scalars.all.return_value = []
        age_result.scalars.return_value = age_scalars
        db.execute.side_effect = [rules_result, age_result]

        with patch("app.routers.scheduling._collect_age_deletions", return_value=set()):
            result = await _get_frames_to_cleanup(db)
        assert result == []


# ── _schedule_response ──────────────────────────────────

class TestScheduleResponse:
    @pytest.mark.asyncio
    async def test_returns_validated_response(self):
        schedule = SimpleNamespace(id="s1")

        mock_schedule = MagicMock()
        mock_schedule.id = "s1"

        result_obj = MagicMock()
        scalars = MagicMock()
        scalars.first.return_value = mock_schedule
        result_obj.scalars.return_value = scalars

        db = AsyncMock()
        db.execute.return_value = result_obj

        with patch("app.routers.scheduling.FetchScheduleResponse") as MockResp:
            MockResp.model_validate.return_value = "validated"
            result = await _schedule_response(db, schedule)
            assert result == "validated"
            MockResp.model_validate.assert_called_once_with(mock_schedule)
