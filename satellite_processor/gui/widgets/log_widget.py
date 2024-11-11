"""
Consolidated logging widget for application messages.
Provides colored output for different message types (normal, warning, error)
and includes timestamp display. Implements a custom logging handler for Qt.
"""

from PyQt6.QtWidgets import QWidget, QVBoxLayout, QTextBrowser  # Change to QTextBrowser
from PyQt6.QtGui import QTextCursor, QColor, QTextCharFormat
from PyQt6.QtCore import Qt, pyqtSignal, QUrl
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

class LogWidget(QWidget):
    """Consolidated log widget for all output types"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()
        
    def init_ui(self):
        """Initialize the UI components"""
        layout = QVBoxLayout(self)
        
        # Use QTextBrowser instead of QTextEdit for better HTML support
        self.text_edit = QTextBrowser()
        self.text_edit.setOpenExternalLinks(True)  # Enable clickable links
        self.text_edit.setOpenLinks(True)  # Allow opening links
        
        # Enhanced styling with link colors
        self.text_edit.setStyleSheet("""
            QTextBrowser {
                background-color: #1e1e1e;
                color: #ffffff;
                border: 1px solid #333333;
                border-radius: 4px;
                font-family: 'Consolas', monospace;
                font-size: 10pt;
                padding: 5px;
            }
            QTextBrowser a {
                color: #3498db;
                text-decoration: none;
            }
            QTextBrowser a:hover {
                color: #2980b9;
                text-decoration: underline;
            }
        """)
        
        layout.addWidget(self.text_edit)
        layout.setContentsMargins(0, 0, 0, 0)

    def append_message(self, message: str, replace_last: bool = False):
        """Append message to log with improved formatting"""
        try:
            cursor = self.text_edit.textCursor()
            
            if replace_last:
                cursor.movePosition(QTextCursor.MoveOperation.End)
                cursor.movePosition(QTextCursor.MoveOperation.StartOfLine, QTextCursor.MoveMode.KeepAnchor)
                cursor.removeSelectedText()
                cursor.deletePreviousChar()
            
            # Handle progress updates with carriage return
            if message.startswith('\r'):
                message = message[1:]
                cursor.movePosition(QTextCursor.MoveOperation.StartOfLine)
                cursor.movePosition(QTextCursor.MoveOperation.EndOfLine, QTextCursor.MoveMode.KeepAnchor)
                cursor.removeSelectedText()
            else:
                cursor.movePosition(QTextCursor.MoveOperation.End)
            
            # Format message with consistent spacing
            html = f"""
            <div style='margin: 2px 0; font-family: Consolas, monospace;'>
                {message}
            </div>
            """
            cursor.insertHtml(html)
            
            # Ensure visible
            self.text_edit.setTextCursor(cursor)
            self.text_edit.ensureCursorVisible()
            
        except Exception as e:
            logging.error(f"Error appending message: {e}")

    def append_clickable_path(self, message: str):
        """Add clickable file path with improved formatting and external app handling"""
        try:
            if '<a href="file:///' in message:
                path = message.split('file:///')[1].split('">')[0]
                display_path = Path(path).name
                clean_path = str(Path(path)).replace('\\', '/')
                
                html = f"""
                <div style='margin: 5px 0; font-family: Consolas, monospace;'>
                    <span style='color: #50fa7b;'>📁</span>
                    <span style='margin: 0 5px;'>Output:</span>
                    <a href='file:///{clean_path}' 
                       style='color: #3498db; text-decoration: none; background-color: #2c3e50; padding: 2px 6px; border-radius: 3px;'
                       onclick='QDesktopServices.openUrl(QUrl("file:///{clean_path}"));'
                       title='Click to open in default video player'>
                        {display_path}
                    </a>
                </div>
                """
                
                # Set up link behavior
                self.text_edit.setOpenExternalLinks(True)
                self.text_edit.setOpenLinks(True)
                
                # Insert the HTML
                self.text_edit.append(html)
                
                # Try to verify the file exists
                if os.path.exists(path):
                    self.append_success("Video file created successfully!")
                else:
                    self.append_warning("Video file path may be incorrect")
                    
        except Exception as e:
            logging.error(f"Error creating clickable link: {e}")
            self.append_message(message)

    def append_error(self, message: str):
        """Add error message with red color"""
        html = f"""
        <div style='color: #ff5555; margin: 5px 0;'>
            ❌ Error: {message}
        </div>
        """
        self.text_edit.insertHtml(html)

    def append_warning(self, message: str):
        """Add warning message with yellow color"""
        html = f"""
        <div style='color: #ffb86c; margin: 5px 0;'>
            ⚠️ Warning: {message}
        </div>
        """
        self.text_edit.insertHtml(html)

    def append_success(self, message: str):
        """Add success message with green color"""
        html = f"""
        <div style='color: #50fa7b; margin: 5px 0;'>
            ✅ {message}
        </div>
        """
        self.text_edit.insertHtml(html)