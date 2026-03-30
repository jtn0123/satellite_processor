"""Tests for fetch_task helper functions."""

from __future__ import annotations

from datetime import datetime

from app.tasks.fetch_task import _build_status_message, _no_frames_message


class TestNoFramesMessage:
    def test_all_failed_to_download(self):
        msg, status = _no_frames_message("GOES-16", "CONUS", "C02", datetime(2025, 1, 1), datetime(2025, 1, 2), 5)
        assert "All 5 frames failed to download" in msg
        assert status == "failed"

    def test_no_frames_on_s3(self):
        msg, status = _no_frames_message("GOES-16", "CONUS", "C02", datetime(2025, 1, 1), datetime(2025, 1, 2), 0)
        assert "No frames found on S3" in msg
        assert "GOES-16" in msg
        assert "CONUS" in msg
        assert "C02" in msg
        assert status == "failed"


class TestBuildStatusMessage:
    def test_all_fetched_no_cap(self):
        msg, status = _build_status_message(
            "GOES-16",
            "CONUS",
            "C02",
            datetime(2025, 1, 1),
            datetime(2025, 1, 2),
            fetched_count=10,
            total_available=10,
            was_capped=False,
            failed_downloads=0,
            max_frames_limit=100,
        )
        assert msg == "Fetched 10 frames"
        assert status == "completed"

    def test_capped_no_failures(self):
        msg, status = _build_status_message(
            "GOES-16",
            "CONUS",
            "C02",
            datetime(2025, 1, 1),
            datetime(2025, 1, 2),
            fetched_count=50,
            total_available=200,
            was_capped=True,
            failed_downloads=0,
            max_frames_limit=50,
        )
        assert "50 of 200" in msg
        assert "frame limit" in msg
        assert status == "completed_partial"

    def test_some_failed(self):
        msg, status = _build_status_message(
            "GOES-16",
            "CONUS",
            "C02",
            datetime(2025, 1, 1),
            datetime(2025, 1, 2),
            fetched_count=8,
            total_available=10,
            was_capped=False,
            failed_downloads=2,
            max_frames_limit=100,
        )
        assert "Fetched 8 frames" in msg
        assert "2 failed" in msg
        assert status == "completed_partial"

    def test_zero_fetched(self):
        msg, status = _build_status_message(
            "GOES-16",
            "CONUS",
            "C02",
            datetime(2025, 1, 1),
            datetime(2025, 1, 2),
            fetched_count=0,
            total_available=5,
            was_capped=False,
            failed_downloads=5,
            max_frames_limit=100,
        )
        assert "failed" in msg
        assert status == "failed"

    def test_capped_with_failures(self):
        msg, status = _build_status_message(
            "GOES-16",
            "CONUS",
            "C02",
            datetime(2025, 1, 1),
            datetime(2025, 1, 2),
            fetched_count=40,
            total_available=200,
            was_capped=True,
            failed_downloads=10,
            max_frames_limit=50,
        )
        assert "Fetched 40 frames" in msg
        assert "10 failed" in msg
        assert "beyond frame limit" in msg
        assert status == "completed_partial"
