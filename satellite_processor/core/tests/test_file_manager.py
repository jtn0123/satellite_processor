"""Tests for file_manager.py - FileManager class."""

import pytest
import numpy as np
import cv2
from pathlib import Path
from datetime import datetime

from satellite_processor.core.file_manager import FileManager


class TestGetInputFiles:
    """Tests for FileManager.get_input_files()"""

    def test_get_input_files_with_frames(self, tmp_path):
        """Test finding frame files in a directory."""
        fm = FileManager()
        input_dir = tmp_path / "input"
        input_dir.mkdir()

        for i in range(5):
            (input_dir / f"frame{i:04d}.png").touch()

        files = fm.get_input_files(str(input_dir))

        assert len(files) == 5
        # Verify sorted order
        for i, f in enumerate(files):
            assert f"frame{i:04d}" in f.stem

    def test_get_input_files_empty_directory(self, tmp_path):
        """Test returns empty list for empty directory."""
        fm = FileManager()
        input_dir = tmp_path / "empty"
        input_dir.mkdir()

        files = fm.get_input_files(str(input_dir))

        assert files == []

    def test_get_input_files_mixed_extensions(self, tmp_path):
        """Test finding files with different image extensions."""
        fm = FileManager()
        input_dir = tmp_path / "input"
        input_dir.mkdir()

        (input_dir / "frame0001.png").touch()
        (input_dir / "frame0002.jpg").touch()
        (input_dir / "frame0003.jpeg").touch()
        (input_dir / "not_an_image.txt").touch()

        files = fm.get_input_files(str(input_dir))

        assert len(files) == 3
        # txt file should not be included
        assert not any(f.suffix == ".txt" for f in files)

    def test_get_input_files_nonexistent_directory(self):
        """Test returns empty list for nonexistent directory."""
        fm = FileManager()
        files = fm.get_input_files("/nonexistent/path")

        assert files == []

    def test_get_input_files_numerical_sort(self, tmp_path):
        """Test that files are sorted numerically, not alphabetically."""
        fm = FileManager()
        input_dir = tmp_path / "input"
        input_dir.mkdir()

        # Create files in non-sorted order
        for i in [10, 2, 1, 20, 3]:
            (input_dir / f"frame{i:04d}.png").touch()

        files = fm.get_input_files(str(input_dir))

        assert len(files) == 5
        numbers = [int(f.stem.replace("frame", "")) for f in files]
        assert numbers == sorted(numbers)


class TestCreateTempDirectory:
    """Tests for FileManager temp directory operations."""

    def test_create_temp_directory(self, tmp_path):
        """Test creating a temporary directory."""
        fm = FileManager()
        temp_dir = fm.create_temp_directory(tmp_path, prefix="test")

        assert temp_dir.exists()
        assert temp_dir.is_dir()
        assert "test_" in temp_dir.name

    def test_cleanup_temp_directory(self, tmp_path):
        """Test cleaning up a temporary directory."""
        fm = FileManager()
        temp_dir = tmp_path / "temp_to_clean"
        temp_dir.mkdir()
        (temp_dir / "file1.txt").touch()
        (temp_dir / "file2.txt").touch()

        fm.cleanup_temp_directory(temp_dir)

        assert not temp_dir.exists()

    def test_cleanup_nonexistent_directory(self, tmp_path):
        """Test cleanup of non-existent directory doesn't raise."""
        fm = FileManager()
        fake_dir = tmp_path / "does_not_exist"

        # Should not raise
        fm.cleanup_temp_directory(fake_dir)

    def test_create_temp_dir_secure(self, tmp_path):
        """Test creating a secure temp directory."""
        fm = FileManager()
        temp_dir = fm.create_temp_dir(base_dir=tmp_path, prefix="secure")

        assert temp_dir.exists()
        assert temp_dir in fm._temp_dirs


class TestCleanup:
    """Tests for FileManager.cleanup()"""

    def test_cleanup_removes_tracked_files(self, tmp_path):
        """Test that cleanup removes all tracked temp files."""
        fm = FileManager()

        temp_file = tmp_path / "tracked_file.tmp"
        temp_file.touch()
        fm.track_temp_file(temp_file)

        assert temp_file.exists()
        fm.cleanup()
        assert not temp_file.exists()

    def test_cleanup_removes_tracked_dirs(self, tmp_path):
        """Test that cleanup removes all tracked temp directories."""
        fm = FileManager()

        temp_dir = tmp_path / "tracked_dir"
        temp_dir.mkdir()
        fm.track_temp_dir(temp_dir)

        assert temp_dir.exists()
        fm.cleanup()
        assert not temp_dir.exists()

    def test_cleanup_clears_tracking_sets(self, tmp_path):
        """Test that cleanup clears the tracking sets."""
        fm = FileManager()

        temp_file = tmp_path / "file.tmp"
        temp_file.touch()
        fm.track_temp_file(temp_file)

        temp_dir = tmp_path / "dir"
        temp_dir.mkdir()
        fm.track_temp_dir(temp_dir)

        fm.cleanup()

        assert len(fm._temp_files) == 0
        assert len(fm._temp_dirs) == 0


