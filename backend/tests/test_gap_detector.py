"""Tests for gap detector service."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from app.db.models import Image
from app.services.gap_detector import detect_capture_pattern, find_gaps, get_coverage_stats


@pytest_asyncio.fixture
async def db_with_images(db):
    """Populate DB with images at known timestamps."""
    base = datetime(2024, 3, 15, 12, 0, 0)
    # Create 10 images at 10-minute intervals, then a 50-minute gap, then 5 more
    timestamps = [base + timedelta(minutes=10 * i) for i in range(10)]
    # Gap from 13:30 to 14:20
    timestamps += [base + timedelta(minutes=140 + 10 * i) for i in range(5)]

    for i, ts in enumerate(timestamps):
        img = Image(
            id=f"img-{i:03d}",
            filename=f"test_{i}.png",
            original_name=f"test_{i}.png",
            file_path=f"/data/test_{i}.png",
            file_size=1000,
            satellite="GOES-16",
            channel="C02",
            captured_at=ts,
        )
        db.add(img)
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
        assert gaps[0]["duration_minutes"] == 50.0
        assert gaps[0]["expected_frames"] == 4

    @pytest.mark.asyncio
    async def test_no_gaps_with_high_tolerance(self, db_with_images):
        gaps = await find_gaps(db_with_images, expected_interval=10.0, tolerance=10.0)
        assert len(gaps) == 0

    @pytest.mark.asyncio
    async def test_filter_by_satellite(self, db_with_images):
        gaps = await find_gaps(db_with_images, satellite="GOES-18", expected_interval=10.0)
        assert len(gaps) == 0  # No GOES-18 images

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
        assert stats["coverage_percent"] == 0.0
        assert stats["gaps"] == []
