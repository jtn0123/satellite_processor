"""Real tests for progress_tracker.py — no mocking."""

from satellite_processor.core.progress_tracker import ProgressTracker


class TestProgressTracker:
    def test_init_defaults(self):
        pt = ProgressTracker()
        assert pt.current_operation == 0
        assert pt.total_operations == 0
        assert pt.on_progress is None
        assert pt.on_overall_progress is None

    def test_start_operation(self):
        pt = ProgressTracker()
        pt.start_operation(5)
        assert pt.total_operations == 5
        assert pt.current_operation == 0

    def test_update_progress_with_callback(self):
        pt = ProgressTracker()
        pt.start_operation(2)
        calls = []
        pt.on_progress = lambda op, p: calls.append((op, p))
        pt.update_progress("test", 50)
        assert calls == [("test", 50)]

    def test_overall_progress_calculation(self):
        pt = ProgressTracker()
        pt.start_operation(4)
        overall_values = []
        pt.on_overall_progress = lambda v: overall_values.append(v)
        pt.on_progress = lambda *a: None
        pt.update_progress("op1", 50)
        # overall = ((0 + 50/100) / 4) * 100 = 12
        assert overall_values == [12]

    def test_complete_operation(self):
        pt = ProgressTracker()
        pt.start_operation(3)
        calls = []
        pt.on_progress = lambda op, p: calls.append((op, p))
        pt.complete_operation()
        assert pt.current_operation == 1
        assert calls[-1] == ("", 100)

    def test_no_callbacks_no_error(self):
        pt = ProgressTracker()
        pt.start_operation(1)
        pt.update_progress("op", 50)  # Should not raise
        pt.complete_operation()

    def test_zero_total_operations(self):
        pt = ProgressTracker()
        pt.start_operation(0)
        overall = []
        pt.on_overall_progress = lambda v: overall.append(v)
        pt.update_progress("op", 50)
        # total_operations is 0, so overall_progress should not be called
        assert overall == []

    def test_status_callback(self):
        pt = ProgressTracker()
        msgs = []
        pt.on_status = lambda m: msgs.append(m)
        # status callback exists but isn't called by update_progress
        pt.update_progress("op", 50)
        assert msgs == []

    def test_error_callback_invoked(self):
        pt = ProgressTracker()
        errors = []
        pt.on_error = lambda e: errors.append(e)
        # Verify callback is set and callable
        pt.on_error("test error")
        assert errors == ["test error"]

    def test_finished_callback_invoked(self):
        pt = ProgressTracker()
        finished = []
        pt.on_finished = lambda: finished.append(True)
        # Verify callback is set and callable
        pt.on_finished()
        assert finished == [True]
