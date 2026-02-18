"""Real tests for resource_monitor.py — minimal mocking."""

import time

import pytest

from satellite_processor.core.resource_monitor import ResourceMonitor


class TestResourceMonitor:
    def test_init(self):
        rm = ResourceMonitor()
        assert rm._running is False
        assert rm.on_resource_update is None
        rm.cleanup()

    def test_set_interval(self):
        rm = ResourceMonitor()
        rm.set_interval(2000)
        assert rm._interval == 2.0
        rm.cleanup()

    def test_start_stop(self):
        rm = ResourceMonitor()
        rm.start()
        assert rm._running is True
        assert rm._thread is not None
        rm.stop()
        assert rm._running is False

    def test_start_idempotent(self):
        rm = ResourceMonitor()
        rm.start()
        thread1 = rm._thread
        rm.start()  # Should not create new thread
        assert rm._thread is thread1
        rm.stop()

    def test_callback_receives_data(self):
        rm = ResourceMonitor()
        rm.set_interval(50)  # 50ms
        results = []
        rm.on_resource_update = lambda stats: results.append(stats)
        rm.start()
        time.sleep(0.3)
        rm.stop()
        assert len(results) > 0
        assert "cpu" in results[0]
        assert "memory" in results[0]
        assert "timestamp" in results[0]

    def test_should_throttle_returns_bool(self):
        rm = ResourceMonitor()
        result = rm.should_throttle()
        assert isinstance(result, bool)
        rm.cleanup()

    def test_cleanup(self):
        rm = ResourceMonitor()
        rm.start()
        rm.cleanup()
        assert rm._running is False

    def test_del_doesnt_raise(self):
        rm = ResourceMonitor()
        rm.start()
        del rm  # Should not raise
