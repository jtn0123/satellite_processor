import pytest
from PyQt6.QtWidgets import QApplication
import sys

@pytest.fixture(scope='session')
def qapp():
    """Create a QApplication instance for the tests."""
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    yield app

# Removed the custom qtbot fixture.
