"""Tests for animation frame query limits."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.routers.animations import MAX_ANIMATION_FRAMES, _query_frame_ids


class TestMaxAnimationFrames:
    def test_constant_is_reasonable(self):
        assert MAX_ANIMATION_FRAMES == 10_000


class TestQueryFrameIds:
    @pytest.mark.asyncio
    async def test_returns_frame_ids(self):
        db = AsyncMock()
        result_obj = MagicMock()
        result_obj.all.return_value = [("f1",), ("f2",), ("f3",)]
        db.execute.return_value = result_obj

        result = await _query_frame_ids(
            db, "GOES-16", "CONUS", "C02", datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 1, 2, tzinfo=UTC)
        )
        assert result == ["f1", "f2", "f3"]

    @pytest.mark.asyncio
    async def test_empty_result(self):
        db = AsyncMock()
        result_obj = MagicMock()
        result_obj.all.return_value = []
        db.execute.return_value = result_obj

        result = await _query_frame_ids(
            db, "GOES-16", "CONUS", "C02", datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 1, 2, tzinfo=UTC)
        )
        assert result == []

    @pytest.mark.asyncio
    async def test_query_includes_limit(self):
        """Verify the SQL query includes a LIMIT clause."""
        db = AsyncMock()
        result_obj = MagicMock()
        result_obj.all.return_value = []
        db.execute.return_value = result_obj

        await _query_frame_ids(
            db, "GOES-16", "CONUS", "C02", datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 1, 2, tzinfo=UTC)
        )

        # Inspect the query passed to execute
        call_args = db.execute.call_args
        query = call_args[0][0]
        compiled = str(query.compile(compile_kwargs={"literal_binds": True}))
        assert "LIMIT" in compiled.upper()
