"""
Status management system for tracking and displaying processing progress.
Provides a rich HTML-based status display with progress tracking, resource monitoring,
and step-by-step process visualization. Also includes settings management functionality.
"""

from PyQt6.QtCore import QObject, pyqtSignal
from PyQt6.QtWidgets import QApplication
import logging
from typing import List  # Add this import

class StatusManager(QObject):
    """Manage and render the processing status display"""
    
    status_update = pyqtSignal(str)
    progress_update = pyqtSignal(str, int)
    error_occurred = pyqtSignal(str)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.logger = logging.getLogger(__name__)
        self._initialize_attributes()
        self._initialize_steps()
        self.css = '''
            <style>
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    padding: 10px;
                    background-color: #1e1e1e;
                    color: #ffffff;
                }
                .header {
                    font-size: 16px;
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: #00bcd4;
                }
                .step {
                    margin: 8px 0;
                    padding: 8px;
                    border-radius: 4px;
                    background-color: #2d2d2d;
                }
                .step.active {
                    background-color: #2c3e50;
                    border-left: 4px solid #00bcd4;
                }
                .step.completed {
                    background-color: #1b5e20;
                    opacity: 0.8;
                }
                .progress-bar {
                    height: 6px;
                    background-color: #424242;
                    border-radius: 3px;
                    margin: 5px 0;
                    overflow: hidden;
                }
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #00bcd4, #1976d2);
                    transition: width 0.3s ease;
                }
                .step-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 5px;
                }
                .step-name {
                    font-weight: bold;
                }
                .step-status {
                    color: #78909c;
                }
                .resource-info {
                    display: grid; /* Changed from flex to grid */
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); /* Responsive columns */
                    gap: 10px; /* Space between items */
                    margin-top: 15px;
                    padding: 10px;
                    background-color: #2d2d2d;
                    border-radius: 4px;
                }
                .resource-item {
                    text-align: center;
                }
                .resource-label {
                    font-size: 12px;
                    color: #78909c;
                }
                .resource-value {
                    font-size: 14px;
                    font-weight: bold;
                    color: #4caf50;
                }
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
                .active .step-status {
                    color: #00bcd4;
                    animation: pulse 1.5s infinite;
                }
            </style>
        '''

    def _initialize_attributes(self):
        """Initialize tracking attributes"""
        self.steps = []
        self.current_step = None
        self.cpu_usage = 0
        self.memory_usage = 0
        self.network_sent = 0
        self.network_recv = 0
        self.current_sent = 0
        self.current_recv = 0

    def _initialize_steps(self):
        """Initialize processing steps"""
        self.add_step("🔍 Initialization", "Preparing for processing...")
        self.add_step("📂 File Scanning", "Waiting to scan files...")
        self.add_step("🖼️ Image Processing", "Ready to process images...")
        self.add_step("🎬 Video Creation", "Video creation pending...")

    def add_step(self, name, message=''):
        """Add a new processing step"""
        self.steps.append({
            'name': name,
            'status': 'pending',
            'progress': 0,
            'message': message
        })

    def update_step(self, name, progress, message='', status=None):
        """Update a step's progress and status"""
        for step in self.steps:
            if step['name'] == name:
                step['progress'] = progress
                step['message'] = message
                if status:
                    step['status'] = status
                break

    def render(self):
        """Render the current status as HTML"""
        html = [self.css]
        html.append('<div class="header">Satellite Image Processing Status</div>')

        for step in self.steps:
            status_class = ''
            if step['status'] == 'completed':
                status_class = 'completed'
            elif step['status'] == 'active':
                status_class = 'active'

            html.append(f'<div class="step {status_class}">')
            html.append('<div class="step-header">')
            html.append(f'<span class="step-name">{step["name"]}</span>')
            html.append(f'<span class="step-status">{step["status"].title()}</span>')
            html.append('</div>')

            if step['message']:
                html.append(f'<div class="step-message">{step["message"]}</div>')

            html.append('<div class="progress-bar">')
            html.append(f'<div class="progress-fill" style="width: {step["progress"]}%"></div>')
            html.append('</div>')
            html.append('</div>')

        # Updated Resource monitoring section with proper text alignment
        html.append('''
            <style>
                .resource-info {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    margin-top: 20px;
                    padding: 15px;
                    background-color: #2d2d2d;
                    border-radius: 6px;
                }
                .resource-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    padding: 10px;
                    border: 1px solid #444444;
                    border-radius: 4px;
                }
                .resource-label {
                    font-size: 14px;
                    color: #78909c;
                    margin-bottom: 5px;
                }
                .resource-value {
                    font-size: 16px;
                    font-weight: bold;
                    color: #4caf50;
                }
            </style>
        ''')

        html.append('<div class="resource-info">')
        # Existing resource items with proper alignment
        html.append('''
            <div class="resource-item">
                <div class="resource-label">CPU Usage</div>
                <div class="resource-value">{cpu_usage}%</div>
            </div>
            <div class="resource-item">
                <div class="resource-label">RAM Usage</div>
                <div class="resource-value">{memory_usage}%</div>
            </div>
            <div class="resource-item">
                <div class="resource-label">Network Upload</div>
                <div class="resource-value">{current_sent}/s<br>Total: {network_sent}</div>
            </div>
            <div class="resource-item">
                <div class="resource-label">Network Download</div>
                <div class="resource-value">{current_recv}/s<br>Total: {network_recv}</div>
            </div>
        '''.format(
            cpu_usage=self.cpu_usage,
            memory_usage=self.memory_usage,
            current_sent=self._format_bytes(self.current_sent),
            network_sent=self._format_bytes(self.network_sent),
            current_recv=self._format_bytes(self.current_recv),
            network_recv=self._format_bytes(self.network_recv)
        ))
        html.append('</div>')

        return ''.join(html)

    def _format_bytes(self, bytes):
        """Format bytes to human readable string"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes < 1024:
                return f"{bytes:.1f} {unit}"
            bytes /= 1024
        return f"{bytes:.1f} TB"

    def report_missing_preferences(self, missing: List[str]):
        """Emit a signal or handle missing preferences."""
        message = f"Missing required preferences: {', '.join(missing)}"
        self.error_occurred.emit(message)

    def update_status(self, message: str) -> None:
        """Update status with immediate UI refresh"""
        self.status_update.emit(message)
        QApplication.processEvents()  # Force UI update

    def update_progress(self, operation: str, progress: int) -> None:
        """Update progress with immediate UI refresh"""
        self.progress_update.emit(operation, progress)
        QApplication.processEvents()  # Force UI update

import json
from pathlib import Path
from typing import Dict, Any

class SettingsManager:
    """Manage application settings."""
    
    def __init__(self, settings_file: Path = Path("settings.json")):
        self.settings_file = settings_file
        self.settings: Dict[str, Any] = {}
        self.load_settings()
    
    def load_settings(self) -> Dict[str, Any]:
        """Load settings from a JSON file."""
        if self.settings_file.exists():
            with open(self.settings_file, 'r') as f:
                self.settings = json.load(f)
        else:
            self.settings = {}
        return self.settings
    
    def save_settings(self) -> None:
        """Save settings to a JSON file."""
        with open(self.settings_file, 'w') as f:
            json.dump(self.settings, f, indent=4)
    
    def get_setting(self, key: str, default=None):
        """Retrieve a setting value."""
        return self.settings.get(key, default)
    
    def set_setting(self, key: str, value: Any) -> None:
        """Set a setting value."""
        self.settings[key] = value
        self.save_settings()
    
    def load_preference(self, key: str, default=None):
        """Alias for get_setting."""
        return self.get_setting(key, default)
    
    def save_preference(self, key: str, value: Any) -> None:
        """Alias for set_setting."""
        self.set_setting(key, value)
        self.save_settings()