class TestGetOutputPath:
    """Tests for FileManager.get_output_path()"""

    def test_get_output_path(self, tmp_path):
        """Test generating an output video path."""
        fm = FileManager()
        output_path = fm.get_output_path(str(tmp_path))

        assert output_path.parent == tmp_path
        assert output_path.suffix == ".mp4"
        assert "Animation_" in output_path.stem

    def test_get_output_path_none_raises(self):
        """Test that None output_dir raises ValueError."""
        fm = FileManager()
        with pytest.raises(ValueError, match="Output directory cannot be None"):
            fm.get_output_path(None)


class TestEnsureDirectory:
    """Tests for FileManager.ensure_directory()"""

    def test_ensure_directory_creates(self, tmp_path):
        """Test creating a new directory."""
        fm = FileManager()
        new_dir = tmp_path / "new" / "nested" / "dir"

        result = fm.ensure_directory(str(new_dir))

        assert result.exists()
        assert result.is_dir()

    def test_ensure_directory_existing(self, tmp_path):
        """Test with an existing directory."""
        fm = FileManager()
        existing = tmp_path / "existing"
        existing.mkdir()

        result = fm.ensure_directory(str(existing))

        assert result.exists()

    def test_ensure_directory_empty_raises(self):
        """Test that empty path raises ValueError."""
        fm = FileManager()
        with pytest.raises(ValueError, match="cannot be None or empty"):
            fm.ensure_directory("")


class TestKeepFileOrder:
    """Tests for FileManager.keep_file_order()"""

    def test_sort_by_timestamp(self, tmp_path):
        """Test sorting files by satellite timestamp."""
        fm = FileManager()

        files = []
        timestamps = [
            "20240115T120000Z",
            "20240115T100000Z",
            "20240115T110000Z",
        ]
        for ts in timestamps:
            f = tmp_path / f"GOES16_{ts}_ch13.png"
            f.touch()
            files.append(f)

        sorted_files = fm.keep_file_order(files)

        assert len(sorted_files) == 3
        # Files should be sorted chronologically
        assert "T100000Z" in sorted_files[0].name
        assert "T110000Z" in sorted_files[1].name
        assert "T120000Z" in sorted_files[2].name

    def test_keep_file_order_skips_missing(self, tmp_path):
        """Test that missing files are skipped."""
        fm = FileManager()

        existing = tmp_path / "GOES16_20240115T100000Z.png"
        existing.touch()
        missing = tmp_path / "GOES16_20240115T110000Z.png"

        sorted_files = fm.keep_file_order([existing, missing])

        assert len(sorted_files) == 1
        assert sorted_files[0] == existing


class TestFileManagerMisc:
    """Tests for miscellaneous FileManager methods."""

    def test_get_processed_filename(self):
        """Test generating a processed filename."""
        fm = FileManager()
        original = Path("/some/dir/frame0001.png")
        result = fm.get_processed_filename(original, "20240115_120000")

        assert result == "processed_frame0001_20240115_120000.png"

    def test_create_frame_filename(self):
        """Test creating a standardized frame filename."""
        fm = FileManager()
        result = fm.create_frame_filename(42, timestamp="20240115_120000")

        assert result == "frame_00000042_20240115_120000.png"

    def test_create_frame_filename_default_timestamp(self):
        """Test that frame filename gets auto-generated timestamp."""
        fm = FileManager()
        result = fm.create_frame_filename(0)

        assert result.startswith("frame_00000000_")
        assert result.endswith(".png")

    def test_parse_satellite_timestamp(self):
        """Test delegated timestamp parsing."""
        fm = FileManager()
        result = fm.parse_satellite_timestamp("GOES16_20240115T123045Z_ch13.png")

        assert result == datetime(2024, 1, 15, 12, 30, 45)

    def test_parse_satellite_timestamp_invalid(self):
        """Test timestamp parsing with invalid filename."""
        fm = FileManager()
        result = fm.parse_satellite_timestamp("no_timestamp.png")

        assert result == datetime.min
