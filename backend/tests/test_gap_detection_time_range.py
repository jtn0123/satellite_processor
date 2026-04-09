"""Tests for gap-detection time-range filtering and related JTN-460 fixes.

Covers:
- `/api/satellite/gaps` honouring start_time/end_time query params
- `/api/satellite/backfill` requiring explicit time range and metadata
- `/api/jobs/{id}/logs` returning 404 for nonexistent jobs
- `run_fetch_preset` using tz-aware `datetime.now(UTC)` consistently
"""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from app.db.models import FetchPreset, GoesFrame, Job

pytestmark = pytest.mark.asyncio


def _frame(id_: str, sat: str, band: str, sector: str, ts: datetime) -> GoesFrame:
    return GoesFrame(
        id=id_,
        satellite=sat,
        sector=sector,
        band=band,
        capture_time=ts,
        file_path=f"/data/{id_}.nc",
        file_size=1000,
    )


# ── JTN-460: /api/satellite/gaps start/end params ────────────────────


async def _seed_frames(db):
    """Seed frames with a 50-min gap in the middle."""
    base = datetime(2024, 3, 15, 12, 0, 0)
    # 10 frames at 10-min intervals
    for i in range(10):
        db.add(_frame(f"frm-a{i}", "GOES-16", "C02", "CONUS", base + timedelta(minutes=10 * i)))
    # 50-minute gap
    # 5 more frames
    for i in range(5):
        db.add(_frame(f"frm-b{i}", "GOES-16", "C02", "CONUS", base + timedelta(minutes=140 + 10 * i)))
    await db.commit()
    return base


class TestGapsTimeRangeFiltering:
    async def test_gaps_respects_start_end_params(self, client, db):
        base = await _seed_frames(db)
        # Full range — one gap is visible
        full = await client.get(
            "/api/satellite/gaps",
            params={
                "start_time": base.isoformat(),
                "end_time": (base + timedelta(hours=4)).isoformat(),
                "expected_interval": 10,
            },
        )
        assert full.status_code == 200
        assert full.json()["gap_count"] == 1

        # Narrow to the first 30 minutes — no gap should appear
        narrow = await client.get(
            "/api/satellite/gaps",
            params={
                "start_time": base.isoformat(),
                "end_time": (base + timedelta(minutes=30)).isoformat(),
                "expected_interval": 10,
            },
        )
        assert narrow.status_code == 200
        assert narrow.json()["gap_count"] == 0

    async def test_gaps_reversed_range_rejected(self, client, db):
        base = await _seed_frames(db)
        resp = await client.get(
            "/api/satellite/gaps",
            params={
                "start_time": (base + timedelta(hours=2)).isoformat(),
                "end_time": base.isoformat(),
                "expected_interval": 10,
            },
        )
        assert resp.status_code == 400

    async def test_gaps_one_minute_window_differs_from_default(self, client, db):
        base = await _seed_frames(db)
        # A 1-minute window returns zero frames and zero gaps
        tiny = await client.get(
            "/api/satellite/gaps",
            params={
                "start_time": (base + timedelta(minutes=5)).isoformat(),
                "end_time": (base + timedelta(minutes=6)).isoformat(),
                "expected_interval": 10,
            },
        )
        assert tiny.status_code == 200
        assert tiny.json()["total_frames"] == 0

        # A large range includes the seeded gap
        large = await client.get(
            "/api/satellite/gaps",
            params={
                "start_time": base.isoformat(),
                "end_time": (base + timedelta(days=1)).isoformat(),
                "expected_interval": 10,
            },
        )
        assert large.status_code == 200
        assert large.json()["total_frames"] == 15


# ── JTN-460: /api/satellite/backfill body required ──────────────────


class TestBackfillRequiresRange:
    async def test_empty_body_rejected(self, client):
        resp = await client.post("/api/satellite/backfill", json={})
        assert resp.status_code == 422

    async def test_missing_time_range_rejected(self, client):
        resp = await client.post(
            "/api/satellite/backfill",
            json={
                "satellite": "GOES-16",
                "sector": "CONUS",
                "band": "C02",
            },
        )
        assert resp.status_code == 422

    async def test_reversed_time_range_rejected(self, client):
        resp = await client.post(
            "/api/satellite/backfill",
            json={
                "satellite": "GOES-16",
                "sector": "CONUS",
                "band": "C02",
                "start_time": "2024-03-15T06:00:00",
                "end_time": "2024-03-15T00:00:00",
            },
        )
        assert resp.status_code == 422

    async def test_valid_body_accepted(self, client):
        with patch("app.tasks.fetch_task.backfill_gaps") as mock:
            mock.delay.return_value.id = "task-1"
            resp = await client.post(
                "/api/satellite/backfill",
                json={
                    "satellite": "GOES-16",
                    "sector": "CONUS",
                    "band": "C02",
                    "start_time": "2024-03-15T00:00:00",
                    "end_time": "2024-03-15T06:00:00",
                },
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"


# ── JTN-460: /api/jobs/{id}/logs 404 consistency ────────────────────


class TestJobLogs404:
    async def test_nonexistent_job_logs_returns_404(self, client):
        # Use a valid but unknown UUID so the 404 comes from the existence
        # check rather than the UUID validator.
        fake_id = "11111111-2222-3333-4444-555555555555"
        resp = await client.get(f"/api/jobs/{fake_id}/logs")
        assert resp.status_code == 404

    async def test_nonexistent_job_output_returns_404(self, client):
        fake_id = "11111111-2222-3333-4444-555555555555"
        resp = await client.get(f"/api/jobs/{fake_id}/output")
        assert resp.status_code == 404

    async def test_existing_job_logs_returns_200_empty(self, client, db):
        # An existing job with no logs returns 200 and an empty list — this
        # keeps the existing happy-path contract for callers who just want
        # to poll for logs during a running job.
        job = Job(
            id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            status="processing",
            job_type="test",
            params={},
        )
        db.add(job)
        await db.commit()
        resp = await client.get(f"/api/jobs/{job.id}/logs")
        assert resp.status_code == 200
        assert resp.json() == []


# ── JTN-460: run_fetch_preset uses tz-aware now ─────────────────────


class TestRunPresetTzAware:
    async def test_run_preset_emits_tz_aware_isoformat(self, client, db):
        preset = FetchPreset(
            id="11111111-1111-1111-1111-111111111111",
            name="TZ Test Preset",
            satellite="GOES-16",
            sector="CONUS",
            band="C02",
            description="",
        )
        db.add(preset)
        await db.commit()

        captured: dict = {}

        class Task:
            def delay(self, job_id, params):
                captured["job_id"] = job_id
                captured["params"] = params

        import app.tasks.fetch_task as fetch_mod

        orig = fetch_mod.fetch_goes_data
        fetch_mod.fetch_goes_data = Task()
        try:
            resp = await client.post(f"/api/satellite/fetch-presets/{preset.id}/run")
        finally:
            fetch_mod.fetch_goes_data = orig

        assert resp.status_code == 200
        params = captured["params"]
        # The ISO strings must include a UTC offset so downstream comparisons
        # against tz-aware DB timestamps don't raise TypeError. Both the
        # "+00:00" and "Z" suffixes are acceptable aware markers.
        assert params["start_time"].endswith("+00:00") or params["start_time"].endswith("Z")
        assert params["end_time"].endswith("+00:00") or params["end_time"].endswith("Z")
        # And the parsed values must be tz-aware
        assert datetime.fromisoformat(params["start_time"]).tzinfo is not None
        assert datetime.fromisoformat(params["end_time"]).tzinfo is not None
