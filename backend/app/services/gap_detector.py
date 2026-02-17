"""Gap detection service for satellite image coverage analysis."""
from __future__ import annotations

import logging
from collections import Counter
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import GoesFrame

logger = logging.getLogger(__name__)


async def detect_capture_pattern(db: AsyncSession) -> dict[str, Any]:
    """Analyze existing images to determine the dominant capture pattern.

    Returns dict with 'satellite', 'band', 'sector', 'expected_interval_minutes',
    'total_images', and 'time_range'.
    """
    result = await db.execute(
        select(GoesFrame.satellite, GoesFrame.band, GoesFrame.sector, GoesFrame.capture_time)
        .where(GoesFrame.capture_time.isnot(None))
        .order_by(GoesFrame.capture_time.asc())
    )
    rows = result.all()

    if not rows:
        return {
            "satellite": None,
            "band": None,
            "sector": None,
            "expected_interval_minutes": None,
            "total_images": 0,
            "time_range": None,
        }

    # Find dominant satellite and band
    satellites = Counter(r[0] for r in rows if r[0])
    bands = Counter(r[1] for r in rows if r[1])

    dominant_satellite = satellites.most_common(1)[0][0] if satellites else None
    dominant_band = bands.most_common(1)[0][0] if bands else None

    sectors = Counter(r[2] for r in rows if r[2])
    dominant_sector = sectors.most_common(1)[0][0] if sectors else None

    # Calculate intervals between consecutive captures
    timestamps = sorted(r[3] for r in rows if r[3] is not None)
    intervals: list[float] = []
    for i in range(1, len(timestamps)):
        delta = (timestamps[i] - timestamps[i - 1]).total_seconds() / 60.0
        if 0 < delta < 120:  # Ignore gaps > 2 hours for pattern detection
            intervals.append(delta)

    expected_interval = None
    if intervals:
        # Use median interval as expected
        intervals.sort()
        expected_interval = intervals[len(intervals) // 2]

    return {
        "satellite": dominant_satellite,
        "band": dominant_band,
        "sector": dominant_sector,
        "expected_interval_minutes": expected_interval,
        "total_images": len(rows),
        "time_range": {
            "start": timestamps[0].isoformat() if timestamps else None,
            "end": timestamps[-1].isoformat() if timestamps else None,
        },
    }


async def find_gaps(
    db: AsyncSession,
    satellite: str | None = None,
    band: str | None = None,
    sector: str | None = None,
    expected_interval: float = 10.0,
    tolerance: float = 1.5,
) -> list[dict[str, Any]]:
    """Find gaps in satellite image coverage.

    Args:
        db: Database session
        satellite: Filter by satellite name
        band: Filter by band/channel
        sector: Filter by sector
        expected_interval: Expected interval between captures in minutes
        tolerance: Multiplier for expected interval to detect a gap

    Returns list of dicts with 'start', 'end', 'duration_minutes', 'expected_frames'.
    """
    query = (
        select(GoesFrame.capture_time)
        .where(GoesFrame.capture_time.isnot(None))
        .order_by(GoesFrame.capture_time.asc())
    )
    if satellite:
        query = query.where(GoesFrame.satellite == satellite)
    if band:
        query = query.where(GoesFrame.band == band)
    if sector:
        query = query.where(GoesFrame.sector == sector)

    result = await db.execute(query)
    timestamps = [r[0] for r in result.all()]

    if len(timestamps) < 2:
        return []

    threshold = expected_interval * tolerance
    gaps: list[dict[str, Any]] = []

    for i in range(1, len(timestamps)):
        delta_minutes = (timestamps[i] - timestamps[i - 1]).total_seconds() / 60.0
        if delta_minutes > threshold:
            expected_frames = int(delta_minutes / expected_interval) - 1
            gaps.append({
                "start": timestamps[i - 1].isoformat(),
                "end": timestamps[i].isoformat(),
                "duration_minutes": round(delta_minutes, 1),
                "expected_frames": max(expected_frames, 1),
            })

    return gaps


async def get_coverage_stats(
    db: AsyncSession,
    satellite: str | None = None,
    band: str | None = None,
    expected_interval: float = 10.0,
    tolerance: float = 1.5,
) -> dict[str, Any]:
    """Get coverage statistics for satellite images.

    Returns dict with 'coverage_percent', 'gap_count', 'total_frames',
    'expected_frames', 'time_range', 'gaps'.
    """
    gaps = await find_gaps(db, satellite, band, expected_interval=expected_interval, tolerance=tolerance)

    # Get time range
    query = select(
        func.min(GoesFrame.capture_time),
        func.max(GoesFrame.capture_time),
        func.count(GoesFrame.id),
    ).where(GoesFrame.capture_time.isnot(None))
    if satellite:
        query = query.where(GoesFrame.satellite == satellite)
    if band:
        query = query.where(GoesFrame.band == band)

    result = await db.execute(query)
    row = result.one()
    min_time, max_time, total_frames = row

    if not min_time or not max_time or total_frames == 0:
        return {
            "coverage_percent": 0.0,
            "gap_count": 0,
            "total_frames": 0,
            "expected_frames": 0,
            "time_range": None,
            "gaps": [],
        }

    total_minutes = (max_time - min_time).total_seconds() / 60.0

    # Subtract gap durations from the covered time to get actual coverage
    gap_minutes = sum(g["duration_minutes"] for g in gaps)
    covered_minutes = total_minutes - gap_minutes
    expected_frames = int(total_minutes / expected_interval) + 1 if expected_interval > 0 else total_frames
    coverage = (covered_minutes / total_minutes * 100.0) if total_minutes > 0 else 100.0
    coverage = max(0.0, min(100.0, coverage))

    return {
        "coverage_percent": round(coverage, 1),
        "gap_count": len(gaps),
        "total_frames": total_frames,
        "expected_frames": expected_frames,
        "time_range": {
            "start": min_time.isoformat(),
            "end": max_time.isoformat(),
        },
        "gaps": gaps,
    }
