from PyQt6.QtWidgets import QWidget, QVBoxLayout, QTextBrowser
from PyQt6.QtCore import pyqtSignal

class StatusWidget(QWidget):
    """Widget for displaying processing status"""
    
    status_update = pyqtSignal(str)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()
        
    def init_ui(self):
        layout = QVBoxLayout()
        self.status_display = QTextBrowser()
        self.status_display.setStyleSheet("""
            QTextBrowser {
                background-color: #1e1e1e;
                color: #ffffff;
                border: 1px solid #333333;
                border-radius: 4px;
                font-family: 'Segoe UI', Arial, sans-serif;
            }
        """)
        layout.addWidget(self.status_display)
        self.setLayout(layout)
        
    def update_status(self, html_content: str):
        """Update the status display with enhanced HTML content"""
        try:
            # Apply additional styling
            styled_content = f"""
                <style>
                    body {{ 
                        font-family: 'Segoe UI', Arial, sans-serif;
                        color: #ffffff;
                        background-color: #1e1e1e;
                        padding: 10px;
                    }}
                    .status {{ 
                        margin: 5px 0;
                        padding: 8px;
                        border-radius: 4px;
                        background-color: #2d2d2d;
                    }}
                </style>
                <div class="status">{html_content}</div>
            """
            self.status_display.setHtml(styled_content)
            
        except Exception as e:
            print(f"Failed to update status: {e}")

    def update_resource_stats(self, stats):
        """Update resource statistics in the status display"""
        try:
            resource_html = f"""
                <div class="resource-info">
                    <div class="resource-item">
                        <div class="resource-label">CPU Usage</div>
                        <div class="resource-value">{stats.get('cpu', 0):.1f}%</div>
                    </div>
                    <div class="resource-item">
                        <div class="resource-label">RAM Usage</div>
                        <div class="resource-value">{stats.get('ram', 0):.1f}%</div>
                    </div>
                </div>
            """
            current_content = self.status_display.toHtml()
            # Update only the resource section
            updated_content = self._update_resource_section(current_content, resource_html)
            self.status_display.setHtml(updated_content)
            
        except Exception as e:
            print(f"Failed to update resource stats: {e}")

    def _update_resource_section(self, current_content: str, new_resource_html: str) -> str:
        """Update the resource section of the status display"""
        try:
            # Find the resource section and replace it
            start_marker = '<div class="resource-info">'
            end_marker = '</div>'
            start_idx = current_content.find(start_marker)
            if start_idx == -1:
                # If no resource section exists, append it
                return current_content + new_resource_html
                
            # Find the end of the resource section
            end_idx = current_content.find(end_marker, start_idx) + len(end_marker)
            # Replace the old resource section with the new one
            return current_content[:start_idx] + new_resource_html + current_content[end_idx:]
            
        except Exception as e:
            print(f"Failed to update resource section: {e}")
            return current_content