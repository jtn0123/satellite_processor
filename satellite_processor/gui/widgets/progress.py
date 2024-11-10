from PyQt6.QtWidgets import (
    QGroupBox, QVBoxLayout, QHBoxLayout,
    QLabel, QProgressBar, QPushButton, QWidget
)
from PyQt6.QtCore import Qt, pyqtSignal

class ProgressWidget(QGroupBox):
    """Widget for displaying processing progress"""
    
    cancel_clicked = pyqtSignal()  # Signal when cancel button clicked
    
    def __init__(self, parent: QWidget = None) -> None:
        super().__init__("Progress", parent)
        layout = QVBoxLayout()
        
        # Status Label
        self.status_label = QLabel("Ready")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        # Overall Progress
        overall_layout = QVBoxLayout()
        overall_label = QLabel("Overall Progress:")
        self.overall_progress = QProgressBar()
        self.overall_progress.setRange(0, 100)
        overall_layout.addWidget(overall_label)
        overall_layout.addWidget(self.overall_progress)
        
        # Operation Progress
        operation_layout = QVBoxLayout()
        self.operation_label = QLabel("Current Operation:")
        self.operation_progress = QProgressBar()
        self.operation_progress.setRange(0, 100)
        operation_layout.addWidget(self.operation_label)
        operation_layout.addWidget(self.operation_progress)
        
        # Cancel Button
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.setEnabled(False)
        self.cancel_button.clicked.connect(self.cancel_clicked.emit)
        
        # Layout
        layout.addWidget(self.status_label)
        layout.addLayout(overall_layout)
        layout.addLayout(operation_layout)
        layout.addWidget(self.cancel_button)
        
        self.setLayout(layout)
    
    def update_status(self, message: str) -> None:
        """Update status message"""
        self.status_label.setText(message)
    
    def update_progress(self, operation: str, progress: int) -> None:
        """Update operation progress"""
        self.operation_label.setText(f"Current Operation: {operation}")
        self.operation_progress.setValue(progress)
    
    def update_overall(self, progress: int) -> None:
        """Update overall progress"""
        self.overall_progress.setValue(progress)
    
    def processing_started(self) -> None:
        """Called when processing starts"""
        self.cancel_button.setEnabled(True)
        self.status_label.setText("Processing...")
        self.overall_progress.setValue(0)
        self.operation_progress.setValue(0)
    
    def processing_finished(self) -> None:
        """Called when processing finishes"""
        self.cancel_button.setEnabled(False)
        self.status_label.setText("Complete")
        self.overall_progress.setValue(100)
        self.operation_progress.setValue(100)

# Verify if progress handling is already managed in ProgressWidget or another component
# If redundant, remove this file or integrate its functionality appropriately