"""Integration tests hitting real NOAA GOES S3 buckets.

Marked with @pytest.mark.integration — skipped in normal CI.
Run with: pytest backend/tests/test_goes_integration.py -v -m integration
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import boto3
import pytest
from app.services.goes_fetcher import (
    SATELLITE_BUCKETS,
    fetch_frames,
    list_available,
)
from botocore import UNSIGNED
from botocore.config import Config

# ---------------------------------------------------------------------------
# Date helpers — GOES-16 is historical, GOES-18/19 use recent data
# ---------------------------------------------------------------------------

# GOES-16 decommissioned April 2025 — use a known-good historical date
GOES16_START = datetime(2025, 3, 1, 18, 0, tzinfo=UTC)
GOES16_END = datetime(2025, 3, 1, 19, 0, tzinfo=UTC)


def _recent_window() -> tuple[datetime, datetime]:
    """Return a 2-hour window ending ~6 hours ago (safe lag for data availability)."""
    end = datetime.now(UTC) - timedelta(hours=6)
    start = end - timedelta(hours=2)
    return start, end


SECTORS = ["FullDisk", "CONUS", "Mesoscale1", "Mesoscale2"]
BANDS = ["C02", "C07", "C13"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _time_range_for_satellite(sat: str) -> tuple[datetime, datetime]:
    if sat == "GOES-16":
        return GOES16_START, GOES16_END
    return _recent_window()


# ---------------------------------------------------------------------------
# 1. S3 bucket accessibility
# ---------------------------------------------------------------------------

class TestS3Accessibility:
    """Verify each NOAA bucket is reachable."""

    @pytest.mark.integration
    @pytest.mark.parametrize("sat,bucket", list(SATELLITE_BUCKETS.items()))
    def test_bucket_reachable(self, sat, bucket):
        s3 = boto3.client("s3", config=Config(signature_version=UNSIGNED))
        resp = s3.list_objects_v2(Bucket=bucket, MaxKeys=1)
        assert resp["ResponseMetadata"]["HTTPStatusCode"] == 200
        assert resp.get("KeyCount", 0) >= 1, f"Bucket {bucket} appears empty"


# ---------------------------------------------------------------------------
# 2. list_available — all satellite × sector × band combos
# ---------------------------------------------------------------------------

class TestListAvailable:
    """Verify list_available returns real data for every combo."""

    @pytest.mark.integration
    @pytest.mark.parametrize("satellite", ["GOES-16", "GOES-18", "GOES-19"])
    @pytest.mark.parametrize("sector", SECTORS)
    @pytest.mark.parametrize("band", BANDS)
    def test_list_returns_frames(self, satellite, sector, band):
        start, end = _time_range_for_satellite(satellite)
        results = list_available(satellite, sector, band, start, end)
        assert len(results) > 0, (
            f"No frames for {satellite}/{sector}/{band} "
            f"between {start.isoformat()} and {end.isoformat()}"
        )
        # Verify structure
        first = results[0]
        assert "key" in first
        assert "scan_time" in first
        assert "size" in first
        assert first["size"] > 0


# ---------------------------------------------------------------------------
# 3. Actual frame download (one per satellite, minimal)
# ---------------------------------------------------------------------------

class TestFetchFrames:
    """Download one real frame per satellite, verify file, clean up."""

    @pytest.mark.integration
    @pytest.mark.parametrize("satellite", ["GOES-16", "GOES-18", "GOES-19"])
    def test_fetch_one_frame(self, satellite, tmp_path):
        start, end = _time_range_for_satellite(satellite)
        # Use FullDisk + C13 (clean IR, always available day/night)
        # Narrow window to get fewer frames
        narrow_end = start + timedelta(minutes=15)
        results = fetch_frames(
            satellite=satellite,
            sector="FullDisk",
            band="C13",
            start_time=start,
            end_time=narrow_end,
            output_dir=str(tmp_path),
        )
        assert len(results) >= 1, f"No frames downloaded for {satellite}"
        from pathlib import Path

        downloaded = Path(results[0]["path"])
        assert downloaded.exists()
        assert downloaded.stat().st_size > 0
        assert results[0]["satellite"] == satellite
        assert results[0]["band"] == "C13"
        # tmp_path auto-cleans up
