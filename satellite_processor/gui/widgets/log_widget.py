from PyQt6.QtWidgets import QWidget, QVBoxLayout, QTextBrowser, QPushButton, QHBoxLayout, QTextEdit
from PyQt6.QtGui import QTextCharFormat, QColor, QTextCursor
from PyQt6.QtCore import Qt, pyqtSignal
import logging
import time

class QTextBrowserHandler(logging.Handler):
    """Custom logging handler that emits logs to a QTextBrowser"""
    
    def __init__(self, widget):
        super().__init__()
        self.widget = widget
        self.widget.document().setMaximumBlockCount(1000)  # Limit number of lines
        
    def emit(self, record):
        msg = self.format(record)
        self.widget.append(msg)

class LogWidget(QWidget):
    """Consolidated log widget for all output types"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()
        
    def init_ui(self):
        layout = QVBoxLayout(self)
        
        # Create single text display
        self.log_display = QTextBrowser()
        self.log_display.setStyleSheet("""
            QTextBrowser {
                background-color: #1e1e1e;
                color: #ffffff;
                border: 1px solid #333333;
                border-radius: 4px;
                font-family: 'Consolas', monospace;
                padding: 5px;
            }
        """)
        layout.addWidget(self.log_display)
        
    def append_message(self, message: str):
        """Add normal message"""
        self._append_text(message, "#ffffff")
        
    def append_error(self, message: str):
        """Add error message"""
        self._append_text(f"ERROR: {message}", "#ff6b6b")
        
    def append_warning(self, message: str):
        """Add warning message"""
        self._append_text(f"WARNING: {message}", "#ffd93d")
        
    def _append_text(self, message: str, color: str):
        """Add text with timestamp and color"""
        timestamp = time.strftime("%H:%M:%S")
        html = f'<span style="color: {color}">[{timestamp}] {message}</span><br>'
        self.log_display.append(html)
        # Auto-scroll to bottom
        self.log_display.verticalScrollBar().setValue(
            self.log_display.verticalScrollBar().maximum()
        )