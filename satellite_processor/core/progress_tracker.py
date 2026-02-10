"""
Progress Tracking Module
Responsibilities:
- Track overall processing progress
- Manage operation-specific progress
- Emit progress updates via callbacks
- Handle progress calculations
- Manage operation completion states
Dependencies:
- None (plain Python)
Used by:
- Processor for progress reporting
- UI for progress bar updates
"""

from typing import Optional, Callable


class ProgressTracker:
    """Enhanced progress tracking with unified interface"""

    def __init__(self):
        self.current_operation = 0
        self.total_operations = 0

        # Callback-based signals (replace pyqtSignal)
        self.on_progress: Optional[Callable[[str, int], None]] = None
        self.on_overall_progress: Optional[Callable[[int], None]] = None
        self.on_status: Optional[Callable[[str], None]] = None
        self.on_error: Optional[Callable[[str], None]] = None
        self.on_finished: Optional[Callable[[], None]] = None

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
