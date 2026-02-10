import pytest
from pathlib import Path
from unittest.mock import patch
from .test_helpers import mock_directories, mock_ffmpeg  # Import fixtures


@pytest.fixture
def mock_video_handler():
    """Create a mock video handler."""
    with patch("satellite_processor.core.video_handler.VideoHandler") as mock:
        yield mock


@pytest.fixture
def mock_interpolator():
    """Create a mock interpolator."""
    with patch("satellite_processor.core.image_operations.Interpolator") as mock:
        yield mock


@pytest.fixture
def mock_filesystem():
    with patch("pathlib.Path.exists", return_value=True), patch(
        "pathlib.Path.is_dir", return_value=True
    ), patch("pathlib.Path.mkdir"):
        yield


# Re-export fixtures from test_helpers
__all__ = ["mock_directories", "mock_ffmpeg"]
