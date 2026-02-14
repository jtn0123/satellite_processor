"""Tests for gap detector service."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from app.db.models import GoesFrame
from app.services.gap_detector import detect_capture_pattern, find_gaps, get_coverage_stats


def _frame(id_: str, satellite: str, band: str, sector: str, capture_time: datetime) -> GoesFrame:
    return GoesFrame(
        id=id_,
        satellite=satellite,
        sector=sector,
        band=band,
        capture_time=capture_time,
        file_path=f"/data/{id_}.nc",
        file_size=1000,
    )


@pytest_asyncio.fixture
async def db_with_images(db):
    """Populate DB with GoesFrame records at known timestamps."""
    base = datetime(2024, 3, 15, 12, 0, 0)
    # 10 frames at 10-min intervals, then a 50-min gap, then 5 more
    timestamps = [base + timedelta(minutes=10 * i) for i in range(10)]
    timestamps += [base + timedelta(minutes=140 + 10 * i) for i in range(5)]

    for i, ts in enumerate(timestamps):
        db.add(_frame(f"frm-{i:03d}", "GOES-16", "C02", "CONUS", ts))
    await db.commit()
    return db


@pytest_asyncio.fixture
async def empty_db(db):
    """Return empty DB."""
    return db


class TestDetectCapturePattern:
    @pytest.mark.asyncio
    async def test_detects_pattern(self, db_with_images):
        pattern = await detect_capture_pattern(db_with_images)
        assert pattern["satellite"] == "GOES-16"
        assert pattern["band"] == "C02"
        assert pattern["total_images"] == 15
        assert pattern["expected_interval_minutes"] is not None
        assert 9 <= pattern["expected_interval_minutes"] <= 11

    @pytest.mark.asyncio
    async def test_empty_db(self, empty_db):
        pattern = await detect_capture_pattern(empty_db)
        assert pattern["total_images"] == 0
        assert pattern["satellite"] is None


class TestFindGaps:
    @pytest.mark.asyncio
    async def test_finds_gap(self, db_with_images):
        gaps = await find_gaps(db_with_images, expected_interval=10.0, tolerance=1.5)
        assert len(gaps) == 1
        assert gaps[0]["duration_minutes"] == pytest.approx(50.0)
        assert gaps[0]["expected_frames"] == 4

    @pytest.mark.asyncio
    async def test_no_gaps_with_high_tolerance(self, db_with_images):
        gaps = await find_gaps(db_with_images, expected_interval=10.0, tolerance=10.0)
        assert len(gaps) == 0

    @pytest.mark.asyncio
    async def test_filter_by_satellite(self, db_with_images):
        gaps = await find_gaps(db_with_images, satellite="GOES-18", expected_interval=10.0)
        assert len(gaps) == 0

    @pytest.mark.asyncio
    async def test_empty_db(self, empty_db):
        gaps = await find_gaps(empty_db, expected_interval=10.0)
        assert len(gaps) == 0


class TestGetCoverageStats:
    @pytest.mark.asyncio
    async def test_coverage_stats(self, db_with_images):
        stats = await get_coverage_stats(db_with_images, expected_interval=10.0)
        assert stats["total_frames"] == 15
        assert stats["gap_count"] == 1
        assert 0 < stats["coverage_percent"] <= 100
        assert stats["time_range"] is not None

    @pytest.mark.asyncio
    async def test_empty_db_stats(self, empty_db):
        stats = await get_coverage_stats(empty_db)
        assert stats["total_frames"] == 0
        assert stats["coverage_percent"] == pytest.approx(0.0)
        assert stats["gaps"] == []
