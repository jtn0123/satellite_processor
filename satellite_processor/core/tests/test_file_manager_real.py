"""Real tests for file_manager.py — uses tmp_path, minimal mocking."""

import os
from datetime import datetime
from pathlib import Path

import pytest

from satellite_processor.core.file_manager import FileManager


@pytest.fixture
def fm():
    return FileManager()


class TestFileManagerGetInputFiles:
    def test_finds_png_files(self, fm, tmp_path):
        for i in range(3):
            (tmp_path / f"frame{i:04d}.png").write_bytes(b"\x89PNG" + b"\0" * 10)
        result = fm.get_input_files(tmp_path)
        assert len(result) == 3

    def test_sorts_by_frame_number(self, fm, tmp_path):
        for i in [3, 1, 2]:
            (tmp_path / f"frame{i:04d}.png").write_bytes(b"\x89PNG" + b"\0" * 10)
        result = fm.get_input_files(tmp_path)
        assert "frame0001" in result[0].name
        assert "frame0003" in result[-1].name

    def test_empty_dir(self, fm, tmp_path):
        result = fm.get_input_files(tmp_path)
        assert result == []

    def test_mixed_extensions(self, fm, tmp_path):
        (tmp_path / "frame0001.png").write_bytes(b"\x89PNG")
        (tmp_path / "frame0002.jpg").write_bytes(b"\xff\xd8")
        (tmp_path / "notes.txt").write_text("ignore")
        result = fm.get_input_files(tmp_path)
        assert len(result) == 2

    def test_nonexistent_dir(self, fm):
        result = fm.get_input_files("/nonexistent/path")
        assert result == []


class TestFileManagerTempDir:
    def test_create_temp_directory(self, fm, tmp_path):
        td = fm.create_temp_directory(tmp_path, "test")
        assert td.exists()
        assert "test_" in td.name

    def test_cleanup_temp_directory(self, fm, tmp_path):
        td = fm.create_temp_directory(tmp_path, "cleanup")
        (td / "file.txt").write_text("data")
        fm.cleanup_temp_directory(td)
        assert not td.exists()

    def test_cleanup_nonexistent(self, fm, tmp_path):
        fm.cleanup_temp_directory(tmp_path / "nope")  # Should not raise

    def test_create_temp_dir_tracked(self, fm, tmp_path):
        td = fm.create_temp_dir(base_dir=tmp_path, prefix="tracked")
        assert td.exists()
        assert td in fm._temp_dirs
        fm.cleanup()
        # After cleanup, tracked dirs should be cleared
        assert len(fm._temp_dirs) == 0

    def test_create_temp_dir_no_base(self, fm):
        td = fm.create_temp_dir()
        assert td.exists()
        fm.cleanup()


class TestFileManagerOutputPath:
    def test_get_output_path(self, fm, tmp_path):
        result = fm.get_output_path(tmp_path)
        assert result.suffix == ".mp4"
        assert "Animation_" in result.name

    def test_get_output_path_none_raises(self, fm):
        with pytest.raises(ValueError):
            fm.get_output_path(None)


class TestFileManagerEnsureDir:
    def test_ensure_directory_creates(self, fm, tmp_path):
        new_dir = tmp_path / "sub" / "dir"
        result = fm.ensure_directory(new_dir)
        assert result.exists()

    def test_ensure_directory_empty_raises(self, fm):
        with pytest.raises(ValueError):
            fm.ensure_directory("")


class TestFileManagerMisc:
    def test_get_processed_filename(self, fm):
        p = Path("/some/image.png")
        result = fm.get_processed_filename(p, "20230101")
        assert result == "processed_image_20230101.png"

    def test_create_frame_filename(self, fm):
        result = fm.create_frame_filename(42, "20230101_120000")
        assert result == "frame_00000042_20230101_120000.png"

    def test_create_frame_filename_auto_timestamp(self, fm):
        result = fm.create_frame_filename(0)
        assert result.startswith("frame_00000000_")
        assert result.endswith(".png")

    def test_get_sequential_path(self, fm, tmp_path):
        result = fm.get_sequential_path(tmp_path, "output", ".mp4")
        assert result.suffix == ".mp4"
        assert "output_" in result.name

    def test_track_temp_file(self, fm, tmp_path):
        f = tmp_path / "tracked.txt"
        f.write_text("data")
        fm.track_temp_file(f)
        assert f in fm._temp_files
        fm.cleanup()
        assert len(fm._temp_files) == 0

    def test_keep_file_order(self, fm, tmp_path):
        # Files without satellite timestamps sort by datetime.min
        files = []
        for i in range(3):
            f = tmp_path / f"file{i}.png"
            f.write_bytes(b"\x89PNG")
            files.append(f)
        result = fm.keep_file_order(files)
        assert len(result) == 3

    def test_keep_file_order_missing_file(self, fm, tmp_path):
        f1 = tmp_path / "exists.png"
        f1.write_bytes(b"\x89PNG")
        f2 = tmp_path / "missing.png"
        result = fm.keep_file_order([f1, f2])
        assert len(result) == 1

    def test_parse_satellite_timestamp(self, fm):
        result = fm.parse_satellite_timestamp("20230615T143022Z.png")
        assert result == datetime(2023, 6, 15, 14, 30, 22)
