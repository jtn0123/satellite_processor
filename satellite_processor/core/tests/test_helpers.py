import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest


def create_mock_image_files(directory: Path, count: int = 5) -> None:
    """Create mock image files in the given directory."""
    directory.mkdir(parents=True, exist_ok=True)

    # Create actual PNG files with valid dimensions
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    for i in range(count):
        filepath = directory / f"frame{i:04d}.png"
        cv2.imwrite(str(filepath), img)


@pytest.fixture
def mock_directories(tmp_path) -> tuple[Path, Path]:
    """Create temporary input and output directories for testing."""
    input_dir = tmp_path / "input"
    output_dir = tmp_path / "output"

    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Create mock image files
    create_mock_image_files(input_dir)

    return input_dir, output_dir


@pytest.fixture
def mock_ffmpeg(monkeypatch):
    """Create a mock FFmpeg runner that mocks both run and Popen."""
    mock = MagicMock()
    mock.return_value = MagicMock(
        returncode=0,
        stderr="",
        stdout="",
        communicate=lambda: ("", ""),
        poll=lambda: None,
    )
    monkeypatch.setattr("subprocess.run", mock)
    monkeypatch.setattr("subprocess.Popen", lambda *args, **kwargs: mock.return_value)
    return mock


@pytest.fixture
def mock_interpolator(monkeypatch):
    """Create a mock interpolator."""
    mock = MagicMock()
    monkeypatch.setattr("satellite_processor.core.image_operations.Interpolator", mock)
    return mock


# Add this fixture to mock filesystem checks
@pytest.fixture
def mock_filesystem():
    with patch("pathlib.Path.exists", return_value=True), patch(
        "pathlib.Path.is_dir", return_value=True
    ), patch("pathlib.Path.mkdir"):
        yield


@pytest.fixture
def mock_network_path(tmp_path):
    """Create mock network path structure with improved handling"""
    # Create local structure that mirrors network path
    local_base = tmp_path / "network_mock"
    local_base.mkdir(parents=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    process_dir = local_base / f"processed_{timestamp}"
    timestamp_dir = process_dir / f"03_timestamp_{timestamp}"
    timestamp_dir.mkdir(parents=True)

    # Create test frames
    for i in range(5):
        frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
        frame_path = timestamp_dir / f"frame{i:04d}.png"
        cv2.imwrite(str(frame_path), frame)

    # Return UNC-style path but use local path internally
    return str(timestamp_dir).replace(str(tmp_path), "\\\\TRUENAS")


def mock_ffmpeg_command():
    """Create a mock FFmpeg command that always succeeds"""
    return {"returncode": 0, "stdout": "", "stderr": ""}


def create_mock_ffmpeg(monkeypatch):
    """Set up FFmpeg mock that works with both direct calls and subprocess"""

    def mock_run(*args, **kwargs):
        return type("MockProcess", (), mock_ffmpeg_command())

    monkeypatch.setattr("subprocess.run", mock_run)
    monkeypatch.setattr("subprocess.Popen", lambda *args, **kwargs: mock_run())


def assert_path_exists(path: Path) -> None:
    """Assert that a path exists."""
    assert path.exists(), f"Path does not exist: {path}"


def assert_path_is_directory(path: Path) -> None:
    """Assert that a path is a directory."""
    assert path.is_dir(), f"Path is not a directory: {path}"


def assert_path_is_file(path: Path) -> None:
    """Assert that a path is a file."""
    assert path.is_file(), f"Path is not a file: {path}"


def assert_directory_contains_files(
    directory: Path, pattern: str, min_count: int = 1
) -> None:
    """Assert that a directory contains files matching a pattern."""
    files = list(directory.glob(pattern))
    assert (
        len(files) >= min_count
    ), f"Directory {directory} should contain at least {min_count} files matching {pattern}, found {len(files)}"


def create_test_video_options(testing: bool = True, **kwargs) -> dict:
    """Create a test video options dictionary with default values."""
    options = {
        "fps": 30,
        "encoder": "H.264",
        "hardware": "CPU",
        "interpolation_enabled": True,
        "interpolation_quality": "high",
        "interpolation_factor": 2,
        "bitrate": 5000,
        "transcoding_enabled": False,
    }
    options.update(kwargs)
    return options


def setup_test_environment(base_dir: Path) -> tuple[Path, Path, Path]:
    """Set up a test environment with input, output, and temp directories."""
    input_dir = base_dir / "input"
    output_dir = base_dir / "output"
    temp_dir = base_dir / "temp"

    for directory in (input_dir, output_dir, temp_dir):
        directory.mkdir(parents=True, exist_ok=True)

    return input_dir, output_dir, temp_dir


def cleanup_test_environment(base_dir: Path) -> None:
    """Clean up the test environment."""
    if base_dir.exists():  # Corrected method call syntax
        shutil.rmtree(base_dir)


class TestWithMockFileSystem:
    """Mixin class to provide filesystem mocking for tests."""

    def setup_mock_filesystem(self):
        """Set up a mock filesystem with test files."""
        self.temp_dir = tempfile.mkdtemp()
        self.input_dir = Path(self.temp_dir) / "input"
        self.output_dir = Path(self.temp_dir) / "output"
        self.input_dir.mkdir(parents=True)
        self.output_dir.mkdir(parents=True)

        # Create test frames
        for i in range(5):
            (self.input_dir / f"frame{i:04d}.png").touch()
        return self.input_dir, self.output_dir

    def teardown_mock_filesystem(self):
        """Clean up the mock filesystem."""
        if hasattr(self, "temp_dir"):
            shutil.rmtree(self.temp_dir, ignore_errors=True)

    @staticmethod
    def assert_validation_error(func, *args, expected_message):
        """Helper to test validation errors."""
        with pytest.raises(ValueError) as exc_info:
            func(*args)
        assert expected_message in str(exc_info.value)
