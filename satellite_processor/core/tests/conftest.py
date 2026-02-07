import pytest
from pathlib import Path
from unittest.mock import patch
from PyQt6.QtWidgets import QApplication
from .test_helpers import mock_directories, mock_ffmpeg  # Import fixtures
from satellite_processor.gui.widgets.video_options import VideoOptionsWidget


@pytest.fixture(scope="session")
def qapp():
    """Create a Qt Application instance for the test session."""
    app = QApplication.instance()
    if app is None:
        app = QApplication([])
    return app


@pytest.fixture
def video_options(qapp, qtbot):
    """Create a VideoOptionsWidget instance for testing."""
    widget = VideoOptionsWidget()
    widget.testing = True
    qtbot.addWidget(widget)
    return widget


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
