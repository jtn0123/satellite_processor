"""
Tests to boost code coverage for core modules:
- SettingsManager
- ProgressTracker
- ResourceMonitor
"""

from pathlib import Path
from unittest.mock import patch

import pytest

from satellite_processor.core.progress_tracker import ProgressTracker
from satellite_processor.core.resource_monitor import ResourceMonitor
from satellite_processor.core.settings_manager import SettingsManager

# ---------------------------------------------------------------------------
# SettingsManager
# ---------------------------------------------------------------------------


class TestSettingsManager:
    """Tests for SettingsManager covering defaults, get/set, persistence, and
    validation."""

    @pytest.fixture(autouse=True)
    def _patch_home(self, tmp_path, monkeypatch):
        """Redirect Path.home() so settings files land in tmp_path."""
        monkeypatch.setattr(Path, "home", staticmethod(lambda: tmp_path))

    def test_default_settings(self, tmp_path):
        """A fresh SettingsManager should contain every default key."""
        sm = SettingsManager()
        for key, value in SettingsManager.DEFAULT_SETTINGS.items():
            assert sm.get(key) == value, f"Default mismatch for {key}"

    def test_get_set(self, tmp_path):
        """set() followed by get() should return the (resolved) value."""
        sm = SettingsManager()
        sm.set("input_dir", "/foo")
        result = sm.get("input_dir")
        # "input_dir" contains "dir" not "path", so resolve only happens
        # when "path" is in the key name – but the key is "input_dir".
        # Re-read the source: the check is `"path" in key.lower()`.
        # "input_dir" does NOT contain "path", so value stays as-is.
        assert result == "/foo"

    def test_get_set_path_key(self, tmp_path):
        """Keys containing 'path' get resolved to an absolute path."""
        sm = SettingsManager()
        sm.set("sanchez_path", "/tmp/sanchez")
        result = sm.get("sanchez_path")
        assert result == str(Path("/tmp/sanchez").resolve())

    def test_update_multiple(self, tmp_path):
        """update() should persist several values at once."""
        sm = SettingsManager()
        sm.update({"crop_enabled": True, "last_fps": 60})
        assert sm.get("crop_enabled") is True
        assert sm.get("last_fps") == 60

    def test_validate_preferences_missing_temp(self, tmp_path):
        """Default settings have empty temp_directory – validation must fail."""
        sm = SettingsManager()
        valid, message = sm.validate_preferences()
        assert valid is False
        assert "temp_directory" in message

    def test_validate_preferences_valid(self, tmp_path):
        """With temp_directory set, validation should pass."""
        sm = SettingsManager()
        sm.update({"temp_directory": "/tmp"})
        valid, message = sm.validate_preferences()
        assert valid is True
        assert message == ""

    def test_load_preference_alias(self, tmp_path):
        """load_preference should behave identically to get()."""
        sm = SettingsManager()
        sm.set("last_fps", 24)
        assert sm.load_preference("last_fps") == sm.get("last_fps")

    def test_save_preference_alias(self, tmp_path):
        """save_preference should behave identically to set()."""
        sm = SettingsManager()
        sm.save_preference("last_fps", 15)
        assert sm.get("last_fps") == 15

    def test_persistence(self, tmp_path):
        """Values must survive across SettingsManager instances."""
        sm1 = SettingsManager()
        sm1.set("last_fps", 120)

        sm2 = SettingsManager()
        assert sm2.get("last_fps") == 120


# ---------------------------------------------------------------------------
# ProgressTracker
# ---------------------------------------------------------------------------


_has_qt = pytest.importorskip is not None  # placeholder
try:
    import pytestqt  # noqa: F401
    _has_qt = True
except ImportError:
    _has_qt = False


@pytest.mark.skipif(not _has_qt, reason="pytest-qt not installed")
class TestProgressTracker:
    """Tests for ProgressTracker signals and state management."""

    def test_start_operation(self, qapp):
        """start_operation should reset current_operation and set total."""
        pt = ProgressTracker()
        pt.start_operation(5)
        assert pt.current_operation == 0
        assert pt.total_operations == 5

    def test_update_progress_signal(self, qapp, qtbot):
        """update_progress should emit the progress_update signal."""
        pt = ProgressTracker()
        pt.start_operation(2)

        with qtbot.waitSignal(pt.progress_update, timeout=1000) as blocker:
            pt.update_progress("crop", 50)

        assert blocker.args == ["crop", 50]

    def test_overall_progress(self, qapp, qtbot):
        """Overall progress should be emitted with the correct percentage.

        Formula: int(((current_operation + progress/100) / total) * 100)
        With current_operation=0, progress=50, total=4:
            int(((0 + 0.5) / 4) * 100) = int(12.5) = 12
        """
        pt = ProgressTracker()
        pt.start_operation(4)

        with qtbot.waitSignal(pt.overall_progress, timeout=1000) as blocker:
            pt.update_progress("op", 50)

        assert blocker.args == [12]

    def test_complete_operation(self, qapp, qtbot):
        """complete_operation should increment current_operation."""
        pt = ProgressTracker()
        pt.start_operation(2)

        # complete_operation calls update_progress internally, so signals fire
        with qtbot.waitSignal(pt.overall_progress, timeout=1000):
            pt.complete_operation()

        assert pt.current_operation == 1


# ---------------------------------------------------------------------------
# ResourceMonitor
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not _has_qt, reason="pytest-qt not installed")
class TestResourceMonitor:
    """Tests for ResourceMonitor initialisation, interval, stop, and signal."""

    def test_init(self, qapp):
        """Freshly created monitor should be running with 1-second interval."""
        monitor = ResourceMonitor()
        assert monitor._running is True
        assert monitor._interval == pytest.approx(1.0)
        # Clean up without starting the thread
        monitor._running = False

    def test_set_interval(self, qapp):
        """set_interval(ms) should store the value in seconds."""
        monitor = ResourceMonitor()
        monitor.set_interval(500)
        assert monitor._interval == pytest.approx(0.5)
        monitor._running = False

    def test_stop(self, qapp):
        """stop() should set _running to False."""
        monitor = ResourceMonitor()
        # Don't actually start the thread – just verify the flag.
        monitor._running = True
        # Patch isRunning to avoid waiting on a thread that was never started.
        with patch.object(monitor, "isRunning", return_value=False):
            monitor.stop()
        assert monitor._running is False

    def test_resource_update_signal(self, qapp, qtbot):
        """The monitor should emit resource_update with cpu and memory keys."""
        monitor = ResourceMonitor()
        monitor.set_interval(50)  # 50 ms for a fast first tick

        with qtbot.waitSignal(monitor.resource_update, timeout=3000) as blocker:
            monitor.start()

        # Shut down the thread cleanly
        monitor._running = False
        monitor.wait(2000)

        data = blocker.args[0]
        assert "cpu" in data
        assert "memory" in data
