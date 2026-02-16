"""Tests for goes_data.py helper functions and constants."""
from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

from app.routers.goes_data import (
    MAX_EXPORT_LIMIT,
    _COLLECTION_NOT_FOUND,
    _FRAME_NOT_FOUND,
    _frames_to_csv,
    _frames_to_json_list,
)


# ── Constants ───────────────────────────────────────────

def test_collection_not_found():
    assert _COLLECTION_NOT_FOUND == "Collection not found"


def test_frame_not_found():
    assert _FRAME_NOT_FOUND == "Frame not found"


def test_max_export_limit():
    assert MAX_EXPORT_LIMIT == 5000


# ── _frames_to_csv ──────────────────────────────────────

class TestFramesToCsv:
    def test_basic(self):
        frame = SimpleNamespace(
            id="f1", satellite="G16", sector="CONUS", band="C02",
            capture_time=datetime(2024, 1, 15, 12, 0, 0), file_size=1024
        )
        csv = _frames_to_csv([frame])
        lines = csv.strip().split("\n")
        assert len(lines) == 2
        assert "id,satellite,sector,band,capture_time,file_size" in lines[0]
        assert "f1" in lines[1]
        assert "G16" in lines[1]

    def test_empty(self):
        csv = _frames_to_csv([])
        lines = csv.strip().split("\n")
        assert len(lines) == 1  # header only

    def test_none_capture_time(self):
        frame = SimpleNamespace(
            id="f1", satellite="G16", sector="FD", band="C13",
            capture_time=None, file_size=None
        )
        csv = _frames_to_csv([frame])
        assert "f1" in csv

    def test_multiple_frames(self):
        frames = [
            SimpleNamespace(id=f"f{i}", satellite="G16", sector="CONUS", band="C02",
                            capture_time=datetime(2024, 1, 15, i, 0, 0), file_size=i * 100)
            for i in range(5)
        ]
        csv = _frames_to_csv(frames)
        lines = csv.strip().split("\n")
        assert len(lines) == 6  # header + 5 frames


# ── _frames_to_json_list ────────────────────────────────

class TestFramesToJsonList:
    def test_basic(self):
        frame = SimpleNamespace(
            id="f1", satellite="G16", sector="CONUS", band="C02",
            capture_time=datetime(2024, 1, 15, 12, 0, 0), file_size=1024
        )
        result = _frames_to_json_list([frame])
        assert len(result) == 1
        assert result[0]["id"] == "f1"
        assert result[0]["satellite"] == "G16"
        assert result[0]["capture_time"] == "2024-01-15T12:00:00"

    def test_empty(self):
        assert _frames_to_json_list([]) == []

    def test_none_capture_time(self):
        frame = SimpleNamespace(
            id="f1", satellite="G16", sector="FD", band="C13",
            capture_time=None, file_size=None
        )
        result = _frames_to_json_list([frame])
        assert result[0]["capture_time"] is None
        assert result[0]["file_size"] is None
