"""
Simple progress tracking widget.
Displays current operation and progress through a progress bar.
Used for showing processing status to users.
"""

from PyQt6.QtWidgets import QWidget, QVBoxLayout, QLabel, QProgressBar

class ProgressWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        
        # Operation label
        self.operation_label = QLabel("No operation in progress")
        layout.addWidget(self.operation_label)
        
        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setMinimum(0)
        self.progress_bar.setMaximum(100)
        layout.addWidget(self.progress_bar)

    def update_progress(self, operation: str, progress: int) -> None:
        """Update progress bar and operation label."""
        self.operation_label.setText(operation)
        self.progress_bar.setValue(progress)