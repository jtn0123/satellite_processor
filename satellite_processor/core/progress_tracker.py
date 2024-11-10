
from PyQt6.QtCore import QObject, pyqtSignal

class ProgressTracker(QObject):
    """Handles progress tracking and status updates"""
    
    progress_update = pyqtSignal(str, int)
    status_update = pyqtSignal(str)
    error_occurred = pyqtSignal(str)
    finished = pyqtSignal()
    overall_progress = pyqtSignal(int)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_operation = 0
        self.total_operations = 0
        
    def start_operation(self, total_operations: int):
        """Initialize progress tracking for multiple operations"""
        self.current_operation = 0
        self.total_operations = total_operations
        
    def update_progress(self, operation: str, progress: int):
        """Update progress for current operation"""
        self.progress_update.emit(operation, progress)
        if self.total_operations > 0:
            overall = int(((self.current_operation + progress/100) / self.total_operations) * 100)
            self.overall_progress.emit(overall)
            
    def complete_operation(self):
        """Mark current operation as complete"""
        self.current_operation += 1
        self.update_progress("", 100)