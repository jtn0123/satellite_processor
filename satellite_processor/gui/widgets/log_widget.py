"""
Consolidated logging widget for application messages.
Provides colored output for different message types (normal, warning, error)
and includes timestamp display. Implements a custom logging handler for Qt.
"""

from PyQt6.QtWidgets import QWidget, QVBoxLayout, QTextBrowser
from PyQt6.QtGui import QTextCursor, QColor, QTextCharFormat, QDesktopServices  # Move QDesktopServices here
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
        # Set max_history before calling init_ui
        self.max_history = 5000  # Increased history size
        self.init_ui()
        
    def init_ui(self):
        """Initialize the UI components"""
        layout = QVBoxLayout(self)
        
        self.text_edit = QTextBrowser()
        self.text_edit.setOpenExternalLinks(True)
        self.text_edit.setOpenLinks(True)
        self.text_edit.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOn)  # Always show scrollbar
        
        # Enhanced styling with vertical stacking
        self.text_edit.setStyleSheet("""
            QTextBrowser {
                background-color: #1e1e1e;
                color: #ffffff;
                border: 1px solid #333333;
                border-radius: 4px;
                font-family: 'Consolas', monospace;
                font-size: 10pt;
                padding: 5px;
                line-height: 1.4;  /* Increased line spacing */
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
        
        # Set word wrap and scroll mode
        self.text_edit.setLineWrapMode(QTextBrowser.LineWrapMode.WidgetWidth)
        self.text_edit.setOverwriteMode(False)  # Ensure text is appended, not overwritten
        
        layout.addWidget(self.text_edit)
        layout.setContentsMargins(0, 0, 0, 0)

        # Set document properties for better scrolling
        self.text_edit.setReadOnly(True)
        self.text_edit.document().setMaximumBlockCount(self.max_history)
        
        # Connect link clicks to custom handler
        self.text_edit.anchorClicked.connect(self._handle_link_click)
        self.text_edit.setOpenLinks(False)  # Let us handle link clicks

    def _handle_link_click(self, url: QUrl):
        """Handle link clicks by opening in system default application"""
        try:
            # Convert URL to clean file path
            file_path = url.toLocalFile()
            if file_path and Path(file_path).exists():
                # Use QDesktopServices to open file with system default app
                QDesktopServices.openUrl(url)
            else:
                self.append_warning(f"File not found: {file_path}")
        except Exception as e:
            self.append_error(f"Error opening file: {str(e)}")

    def append_message(self, message: str, replace_last: bool = False):
        """Append message with improved formatting and word wrap"""
        try:
            cursor = self.text_edit.textCursor()
            
            # Move to end before clearing to maintain scroll position
            cursor.movePosition(QTextCursor.MoveOperation.End)
            self.text_edit.setTextCursor(cursor)
            
            # Clear all text if it's a new section header
            if any(emoji in message for emoji in ['🛰️', '🎨', '⏰', '🎥', '✨']):
                self.text_edit.clear()
            
            # Format the message
            if '█' in message:  # Progress bar
                formatted = self._format_progress_bar(message)
            elif '─' in message or '━' in message:  # Separator
                formatted = self._format_separator()
            elif message.startswith('📁'):  # Output file
                formatted = self._format_output_link(message)
            elif any(emoji in message for emoji in ['🛰️', '🎨', '⏰', '🎥', '✨']):
                formatted = self._format_section_header(message)
            else:
                formatted = self._format_message(message)

            # Replace or append
            if replace_last or message.startswith('\r'):
                cursor.movePosition(QTextCursor.MoveOperation.StartOfLine, QTextCursor.MoveMode.KeepAnchor)
                cursor.removeSelectedText()
            
            # Insert with newline if not a progress bar
            if '█' not in message:
                formatted += "<br>"
            
            cursor.insertHtml(formatted)
            
            # Ensure new text is visible
            self.text_edit.verticalScrollBar().setValue(
                self.text_edit.verticalScrollBar().maximum()
            )
            
            # Keep scroll at bottom only if it was at bottom before
            scrollbar = self.text_edit.verticalScrollBar()
            at_bottom = scrollbar.value() >= scrollbar.maximum() - 10
            
            # Auto-scroll only if we were at bottom
            if at_bottom:
                scrollbar.setValue(scrollbar.maximum())
            
        except Exception as e:
            logging.error(f"Error formatting message: {e}")
            self.text_edit.append(message)

    def _format_progress_bar(self, message: str) -> str:
        """Format progress bar with consistent width"""
        try:
            # Strip timestamp if present
            if message.startswith('[') and ']' in message:
                message = message.split(']', 1)[1].strip()
                
            # Split operation and progress
            if '[' in message and ']' in message:
                operation = message.split('[')[0].strip()
                progress = message[message.find('['):]
            else:
                return self._format_message(message)
                
            return f"""
                <div style='
                    font-family: Consolas, monospace;
                    margin: 4px 0;
                    padding: 2px 0;
                    white-space: pre;
                '><span style='display: inline-block; width: 180px;'>{operation}</span>{progress}</div>
            """
        except:
            return self._format_message(message)

    def _format_separator(self) -> str:
        """Format separator with proper spacing and no word wrap"""
        return """
            <div style='
                height: 1px;
                background-color: #555;
                margin: 12px 0;
                width: 100%;
                white-space: nowrap;
                overflow: visible;
            '></div>
        """

    def _format_section_header(self, message: str) -> str:
        """Format section headers with emoji and proper spacing"""
        return f"""
            <div style='
                font-family: Consolas, monospace;
                font-weight: bold;
                color: #3498db;
                margin: 12px 0 8px 0;
                padding: 4px 0;
                white-space: nowrap;
                overflow: visible;
            '>{message}</div>
        """

    def _format_message(self, message: str) -> str:
        """Format normal message with proper spacing and line breaks"""
        if not message.strip():
            return "<div style='height: 8px;'></div>"  # Empty line spacer
            
        # Remove timestamp if it exists at the start of the message
        if message.startswith('[') and ']' in message:
            message = message.split(']', 1)[1].strip()
            
        # Add proper HTML formatting
        return f"""
            <div style='
                font-family: Consolas, monospace;
                margin: 4px 0;
                padding: 2px 0;
                white-space: pre;
                overflow: visible;
            '>{message}</div>
        """

    def append_clickable_path(self, message: str):
        """Add clickable file path with improved external file handling"""
        try:
            if '<a href="file:///' in message:
                path = message.split('file:///')[1].split('">')[0]
                display_path = Path(path).name
                clean_path = str(Path(path).resolve()).replace('\\', '/')
                
                html = f"""
                <div style='margin: 8px 0; font-family: Consolas, monospace;'>
                    <span style='color: #50fa7b;'>📁</span>
                    <span style='margin: 0 5px;'>Output:</span>
                    <a href='file:///{clean_path}' 
                       style='color: #3498db; text-decoration: none; 
                              background-color: #2c3e50; padding: 2px 6px; 
                              border-radius: 3px;'>
                        {display_path}
                    </a>
                </div>
                <br>
                """
                
                self.text_edit.append(html)
                
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