from typing import Optional
from PyQt6.QtWidgets import ( 
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QGridLayout,
    QLabel, QLineEdit, QPushButton, QGroupBox,
    QFileDialog, QMessageBox, QMenuBar, QMenu, QStatusBar, QProgressBar, QTextEdit,
    QApplication, QTextBrowser
)
from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QKeySequence, QShortcut, QTextCursor
from .widgets.processing_options import ProcessingOptionsWidget
from .widgets import VideoOptionsWidget, ProgressWidget
from .workers import ProcessingWorker, NetworkActivityMonitor, ResourceMonitor
from .dialogs import SettingsDialog, PresetDialog
from ..utils.settings import SettingsManager
from ..utils.presets import PresetManager
from pathlib import Path
from ..core.processor import SatelliteImageProcessor
import logging
from satellite_processor.utils.config import load_config, save_config
import time
import json
import re
import psutil

class StatusManager:
    """Manage and render the processing status display"""
    
    def __init__(self):
        self.steps = []
        self.current_step = None
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

    def add_step(self, name):
        """Add a new processing step"""
        self.steps.append({
            'name': name,
            'status': 'pending',
            'progress': 0,
            'message': ''
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

        # Resource monitoring section with horizontal layout
        html.append('''
            <style>
                .resource-info {
                    display: flex;
                    justify-content: space-between;
                    flex-wrap: nowrap;
                    margin-top: 15px;
                    padding: 10px;
                    background-color: #2d2d2d;
                    border-radius: 4px;
                }
                .resource-item {
                    flex: 1;
                    text-align: center;
                    padding: 0 10px;
                    border-right: 1px solid #444;
                }
                .resource-item:last-child {
                    border-right: none;
                }
                .resource-label {
                    font-size: 12px;
                    color: #78909c;
                    margin-bottom: 5px;
                }
                .resource-value {
                    font-size: 14px;
                    font-weight: bold;
                    color: #4caf50;
                }
            </style>
        ''')
        
        html.append('<div class="resource-info">')
        for resource in [
            ('CPU Usage', f'{self.cpu_usage}%'),
            ('RAM Usage', f'{self.memory_usage}%'),
            ('Network Upload', f'{self._format_bytes(self.current_sent)}/s'),
            ('Network Download', f'{self._format_bytes(self.current_recv)}/s')
        ]:
            html.append(f'''
                <div class="resource-item">
                    <div class="resource-label">{resource[0]}</div>
                    <div class="resource-value">{resource[1]}</div>
                </div>
            ''')
        html.append('</div>')

        return ''.join(html)

    def _format_bytes(self, bytes):
        """Format bytes to human readable string"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes < 1024:
                return f"{bytes:.1f} {unit}"
            bytes /= 1024
        return f"{bytes:.1f} TB"

class SatelliteProcessorGUI(QMainWindow):
    """Main window for the Satellite Image Processor application."""
    
    # Add a signal for thread-safe status updates
    status_update_signal = pyqtSignal(str)
    network_update_signal = pyqtSignal(dict)  # Added for network updates

    def __init__(self) -> None:
        """Initialize the main window and its components."""
        super().__init__()
        self.setWindowTitle("Satellite Image Processor")
        self.setMinimumWidth(1024)
        self.setMinimumHeight(900)  # Increased default height
        
        # Initialize attributes
        self.selected_files = []
        self.output_directory = ""
        self.input_entry = None  # Define UI elements as class attributes
        self.output_entry = None
        self.recent_files = []  # Initialize recent files list
        
        # Setup logger
        self.logger = logging.getLogger(__name__)
        
        try:
            self.settings_manager = SettingsManager()
            self.preset_manager = PresetManager()
        except Exception as e:
            QMessageBox.critical(self, "Initialization Error", f"Failed to initialize: {str(e)}")
            self.logger.critical(f"Failed to initialize SettingsManager or PresetManager: {str(e)}")
            raise
        
        # Initialize resource usage attributes
        self.cpu_usage = 0
        self.memory_usage = 0
        self.network_sent = 0
        self.network_recv = 0
        self.prev_sent = 0
        self.prev_recv = 0
        self.prev_time = time.time()
        
        # Initialize status manager with resource tracking
        self.status_manager = StatusManager()
        self.status_manager.cpu_usage = self.cpu_usage
        self.status_manager.memory_usage = self.memory_usage
        self.status_manager.network_sent = self.network_sent
        self.status_manager.network_recv = self.network_recv

        # Initialize UI
        self.init_ui()
        
        # Load config after UI is created
        config = load_config()
        if self.input_entry and self.output_entry:  # Safe check
            self.input_entry.setText(config['last_input'])
            self.output_entry.setText(config['last_output'])
            self.input_entry.editingFinished.connect(self.update_input_path)
            self.output_entry.editingFinished.connect(self.update_output_path)
        
        # Initialize Logger
        self.logger.setLevel(logging.DEBUG)  # Set desired logging level
        
        # Create console handler and set level to debug
        ch = logging.StreamHandler()
        ch.setLevel(logging.DEBUG)
        
        # Create formatter
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        ch.setFormatter(formatter)
        
        # Add handler to logger
        if not self.logger.handlers:
            self.logger.addHandler(ch)
        
        self.worker: Optional[ProcessingWorker] = None
        self.network_monitor: Optional[NetworkActivityMonitor] = None
        self.resource_monitor: Optional[ResourceMonitor] = None
        
        self.init_menu()
        
        # Add keyboard shortcuts
        self.create_shortcuts()
        
        # Add status bar
        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.status_bar_label = QLabel()
        self.status_bar.addWidget(self.status_bar_label)
        
        # Recent files list
        self.recent_files = []
        self.load_recent_files()
        
        # Initialize button and progress bars
        self.start_button = QPushButton("Start Processing")
        self.start_button.setStyleSheet("""
            QPushButton { 
                font-weight: bold; 
                padding: 10px; 
                background-color: #4CAF50; 
                color: white; 
            } 
        """)
        self.start_button.clicked.connect(self.start_processing)
        
        # Connect the status update signal to the update_status slot
        self.status_update_signal.connect(self.update_status)

        # Reintroduce the status timer
        self.status_timer = QTimer()
        self.status_timer.timeout.connect(self.request_status_update)
        self.status_timer.start(500)  # Refresh every 500 milliseconds

        # Initialize resource monitoring
        self.resource_timer = QTimer()
        self.resource_timer.timeout.connect(self.update_resource_usage)
        self.resource_timer.start(1000)  # Update every second

        # Connect the network update signal to the update_network_display slot
        self.network_update_signal.connect(self.update_network_display)

        self.processing_errors = False  # Initialize an error tracking flag

    def init_ui(self):
        """Initialize the main user interface"""
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # Create main layout
        main_layout = QVBoxLayout(central_widget)
        
        # Add I/O Group first
        io_group = QGroupBox("Input/Output")
        io_layout = QVBoxLayout()
        
        # Input row
        input_layout = QHBoxLayout()
        self.input_entry = QLineEdit()  # Initialize input entry
        input_label = QLabel("Input:")
        input_browse = QPushButton("Browse")
        input_browse.clicked.connect(self.browse_input)
        input_layout.addWidget(input_label)
        input_layout.addWidget(self.input_entry)
        input_layout.addWidget(input_browse)
        io_layout.addLayout(input_layout)
        
        # Output row
        output_layout = QHBoxLayout()
        self.output_entry = QLineEdit()  # Initialize output entry
        output_label = QLabel("Output:")
        output_browse = QPushButton("Browse")
        output_browse.clicked.connect(self.browse_output)
        output_layout.addWidget(output_label)
        output_layout.addWidget(self.output_entry)
        output_layout.addWidget(output_browse)
        io_layout.addLayout(output_layout)
        
        # Add tooltips to widgets
        self.input_entry.setToolTip("Select input directory containing satellite images")
        self.output_entry.setToolTip("Select output directory for processed files")
        
        # Enable drag & drop
        self.setAcceptDrops(True)
        
        io_group.setLayout(io_layout)
        main_layout.addWidget(io_group)
        
        # Rest of the UI initialization
        # Processing Options Layout
        options_layout = QHBoxLayout()
        
        # Processing Options
        self.processing_options = ProcessingOptionsWidget()
        options_layout.addWidget(self.processing_options)
        
        # Video Options
        self.video_options = VideoOptionsWidget()
        options_layout.addWidget(self.video_options)
        
        main_layout.addLayout(options_layout)
        
        # Rest of the UI setup remains the same...
        # Progress Section
        progress_layout = QVBoxLayout()
        
        # Overall Progress Bar with enhanced color
        self.overall_label = QLabel("Overall Progress:")
        self.overall_progress = QProgressBar()
        self.overall_progress.setStyleSheet("""
            QProgressBar {
                text-align: center;
                border: 1px solid #444;
                border-radius: 5px;
                background-color: #333;
            }
            QProgressBar::chunk {
                background-color: #76c7c0;
            }
        """)
        progress_layout.addWidget(self.overall_label)
        progress_layout.addWidget(self.overall_progress)
        
        # Current Operation Progress Bar with enhanced color
        self.current_op_label = QLabel("Current Operation:")
        self.current_op_progress = QProgressBar()
        self.current_op_progress.setStyleSheet("""
            QProgressBar {
                text-align: center;
                border: 1px solid #444;
                border-radius: 5px;
                background-color: #333;
            }
            QProgressBar::chunk {
                background-color: #f7a35c;
            }
        """)
        progress_layout.addWidget(self.current_op_label)
        progress_layout.addWidget(self.current_op_progress)
        
        main_layout.addLayout(progress_layout)
        
        # Status Text Area
        self.status_label = QTextBrowser()
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.status_label.setMinimumHeight(150)
        self.status_label.setStyleSheet("""
            QTextBrowser {
                background-color: #1E1E1E;
                color: #FFFFFF;
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 10pt;
                border: 1px solid #444444;
                border-radius: 4px;
                padding: 5px;
            }
        """)
        self.status_label.setOpenExternalLinks(True)
        self.status_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextBrowserInteraction)
        self.status_label.setAcceptRichText(True)
        main_layout.addWidget(self.status_label)
        
        # Control buttons
        buttons_layout = QHBoxLayout()
        
        self.start_button = QPushButton("Start Processing")
        self.start_button.setStyleSheet("""
            QPushButton { 
                font-weight: bold; 
                padding: 10px; 
                background-color: #4CAF50; 
                color: white; 
                border-radius: 4px;
            } 
            QPushButton:disabled { 
                background-color: #A5D6A7; 
            }
        """)
        self.start_button.clicked.connect(self.start_processing)
        buttons_layout.addWidget(self.start_button)

        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.setStyleSheet("""
            QPushButton { 
                font-weight: bold; 
                padding: 10px; 
                background-color: #F44336; 
                color: white; 
                border-radius: 4px;
            } 
            QPushButton:disabled { 
                background-color: #EF9A9A; 
            }
        """)
        self.cancel_button.clicked.connect(self.cancel_processing)
        self.cancel_button.setEnabled(False)
        buttons_layout.addWidget(self.cancel_button)
        
        main_layout.addLayout(buttons_layout)

        # Initialize status manager
        self.status_manager = StatusManager()
        self.status_manager.add_step("Initialization")
        self.status_manager.add_step("File Processing")
        self.status_manager.add_step("Image Processing")
        self.status_manager.add_step("Video Creation")

        # Update status display with initial state
        self.update_status("Ready to process")

    def init_menu(self):
        """Initialize the application menu bar"""
        menubar = QMenuBar()
        self.setMenuBar(menubar)
        
        # File menu
        file_menu = menubar.addMenu("File")
        
        settings_action = file_menu.addAction("Settings")
        settings_action.triggered.connect(self.show_settings)
        
        presets_action = file_menu.addAction("Presets")
        presets_action.triggered.connect(self.show_presets)
        
        file_menu.addSeparator()
        exit_action = file_menu.addAction("Exit")
        exit_action.triggered.connect(self.close)
        
        # Recent files submenu
        self.recent_menu = file_menu.addMenu("Recent Files")
        self.update_recent_files_menu()
        
        # Help menu
        help_menu = menubar.addMenu("Help")
        about_action = help_menu.addAction("About")
        about_action.triggered.connect(self.show_about)
        
    def select_input_directory(self) -> None:
        """Select input directory"""
        dir_path = QFileDialog.getExistingDirectory(self, "Select Input Directory")
        if (dir_path):
            self.input_dir_text.setText(dir_path)
            self.selected_files = list(Path(dir_path).glob('*.jpg'))  # Update selected_files
            self.logger.info(f"Selected input directory: {dir_path}")
    
    def select_output_directory(self) -> None:
        """Select output directory"""
        dir_path = QFileDialog.getExistingDirectory(self, "Select Output Directory")
        if dir_path:
            self.output_dir_text.setText(dir_path)
            self.output_directory = dir_path
            self.logger.info(f"Selected output directory: {dir_path}")

    def select_input_files(self):
        """Open dialog for selecting input directory"""
        directory = QFileDialog.getExistingDirectory(
            self,
            "Select Input Directory",
            "",
            QFileDialog.Option.ShowDirsOnly
        )
        if directory:
            # Get all valid image files from directory
            valid_extensions = ('.jpg', '.jpeg', '.png', '.tif', '.tiff')
            self.selected_files = [
                str(f) for f in Path(directory).glob('**/*') 
                if f.suffix.lower() in valid_extensions
            ]
            
            if not self.selected_files:
                QMessageBox.warning(
                    self,
                    "No Images Found",
                    f"No valid image files found in {directory}"
                )
                return
                
            # Update input text field with directory path
            self.input_text.setText(directory)

    def browse_input(self):
        """Select input directory"""
        dir_path = QFileDialog.getExistingDirectory(
            self, 
            "Select Input Directory",
            "",
            QFileDialog.Option.ShowDirsOnly
        )
        if dir_path:
            self.selected_files = list(Path(dir_path).glob('*.jpg'))
            self.input_entry.setText(dir_path)
            self.logger.info(f"Selected input directory: {dir_path}")
            save_config(self.input_entry.text(), self.output_entry.text())

    def browse_output(self):
        """Select output directory"""
        directory = QFileDialog.getExistingDirectory(
            self,
            "Select Output Directory",
            "",
            QFileDialog.Option.ShowDirsOnly
        )
        if directory:
            self.output_directory = directory
            self.output_entry.setText(directory)  # Fixed: using correct attribute name
            self.logger.info(f"Selected output directory: {directory}")
            save_config(self.input_entry.text(), self.output_entry.text())

    def show_settings(self):
        """Show the settings dialog"""
        dialog = SettingsDialog(self)
        dialog.exec()
        
    def show_presets(self):
        """Show the presets dialog"""
        current_params = {
            'crop_enabled': self.processing_options.crop_checkbox.isChecked(),
            'crop_x': self.processing_options.crop_x.value(),
            'crop_y': self.processing_options.crop_y.value(),
            'crop_width': self.processing_options.crop_width.value(),
            'crop_height': self.processing_options.crop_height.value(),
            'false_color': self.processing_options.false_color_check.isChecked(),
            'upscale_enabled': self.processing_options.upscale_check.isChecked(),
            'upscale_type': self.processing_options.upscale_method.currentText(),
            'scale_factor': self.processing_options.scale_factor.value(),
            'target_width': self.processing_options.target_width.value(),
            'encoder': self.video_options.encoder.currentText(),
            'fps': self.video_options.fps.value(),
            'interpolation': self.processing_options.interpolation.isChecked()
        }
        dialog = PresetDialog(current_params, self)
        dialog.exec()
        
    def show_about(self):
        """Show the about dialog"""
        QMessageBox.about(
            self,
            "About Satellite Image Processor",
            "Satellite Image Processor v1.0\n\n"
            "A tool for processing GOES satellite imagery.\n\n"
            "Features:\n"
            "- Image cropping\n"
            "- False color application\n"
            "- Image upscaling\n"
            "- Video creation"
        )

    def start_processing(self):
        """Handle start/cancel button click"""
        try:
            self.processing_errors = False  # Reset error flag at start
            if self.start_button.text() == "Start Processing":
                # Get processing parameters from UI
                processor_params = self.get_processor_options()
                
                input_dir = self.input_entry.text().strip()
                output_dir = self.output_entry.text().strip()
                
                # Validate input and output directories
                if not input_dir or not output_dir:
                    QMessageBox.critical(self, "Error", "Input and Output directories must be selected.")
                    return
                if not Path(input_dir).exists():
                    QMessageBox.critical(self, "Error", f"Input directory does not exist: {input_dir}")
                    return
                if not Path(output_dir).exists():
                    QMessageBox.critical(self, "Error", f"Output directory does not exist: {output_dir}")
                    return

                # Update processor parameters with validated paths
                processor_params.update({
                    'input_dir': input_dir,
                    'output_dir': output_dir
                })
                
                # Initialize processor with updated parameters
                processor = SatelliteImageProcessor(processor_params)
                self.worker = ProcessingWorker(processor, processor_params)
                
                # Connect signals
                self.worker.progress_update.connect(self.update_progress)
                self.worker.status_update.connect(self.update_status)
                self.worker.error_signal.connect(self.handle_error)
                self.worker.finished.connect(self.processing_finished)
                self.worker.start()
                
                # Update UI elements
                self.start_button.setText("Processing...")
                self.start_button.setEnabled(False)
                self.cancel_button.setEnabled(True)

        except Exception as e:
            self.logger.error(f"Processing error: {str(e)}", exc_info=True)
            self.processing_errors = True
            QMessageBox.critical(self, "Error", f"Processing error: {str(e)}")
            self.reset_buttons()

    def handle_error(self, error_message: str):
        """Handle errors emitted from the worker."""
        self.logger.error(error_message)
        QMessageBox.critical(self, "Processing Error", error_message)
        self.processing_errors = True
        self.reset_buttons()

    def processing_finished(self):
        """Handle processing completion"""
        if not self.processing_errors:
            self.status_manager.update_step("Video Creation", 100, "Complete", "completed")
            self.update_status("Processing completed successfully!")
            self.show_message("Success", "Processing completed successfully!")
        else:
            self.update_status("Processing completed with errors.")
            self.show_message("Completed with Errors", "Processing completed, but some errors occurred.")
        self.reset_buttons()

    def cancel_processing(self):
        """Handle cancel button click"""
        if self.worker and self.worker.isRunning():
            self.worker.stop()
            self.cancelled = True
            self.logger.info("Processing cancelled by user")
            self.reset_buttons()

    def reset_buttons(self):
        """Reset buttons to initial state"""
        self.start_button.setText("Start Processing")
        self.start_button.setEnabled(True)
        self.cancel_button.setEnabled(False)
        self.start_button.setStyleSheet("""
            QPushButton { 
                font-weight: bold; 
                padding: 10px; 
                background-color: #4CAF50; 
                color: white; 
            }
        """)

    def closeEvent(self, event) -> None:
        """Clean up resources when window is closed."""
        try:
            # Stop any running processes
            if self.worker and self.worker.isRunning():
                self.worker.stop()
                self.worker.wait()  # Wait for thread to finish

            if self.network_monitor:
                self.network_monitor.stop()
                self.network_monitor.wait()

            if self.resource_monitor:
                self.resource_monitor.stop()
                self.resource_monitor.wait()
            
            # Save session state
            settings = {
                'window_size': [self.size().width(), self.size().height()],
                'window_pos': [self.pos().x(), self.pos().y()],
                'recent_files': self.recent_files,
                'last_input': self.input_entry.text(),
                'last_output': self.output_entry.text()
            }
            
            with open('session.json', 'w') as f:
                json.dump(settings, f)
                
        except Exception as e:
            self.logger.error(f"Failed to cleanup: {e}")
        finally:
            event.accept()

    def process_files(self):
        """Process the selected files"""
        try:
            input_path = self.input_entry.text()
            output_path = self.output_entry.text()
            
            if not input_path or not output_path:
                error_message = "Input and Output directories are required."
                self.handle_error(error_message)
                return

            # Create processing parameters dictionary with correct attribute references
            processing_params = {
                'input_dir': input_path,
                'output_dir': output_path,
                'crop_enabled': False,                
                'crop_x': 0,
                'crop_y': 0,
                'crop_width': 1920,
                'crop_height': 1080,
                'false_color': False,
                'upscale_enabled': False,
                'upscale_type': 'Lanczos',
                'scale_factor': 2,
                'target_width': 1920,
                'fps': self.video_options.fps.value(),
                'encoder': self.video_options.encoder.currentText()
            }

            # Initialize processor
            processor = SatelliteImageProcessor(self.get_processor_options())

            # Initialize processor and worker
            self.worker = ProcessingWorker(processor, processing_params)
            self.worker.progress_update.connect(self.update_progress)
            self.worker.status_update.connect(self.update_status)
            self.worker.finished.connect(self.processing_finished)
            self.worker.start()
        
        except Exception as e:
            self.logger.error(f"Processing error: {str(e)}")
            QMessageBox.critical(self, "Error", f"Processing error: {str(e)}")

    def update_progress(self, operation: str, progress: int) -> None:
        """Update the current operation progress"""
        self.current_op_label.setText(f"Current Operation: {operation}")
        self.current_op_progress.setValue(progress)
        QApplication.processEvents()

        if operation == "Scanning Files":
            self.status_manager.update_step("Initialization", progress, "Scanning input files", "active")
        elif operation == "Processing Images":
            self.status_manager.update_step("File Processing", 100, "Complete", "completed")
            self.status_manager.update_step("Image Processing", progress, f"Processing image {progress}%", "active")
        elif operation == "Creating Video":
            self.status_manager.update_step("Image Processing", 100, "Complete", "completed")
            self.status_manager.update_step("Video Creation", progress, f"Creating video {progress}%", "active")
            
        self.update_status("")  # Trigger status update

    def request_status_update(self):
        """Request status update from the processing worker."""
        if self.worker and self.worker.isRunning():
            status_text = self.worker.get_status_text()
            if status_text:
                self.update_status(status_text)

    def update_status(self, message: str) -> None:
        """Update status display with HTML content"""
        # Update the status manager with resource usage
        self.status_manager.cpu_usage = self.cpu_usage
        self.status_manager.memory_usage = self.memory_usage
        self.status_manager.network_sent = self.network_sent
        self.status_manager.network_recv = self.network_recv
        
        # Update status label with rendered HTML
        self.status_label.setHtml(self.status_manager.render())
        self.logger.info(message)  # Log the status message

    def _format_bytes(self, bytes):
        """Format bytes to human readable string"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes < 1024:
                return f"{bytes:.1f} {unit}"
            bytes /= 1024
        return f"{bytes:.1f} TB"

    def update_resources(self, stats):
        """Update resource display with rate calculation and network bars"""
        # Update CPU and RAM
        cpu_val = int(stats['cpu'])
        ram_val = int(stats['ram'])
        self.cpu_value.setText(f"{cpu_val}%")
        self.ram_value.setText(f"{ram_val}%")
        self.cpu_bar.setValue(cpu_val)
        self.ram_bar.setValue(ram_val)
        
        # Calculate network rates
        current_time = time.time()
        time_diff = current_time - self.prev_time
        
        sent_rate = (stats['network_sent'] - self.prev_sent) / time_diff
        recv_rate = (stats['network_recv'] - self.prev_recv) / time_diff
        
        # Update network bars (scale to reasonable ranges)
        MAX_RATE = 100 * 1024 * 1024  # 100 MB/s as max
        upload_percent = min(100, (sent_rate / MAX_RATE) * 100)
        download_percent = min(100, (recv_rate / MAX_RATE) * 100)
        
        self.upload_bar.setValue(int(upload_percent))
        self.download_bar.setValue(int(download_percent))
        
        # Update labels with speeds
        self.upload_label.setText(f"Upload: {self._format_bytes(sent_rate)}/s")
        self.download_label.setText(f"Download: {self._format_bytes(recv_rate)}/s")
        
        # Update previous values
        self.prev_sent = stats['network_sent']
        self.prev_recv = stats['network_recv']
        self.prev_time = current_time

    def create_shortcuts(self):
        """Create keyboard shortcuts"""
        shortcuts = {
            'Ctrl+O': (self.browse_input, "Open Input"),
            'Ctrl+S': (self.browse_output, "Select Output"),
            'Ctrl+P': (self.start_processing, "Start Processing"),
            'Ctrl+Q': (self.close, "Quit"),
        }
        
        for key, (func, tooltip) in shortcuts.items():
            shortcut = QShortcut(QKeySequence(key), self)
            shortcut.activated.connect(func)
            
        # Update tooltips
        if hasattr(self, 'browse_input_btn'):
            self.browse_input_btn.setToolTip(f"Browse Input (Ctrl+O)")
        if hasattr(self, 'browse_output_btn'):
            self.browse_output_btn.setToolTip(f"Browse Output (Ctrl+S)")
        if hasattr(self, 'start_button'):  # Updated from process_btn
            self.start_button.setToolTip(f"Start Processing (Ctrl+P)")

    def dragEnterEvent(self, event):
        """Handle drag enter events"""
        if event.mimeData().hasUrls():
            event.accept()
        else:
            event.ignore()

    def dropEvent(self, event):
        """Handle drop events"""
        files = [url.toLocalFile() for url in event.mimeData().urls()]
        if files:
            self.input_entry.setText(str(Path(files[0]).parent))
            self.add_recent_file(files[0])

    def add_recent_file(self, filepath):
        """Add file to recent files list"""
        if filepath not in self.recent_files:
            self.recent_files.insert(0, filepath)
            self.recent_files = self.recent_files[:10]  # Keep last 10
            self.save_recent_files()
            self.update_recent_files_menu()

    def update_recent_files_menu(self):
        """Update recent files menu"""
        self.recent_menu.clear()
        for filepath in self.recent_files:
            action = self.recent_menu.addAction(str(Path(filepath).name))
            action.setData(filepath)
            action.triggered.connect(lambda x, f=filepath: self.load_recent_file(f))

    def load_recent_file(self, filepath):
        """Load recent file"""
        if Path(filepath).exists():
            self.input_entry.setText(str(Path(filepath).parent))
        else:
            self.recent_files.remove(filepath)
            self.save_recent_files()
            self.update_recent_files_menu()

    def load_recent_files(self):
        """Load recent files from disk"""
        try:
            with open('recent_files.json', 'r') as f:
                self.recent_files = json.load(f)
        except FileNotFoundError:
            self.recent_files = []
        except Exception as e:
            self.logger.error(f"Failed to load recent files: {e}")

    def save_recent_files(self):
        """Save recent files to disk"""
        try:
            with open('recent_files.json', 'w') as f:
                json.dump(self.recent_files, f)
        except Exception as e:
            self.logger.error(f"Failed to save recent files: {e}")

    def update_overall_progress(self, progress: int) -> None:
        """Update the overall progress"""
        self.overall_progress.setValue(progress)
        QApplication.processEvents()

    def process_images(self):
        """Handle image processing"""
        try:
            # Reset progress bars
            self.current_op_progress.setValue(0)
            self.overall_progress.setValue(0)
            
            # Initialize processor
            processor = SatelliteImageProcessor(self.get_processor_options())
            
            # Connect progress callbacks
            processor.on_progress = self.update_progress
            processor.on_overall_progress = self.update_overall_progress
            
            # Run processing
            success = processor.process()
            
            if success:
                self.show_message("Success", "Processing completed successfully!")
            else:
                self.show_message("Error", "Processing failed. Check logs for details.")
                
        except Exception as e:
            self.show_message("Error", f"Processing failed: {str(e)}")
            logging.exception("Processing failed")
        finally:
            # Reset progress bars when done
            self.current_op_progress.setValue(0)
            self.overall_progress.setValue(0)

    def get_processor_options(self) -> dict:
        """Get all processing options from UI widgets"""
        if not self.input_entry or not self.output_entry:
            QMessageBox.critical(self, "Error", "Input and Output directories must be set.")
            return {}
        
        return {
            'crop_enabled': self.processing_options.crop_checkbox.isChecked(),
            'crop_x': self.processing_options.crop_x.value(),
            'crop_y': self.processing_options.crop_y.value(),
            'crop_width': self.processing_options.crop_width.value(),
            'crop_height': self.processing_options.crop_height.value(),
            'false_color': self.processing_options.false_color_check.isChecked(),
            'upscale_enabled': self.processing_options.upscale_check.isChecked(),
            'upscale_type': self.processing_options.upscale_method.currentText(),
            'scale_factor': self.processing_options.scale_factor.value(),
            'target_width': self.processing_options.target_width.value(),
            'interpolation': self.processing_options.interpolation.isChecked(),
            'fps': self.video_options.fps.value(),
            'encoder': self.video_options.encoder.currentText(),
            'input_dir': self.input_entry.text(),
            'output_dir': self.output_entry.text()
        }

    def show_message(self, title: str, message: str) -> None:
        """Show a message dialog"""
        QMessageBox.information(self, title, message)

    def update_resources(self, stats):
        """Update resource display with rate calculation and network bars"""
        # Update CPU and RAM
        cpu_val = int(stats['cpu'])
        ram_val = int(stats['ram'])
        self.cpu_value.setText(f"{cpu_val}%")
        self.ram_value.setText(f"{ram_val}%")
        self.cpu_bar.setValue(cpu_val)
        self.ram_bar.setValue(ram_val)
        
        # Calculate network rates
        current_time = time.time()
        time_diff = current_time - self.prev_time
        
        sent_rate = (stats['network_sent'] - self.prev_sent) / time_diff
        recv_rate = (stats['network_recv'] - self.prev_recv) / time_diff
        
        # Update network bars (scale to reasonable ranges)
        MAX_RATE = 100 * 1024 * 1024  # 100 MB/s as max
        upload_percent = min(100, (sent_rate / MAX_RATE) * 100)
        download_percent = min(100, (recv_rate / MAX_RATE) * 100)
        
        self.upload_bar.setValue(int(upload_percent))
        self.download_bar.setValue(int(download_percent))
        
        # Update labels with speeds
        self.upload_value.setText(f"{self._format_bytes(sent_rate)}/s")
        self.download_value.setText(f"{self._format_bytes(recv_rate)}/s")
        
        # Update previous values
        self.prev_sent = stats['network_sent']
        self.prev_recv = stats['network_recv']
        self.prev_time = current_time

    def update_input_path(self):
        """Save the updated input path to the configuration."""
        save_config(self.input_entry.text(), self.output_entry.text())

    def update_output_path(self):
        """Save the updated output path to the configuration."""
        save_config(self.input_entry.text(), self.output_entry.text())

    def update_resource_usage(self):
        """Update CPU, memory, and network usage stats."""
        try:
            # Update CPU and memory
            self.cpu_usage = psutil.cpu_percent()
            self.memory_usage = psutil.virtual_memory().percent
            
            # Update network stats
            net_io = psutil.net_io_counters()
            current_time = time.time()
            time_diff = current_time - self.prev_time if self.prev_time else 1
            self.current_sent = (net_io.bytes_sent - self.prev_sent) / time_diff
            self.current_recv = (net_io.bytes_recv - self.prev_recv) / time_diff
            self.network_sent = net_io.bytes_sent
            self.network_recv = net_io.bytes_recv
            
            # Update previous values
            self.prev_sent = net_io.bytes_sent
            self.prev_recv = net_io.bytes_recv
            self.prev_time = current_time
            
            # Emit network update signal
            self.network_update_signal.emit({
                'cpu': self.cpu_usage,
                'ram': self.memory_usage,
                'network_sent': self.network_sent,
                'network_recv': self.network_recv,
                'current_sent': self.current_sent,
                'current_recv': self.current_recv
            })
            
        except Exception as e:
            self.logger.error(f"Failed to update resource usage: {e}")

    def update_network_display(self, stats: dict):
        """Update the network display with current and total data."""
        try:
            # Update CPU and Memory in StatusManager
            self.status_manager.cpu_usage = stats['cpu']
            self.status_manager.memory_usage = stats['ram']
            self.status_manager.network_sent = stats['network_sent']
            self.status_manager.network_recv = stats['network_recv']
            self.status_manager.current_sent = stats['current_sent']
            self.status_manager.current_recv = stats['current_recv']
            
            # Update status display
            self.update_status("")
        except Exception as e:
            self.logger.error(f"Failed to update network display: {e}")

    def _format_bytes(self, bytes):
        """Format bytes to human readable string"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes < 1024:
                return f"{bytes:.1f} {unit}"
            bytes /= 1024
        return f"{bytes:.1f} TB"