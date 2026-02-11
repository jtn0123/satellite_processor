"""
Progress Tracking Module
Responsibilities:
- Track overall processing progress
- Manage operation-specific progress
- Emit progress updates via callbacks
- Handle progress calculations
- Manage operation completion states
"""

from __future__ import annotations

from collections.abc import Callable


class ProgressTracker:
    """Enhanced progress tracking with unified interface"""

    def __init__(self):
        self.current_operation = 0
        self.total_operations = 0

        # Callback-based signals (replace pyqtSignal)
        self.on_progress: Callable[[str, int], None] | None = None
        self.on_overall_progress: Callable[[int], None] | None = None
        self.on_status: Callable[[str], None] | None = None
        self.on_error: Callable[[str], None] | None = None
        self.on_finished: Callable[[], None] | None = None

    def start_operation(self, total_operations: int):
        """Initialize progress tracking for multiple operations"""
        self.current_operation = 0
        self.total_operations = total_operations

    def update_progress(self, operation: str, progress: int):
        """Update progress for current operation"""
        if self.on_progress:
            self.on_progress(operation, progress)
        if self.total_operations > 0 and self.on_overall_progress:
            overall = int(
                ((self.current_operation + progress / 100) / self.total_operations)
                * 100
            )
            self.on_overall_progress(overall)

    def complete_operation(self):
        """Mark current operation as complete"""
        self.current_operation += 1
        self.update_progress("", 100)
