"""
Consolidated logging widget for application messages.
Provides colored output for different message types (normal, warning, error)
and includes timestamp display. Implements a custom logging handler for Qt.
"""

from PyQt6.QtWidgets import QWidget, QVBoxLayout, QTextBrowser, QTextEdit
from PyQt6.QtGui import (
    QTextCursor,
    QColor,
    QTextCharFormat,
    QDesktopServices,
)  # Move QDesktopServices here
from PyQt6.QtCore import Qt, pyqtSignal, QUrl, QMetaObject  # Add QMetaObject
from pathlib import Path
import logging
import time
import os


class QTextBrowserHandler(logging.Handler):
    """Custom logging handler that emits logs to a QTextBrowser"""

    def __init__(self, widget):
        super().__init__()
        self.widget = widget
        self.widget.document().setMaximumBlockCount(1000)  # Limit number of lines

    def emit(self, record):
        msg = self.format(record)
        self.widget.append(msg)


class LogWidget(QTextBrowser):  # Change to inherit from QTextBrowser
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setReadOnly(True)
        self.setOpenLinks(False)  # Disable default link handling
        self.anchorClicked.connect(
            self.handle_link_click
        )  # This signal exists in QTextBrowser
        self.setStyleSheet("""
            QTextBrowser {
                background-color: #2c3e50;
                color: #ecf0f1;
                border: none;
                font-family: Consolas, monospace;
            }
            QTextBrowser a {
                color: #3498db;
                text-decoration: none;
            }
            QTextBrowser a:hover {
                color: #2980b9;
            }
        """)

    def append_message(self, message: str, replace_last: bool = False):
        if replace_last and not message.startswith("\r"):
            message = "\r" + message
        self.append(message)
        self.ensureCursorVisible()

    def append_error(self, message: str):
        self.append(f'<span style="color: #e74c3c;">❌ Error: {message}</span>')
        self.ensureCursorVisible()

    def append_html(self, html: str):
        """Append HTML content with proper handling"""
        # Insert HTML at the end
        self.moveCursor(QTextCursor.MoveOperation.End)
        self.textCursor().insertHtml(html)

        # Scroll to bottom using direct method call
        scrollbar = self.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())

        # Ensure cursor is visible
        self.ensureCursorVisible()

    def handle_link_click(self, url: QUrl):
        """Handle clicking on links in the log with error handling"""
        try:
            if url.isLocalFile():
                file_path = url.toLocalFile()
                if Path(file_path).exists():
                    QDesktopServices.openUrl(url)
                else:
                    self.append_error(f"File not found: {file_path}")
        except Exception as e:
            self.append_error(f"Failed to open link: {e}")

    def clear_log(self):
        """Clear all content"""
        self.clear()
