from PyQt6.QtCore import QObject, pyqtSignal

class StatusManager(QObject):
    """Manage and render the processing status display"""
    
    status_update = pyqtSignal(str)
    progress_update = pyqtSignal(str, int)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.steps = []
        self.current_step = None
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
        self.cpu_usage = 0
        self.memory_usage = 0
        self.network_sent = 0
        self.network_recv = 0
        self.current_sent = 0  # Added for current upload rate
        self.current_recv = 0  # Added for current download rate

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

import json
from pathlib import Path
import logging
from typing import Any, Dict, Optional, List

class SettingsManager:
    """Manages application settings with persistent storage"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.settings_file = Path.home() / '.satellite_processor' / 'settings.json'
        self.settings = self._load_settings()

    def _load_settings(self) -> Dict[str, Any]:
        """Load settings from file"""
        try:
            self.settings_file.parent.mkdir(parents=True, exist_ok=True)
            if self.settings_file.exists():
                with open(self.settings_file, 'r') as f:
                    return json.load(f)
        except Exception as e:
            self.logger.error(f"Failed to load settings: {e}")
        return {}

    def _save_settings(self) -> None:
        """Save settings to file"""
        try:
            self.settings_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.settings_file, 'w') as f:
                json.dump(self.settings, f, indent=4)
        except Exception as e:
            self.logger.error(f"Failed to save settings: {e}")

    def get(self, key: str, default: Any = None) -> Any:
        """Get a setting value"""
        return self.settings.get(key, default)

    def set(self, key: str, value: Any) -> None:
        """Set a setting value and save immediately"""
        self.settings[key] = value
        self._save_settings()

    def set_directories(self, input_dir: Optional[str], output_dir: Optional[str]) -> None:
        """Set and save both input and output directories"""
        if input_dir:
            self.settings['last_input_dir'] = str(input_dir)
        if output_dir:
            self.settings['last_output_dir'] = str(output_dir)
        self._save_settings()

    def get_directories(self) -> Dict[str, str]:
        """Get saved directory paths"""
        return {
            'input_dir': self.settings.get('last_input_dir', ''),
            'output_dir': self.settings.get('last_output_dir', '')
        }

    def clear(self) -> None:
        """Clear all settings"""
        self.settings = {}
        self._save_settings()