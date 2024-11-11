"""
Main window for the Satellite Image Processor application.
Manages the overall GUI layout, processing controls, and coordination between components.
Handles user interactions, file selection, and processing initialization.
"""

from typing import Optional
from pathlib import Path
import time
import logging
from PyQt6.QtCore import pyqtSignal, Qt, QThread
from PyQt6.QtGui import QShortcut, QKeySequence
from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
    QMessageBox, QApplication, QPushButton, QSplitter, QSizePolicy, QLabel, 
    QGroupBox, QGridLayout, QCheckBox, QSpinBox, QFileDialog, QDialog, 
    QDoubleSpinBox, QFormLayout
)
from .managers.status_manager import StatusManager
from .widgets.processing_options import ProcessingOptionsWidget
from .widgets import (
    GraphingWidget,
    ProgressWidget, 
    SystemMonitorWidget,  # Renamed from ResourceMonitorWidget
    NetworkWidget, 
    LogWidget
)
from ..core.resource_monitor import ResourceMonitor
from ..core.processor import SatelliteImageProcessor as ProcessingWorker  # Single import for ProcessingWorker
from .managers.processing_manager import ProcessingManager
from ..utils.helpers import parse_satellite_timestamp
from ..utils.utils import (
    load_config, save_config,
    is_closing, calculate_uits, validate_uits
)
from ..utils.presets import PresetManager
from .dialogs import SettingsDialog  # Add this import
import time
from datetime import datetime
from pathlib import Path
import tempfile
import shutil

def setup_logging():
    """Configure logging for the entire application"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler()
        ]
    )

class SatelliteProcessorGUI(QMainWindow):
    """Main window for the Satellite Image Processor application."""
    
    # Define class-level signals
    status_update_signal = pyqtSignal(str)  # Rename to avoid confusion
    progress_update_signal = pyqtSignal(str, int)
    network_update_signal = pyqtSignal(dict)

    def __init__(self, parent=None, debug_mode=False) -> None:
        super().__init__(parent)  # Make sure to call parent's init first
        self.debug_mode = debug_mode
        if debug_mode:
            self.logger = logging.getLogger(__name__)
            self.logger.setLevel(logging.DEBUG)
            self.logger.debug("Debug mode enabled")
        setup_logging()
        
        # Initialize settings first
        self.settings = load_config()
        if not self.settings:
            self.settings = {
                'last_input_dir': '',
                'last_output_dir': '',
                'window_size': (1600, 900),
                'window_pos': (100, 100),
                'processing_options': {
                    'fps': 30,
                    'codec': 'H.264',
                    'frame_duration': 1.0,
                    'crop_enabled': False,
                    'scale_enabled': False,
                    'add_timestamp': True
                }
            }
            save_config(self.settings)
            
        # Initialize basic attributes
        self.worker = None
        self._is_closing = False
        self.setWindowTitle("Satellite Image Processor")
        self.setMinimumSize(1600, 900)
        
        # Initialize managers and components in correct order
        self.logger = logging.getLogger(__name__)
        self.status_manager = StatusManager(self)
        self.processing_manager = ProcessingManager(self)
        self.preset_manager = PresetManager()
        
        # Initialize resource monitor first
        self._initialize_resource_monitor()
        
        # Initialize UI components
        self.init_ui()
        self.logger.info("Application initialized")
        
        # Load settings before connecting signals
        self.load_settings()
        
        # Connect signals last
        self.connect_signals()

        self.temp_base_dir = Path(tempfile.gettempdir()) / "satellite_processor"
        self.temp_base_dir.mkdir(exist_ok=True)

    def init_ui(self):
        """Initialize the main user interface"""
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        
        # Create horizontal layout for panels
        panels_layout = QHBoxLayout()
        
        # Create and add left panel
        left_panel = self._create_left_panel()
        panels_layout.addWidget(left_panel)
        
        # Create and add right panel
        right_panel = self._create_right_panel()
        panels_layout.addWidget(right_panel)
        
        # Add panels to main layout
        main_layout.addLayout(panels_layout)
        
        # Add button layout at the bottom
        button_layout = self._create_button_layout()
        main_layout.addLayout(button_layout)

        # Add menu for settings
        menubar = self.menuBar()
        settings_menu = menubar.addMenu("Settings")
        configure_action = settings_menu.addAction("Configure")
        configure_action.triggered.connect(self.open_settings_dialog)

        # Modify the graphing widget to include only the existing graph and network activity
        self.graphing_widget = GraphingWidget(self)
        main_layout.addWidget(self.graphing_widget)
        
        # Ensure the graph updates dynamically
        self.graphing_widget.start_graph_update()

        # Create status labels
        self._create_status_labels()

    def _create_button_layout(self):
        """Create the bottom button layout"""
        button_layout = QHBoxLayout()
        
        # Create start button
        self.start_button = QPushButton("Start Processing")
        self.start_button.clicked.connect(self.start_processing)
        self.start_button.setStyleSheet("""
            QPushButton {
                background-color: #2ecc71;
                color: white;
                padding: 8px 16px;
                border-radius: 4px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #27ae60;
            }
        """)
        
        # Create cancel button
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.clicked.connect(self.cancel_processing)
        self.cancel_button.setEnabled(False)
        self.cancel_button.setStyleSheet("""
            QPushButton {
                background-color: #e74c3c;
                color: white;
                padding: 8px 16px;
                border-radius: 4px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #c0392b;
            }
            QPushButton:disabled {
                background-color: #bdc3c7;
            }
        """)
        
        button_layout.addWidget(self.start_button)
        button_layout.addWidget(self.cancel_button)
        
        return button_layout

    def _create_left_panel(self) -> QWidget:
        """Create the left panel containing processing controls"""
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setSpacing(20)  # Add more spacing between sections
        layout.setContentsMargins(10, 10, 10, 10)  # Add margins around the panel
        
        # Remove duplicate ProcessingOptionsWidget initialization
        # Only create it once and store as instance variable
        self.processing_widget = ProcessingOptionsWidget(self)
        
        # Remove any duplicate crop controls from main window
        # They should only exist in ProcessingOptionsWidget
        
        layout.addWidget(self.processing_widget)
        
        # Set size policies
        container.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Preferred)
        
        return container

    def _create_right_panel(self) -> QWidget:
        """Create the right panel with consolidated output"""
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setSpacing(10)
        layout.setContentsMargins(10, 10, 10, 10)
        
        # Create log widget with proper initialization
        self.log_widget = LogWidget(self)
        self.log_widget.setMinimumHeight(200)
        # Add initial text to verify it's working
        self.log_widget.append_message("Application started")
        self.log_widget.append_message("Ready for processing...")
        
        # Create progress widget
        self.progress_widget = ProgressWidget(self)
        
        # Add widgets to layout
        layout.addWidget(self.log_widget)
        layout.addWidget(self.progress_widget)
        
        return container

    def connect_signals(self):
        """Connect all signals to their slots"""
        try:
            # Reduce initial messages
            self.status_manager.status_update.connect(self.on_status_update)
            self.status_manager.progress_update.connect(self.on_progress_update)
            self.status_manager.error_occurred.connect(self.log_widget.append_error)
            
            # Processing manager connections
            self.processing_manager.status_update.connect(self.on_status_update)
            self.processing_manager.finished.connect(lambda: self.log_widget.append_message("Processing completed"))

            # Resource monitor
            if hasattr(self, 'resource_monitor'):
                self.resource_monitor.resource_update.connect(self.update_resource_display)
                self.resource_monitor.start()
                
        except Exception as e:
            self.log_widget.append_error(f"Error connecting signals: {str(e)}")

    def on_resource_update(self, stats):
        """Handle resource monitoring updates"""
        # Format stats for the GUI components
        self.status_widget.update_resource_stats(stats)
        self.graphing_widget.update_resource_graph(stats)

    # Add essential callback methods
    def on_network_update(self, stats):
        """Handle network statistics updates"""
        self.network_update_signal.emit(stats)

    def on_status_update(self, message):
        """Handle status updates with timestamps and clickable links"""
        if message.startswith('\r'):  # Progress bar update
            self.log_widget.append_message(message, replace_last=True)
        elif "<click>" in message:  # Clickable link
            path = message.split("file://")[1].split("</click>")[0]
            self.log_widget.append_clickable_path(message)  # Remove path parameter
        else:
            # Add timestamp only once
            timestamp = datetime.now().strftime("%H:%M:%S")
            formatted_message = f"[{timestamp}] {message}"
            self.log_widget.append_message(formatted_message)

    def on_log_received(self, message):
        """Handle log messages based on severity"""
        if "error" in message.lower():
            self.logger.error(message)
            self.log_widget.append_error(message)
        elif "warning" in message.lower():
            self.logger.warning(message)
            self.log_widget.append_warning(message)
        else:
            # Only log info messages in debug mode
            if logging.getLogger().getEffectiveLevel() <= logging.DEBUG:
                self.logger.info(message)
                # Add timestamp for info messages
                timestamp = datetime.now().strftime("%H:%M:%S")
                formatted_message = f"[{timestamp}] {message}"
                self.log_widget.append_message(formatted_message)

    def on_progress_update(self, operation: str, progress: int):
        """Handle progress updates from the processor."""
        self.progress_widget.update_progress(operation, progress)

    def on_error_occurred(self, error_message: str):
        """Route errors to consolidated log"""
        self.log_widget.append_error(error_message)
        self.start_button.setEnabled(True)
        self.cancel_button.setEnabled(False)

    def display_error(self, message):
        """Handle error messages"""
        self.logger.error(message)
        self.log_widget.append_error(message)
        
        # Show error dialog only for critical errors
        if "required preferences" in message.lower() or "failed to" in message.lower():
            QMessageBox.critical(self, "Error", message)

    def show_message(self, title: str, message: str, error: bool = False):
        """Show message with logging to text window"""
        if error:
            QMessageBox.critical(self, title, message)
            self.log_widget.append_error(message)
        else:
            QMessageBox.information(self, title, message)
            self.log_widget.append_message(message)

    def closeEvent(self, event) -> None:
        """Handle application closing"""
        try:
            self._is_closing = True
            
            # Save settings before closing
            save_config({
                'window_size': (self.width(), self.height()),
                'window_pos': (self.x(), self.y()),
                'processing_options': self.processing_widget.get_options(),
                'last_input_dir': self.processing_widget.get_input_directory(),
                'last_output_dir': self.processing_widget.get_output_directory()
            })

            # Resource monitor cleanup
            if hasattr(self, 'resource_monitor'):
                self.resource_monitor.stop()

            # Cancel any running processes
            if hasattr(self, 'worker') and self.worker:
                self.worker.stop()
                self.worker.wait()

            event.accept()
        except Exception as e:
            self.logger.error(f"Error during close: {e}")
            event.accept()

    def create_shortcuts(self):
        """Create keyboard shortcuts for common actions"""
        # Save shortcut
        save_shortcut = QShortcut(QKeySequence.StandardKey.Save, self)
        save_shortcut.activated.connect(self.save_project)
        
        # Open shortcut
        open_shortcut = QShortcut(QKeySequence.StandardKey.Open, self)
        open_shortcut.activated.connect(self.open_project)
        
        # New project shortcut
        new_shortcut = QShortcut(QKeySequence.StandardKey.New, self)
        new_shortcut.activated.connect(self.new_project)
        
        # Settings shortcut
        settings_shortcut = QShortcut(QKeySequence("Ctrl+,"), self)
        settings_shortcut.activated.connect(self.show_settings)

    def save_project(self):
        """Save current project"""
        # Implement saving logic here
        pass  # Replace with actual implementation

    def open_project(self):
        """Open existing project"""
        # Implement opening logic here
        pass  # Replace with actual implementation

    def new_project(self):
        """Create new project"""
        # Implement new project logic here
        pass  # Replace with actual implementation

    def show_settings(self):
        """Show settings dialog"""
        try:
            dialog = SettingsDialog(self)  # Pass self as parent only
            if dialog.exec():
                self.load_settings()
        except Exception as e:
            self.logger.error(f"Failed to open settings dialog: {e}")

    def on_processing_finished(self):
        """Handle actions after processing is finished"""
        self.start_button.setEnabled(True)
        self.cancel_button.setEnabled(False)
        # Remove duplicate message since it comes from processor
        # self.log_widget.append_message("Processing completed successfully!")  # Single message
        QMessageBox.information(self, "Success", "Processing completed successfully!")

    def load_settings(self):
        """Load application settings"""
        try:
            settings = load_config()
            
            # Apply settings with defaults
            if 'window_size' in settings:
                self.resize(*settings['window_size'])
            else:
                self.resize(1600, 900)
                
            if 'window_pos' in settings:
                self.move(*settings['window_pos'])
            
            # Initialize processing options if not present
            if 'processing_options' not in settings:
                settings['processing_options'] = {}
                save_config(settings)
                
            self.processing_widget.load_options(settings.get('processing_options', {}))
            self.logger.info("Settings loaded successfully")
            
        except Exception as e:
            self.logger.error(f"Error loading settings: {e}")

    def update_progress(self, operation: str, progress: int) -> None:
        """Update progress with enhanced visual feedback"""
        self.current_op_label.setText(f"Current Operation: {operation}")
        self.current_op_progress.setValue(progress)

        # Update status only once
        self.status_manager.update_step("🔍 Initialization", progress, "Scanning input files...", "active")
        self.status_manager.update_step("📂 File Scanning", 100, "Scan complete ✓", "completed")
        self.status_manager.update_step("🖼️ Image Processing", 100, "Processing complete ✓", "completed")
        self.status_manager.update_step("🎬 Video Creation", progress, f"Creating video ({progress}%)...", "active")

        # Update UI
        QApplication.processEvents()
        self.graphing_widget.update_network_graph()

    def processing_finished(self):
        """Handle processing completion with enhanced feedback"""
        if not self.processing_errors:
            # Remove duplicate messages, use status manager only
            self.status_manager.update_step("🎬 Video Creation", 100, "✨ Processing completed successfully!", "completed")
        else:
            self.status_manager.update_step("🎬 Video Creation", 100, "Completed with errors ⚠️", "error")
            self.show_message("Warning ⚠️", "Processing completed, but some errors occurred.")

    def start_processing(self):
        """Start the processing operation with proper Sanchez setup"""
        try:
            # Create unique temp directory for this session
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            session_temp_dir = self.temp_base_dir / f"session_{timestamp}"
            session_temp_dir.mkdir(parents=True, exist_ok=True)

            # Get directories from processing widget
            input_dir = self.processing_widget.get_input_directory()
            output_dir = self.processing_widget.get_output_directory()

            # Create timestamped output subdirectory
            session_output_dir = Path(output_dir) / f"processed_{timestamp}"
            
            # Update options with both standard and advanced settings
            options = self.processing_widget.get_options()
            options.update({
                'input_dir': input_dir,
                'output_dir': str(session_output_dir),
                'temp_dir': str(session_temp_dir),
                'fps': self.processing_widget.fps_spin.value(),
                'codec': self.processing_widget.codec_combo.currentText(),
                'frame_duration': self.processing_widget.frame_duration_spin.value(),
                'false_color_enabled': self.processing_widget.enable_false_color.isChecked(),
                'false_color_method': self.processing_widget.sanchez_method.currentText(),
                'interpolation_enabled': self.processing_widget.enable_interpolation.isChecked(),
                'interpolation_method': self.processing_widget.interp_method.currentText(),
                'interpolation_factor': self.processing_widget.interp_factor.value()
            })

            # Save directories to config
            settings = load_config()
            settings['last_input_dir'] = input_dir
            settings['last_output_dir'] = output_dir
            save_config(settings)

            # Validate directories
            if not input_dir or not output_dir:
                error_msg = "Please select input and output directories."
                self.log_widget.append_error(error_msg)
                QMessageBox.warning(self, "Error", error_msg)
                return

            # Get all processing options
            options = self.processing_widget.get_options()
            options.update({
                'input_dir': input_dir,
                'output_dir': str(session_output_dir),  # Use timestamped subdirectory
                'temp_dir': str(session_temp_dir)
            })

            # Only output these if debug mode is enabled
            if self.debug_mode:
                self.log_widget.append_message(f"False color enabled: {options['false_color_enabled']}")
                self.log_widget.append_message(f"False color method: {options['false_color_method']}")
            
            # Ensure false color settings are passed correctly
            if options['false_color_enabled']:
                sanchez_path = Path("Y:/Media/SatandHam/sanchez/Sanchez.exe")  # Update with your actual path
                underlay_path = Path("Y:/Media/SatandHam/sanchez/Resources/world.200411.3x10848x5424.jpg")  # Update with your actual path
                
                if not sanchez_path.exists():
                    raise ValueError(f"Sanchez executable not found at: {sanchez_path}")
                if not underlay_path.exists():
                    raise ValueError(f"Underlay file not found at: {underlay_path}")
                    
                options.update({
                    'sanchez_path': str(sanchez_path),
                    'underlay_path': str(underlay_path)
                })

            # Update UI state
            self.start_button.setEnabled(False)
            self.cancel_button.setEnabled(True)

            # Start processing in separate thread
            success = self.processing_manager.start_processing(options)
            if not success:
                self.log_widget.append_error("Failed to start processing.")
                self.start_button.setEnabled(True)
                self.cancel_button.setEnabled(False)

            # Add debug info for Sanchez and interpolation
            if self.debug_mode:
                self.logger.debug("Processing options:")
                self.logger.debug(f"False Color: {options.get('false_color_enabled')}")
                self.logger.debug(f"Interpolation: {options.get('interpolation_enabled')}")
                self.logger.debug(f"Sanchez Path: {options.get('sanchez_path')}")

        except Exception as e:
            if session_temp_dir.exists():
                shutil.rmtree(session_temp_dir, ignore_errors=True)
            error_msg = f"Failed to start processing: {str(e)}"
            self.log_widget.append_error(error_msg)
            QMessageBox.critical(self, "Error", error_msg)
            self.start_button.setEnabled(True)
            self.cancel_button.setEnabled(False)

    def cancel_processing(self):
        """Cancel the ongoing processing operation"""
        try:
            self.processing_manager.cancel_processing()
            self.log_widget.append_message("Processing cancelled.")  # Changed from status_widget
            self.start_button.setEnabled(True)
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to cancel processing: {str(e)}")

    def dragEnterEvent(self, event):
        """Handle drag enter events for input files"""
        if event.mimeData().hasUrls():
            event.accept()
        else:
            event.ignore()

    def dropEvent(self, event):
        """Handle file drop events"""
        files = [url.toLocalFile() for url in event.mimeData().urls()]
        if files:
            self.processing_widget.set_input_directory(str(Path(files[0]).parent))

    def open_settings_dialog(self):
        """Open settings dialog with proper initialization"""
        try:
            dialog = SettingsDialog(self)  # Simply pass parent
            if dialog.exec() == QDialog.DialogCode.Accepted:
                self.load_settings()
        except Exception as e:
            self.logger.error(f"Failed to open settings dialog: {e}")
    
    def validate_preferences(self) -> bool:
        """Validate required preferences."""
        missing = []
        if not self.sanchez_path:
            missing.append('sanchez_path')
        if not self.underlay_path:
            missing.append('underlay_path')
            missing.append('underlay_path')
            missing.append('temp_directory')
        
        if missing:
            msg = f"Missing required preferences: {', '.join(missing)}"
            self.logger.error(msg)
            return False
        return True
        return True

    def setup_processor(self):
        # ...existing code...
        self.processor.network_update_signal.connect(self.graph_widget.update_data)
        # ...existing code...
        self.processor.network_update_signal.connect(self.graph_widget.update_data)
        # ...existing code...
        # ...existing code...

    def update_resource_display(self, stats):
        """
        Update the resource usage display.
        """
        try:
            cpu = stats.get('cpu', 0)
            memory = stats.get('memory', 0)
            net_sent = stats.get('network_sent', 0)
            net_recv = stats.get('network_recv', 0)
            
            # Update labels if they exist
            if hasattr(self, 'cpu_label'):
                self.cpu_label.setText(f"CPU: {cpu:.1f}%")
            if hasattr(self, 'memory_label'):
                self.memory_label.setText(f"Memory: {memory:.1f}%")
            if hasattr(self, 'network_label'):
                self.network_label.setText(f"Network ↑: {net_sent/1024:.1f}KB/s ↓: {net_recv/1024:.1f}KB/s")
        except Exception as e:
            self.logger.error(f"Error updating resource display: {e}")

    def _create_status_labels(self):
        """Create status bar labels for resource monitoring"""
        self.cpu_label = QLabel("CPU: 0%")
        self.memory_label = QLabel("Memory: 0%")
        self.network_label = QLabel("Network: ↑0 KB/s ↓0 KB/s")
        
        self.statusBar().addWidget(self.cpu_label)
        self.statusBar().addWidget(self.memory_label)
        self.statusBar().addWidget(self.network_label)
        
    def _initialize_resource_monitor(self):
        """Initialize the resource monitor"""
        try:
            self.resource_monitor = ResourceMonitor(self)
            self.resource_monitor.setInterval(1000)  # Set update interval to 1 second
            self.logger.debug("Resource monitor initialized")
        except Exception as e:
            self.logger.error(f"Failed to initialize resource monitor: {e}")

    def closeEvent(self, event):
        """Clean up resources before closing"""
        try:
            if hasattr(self, 'resource_monitor'):
                self.resource_monitor.stop()
        except Exception as e:
            self.logger.error(f"Error during cleanup: {e}")
        super().closeEvent(event)

    def some_other_method(self):
        """Example method using UITS utilities"""
        result = calculate_uits(self.options)
        if not validate_uits(result):
            self.display_error("Invalid UITS data.")
        # ...existing code...

    def select_input_directory(self):
        """Handle input directory selection"""
        directory = QFileDialog.getExistingDirectory(self, "Select Input Directory")
        if directory:
            self.input_dir_edit.setText(directory)
            self.processor.set_input_directory(directory)
            if self.settings_manager:
                self.settings_manager.set('input_dir', directory)

    def select_output_directory(self):
        """Handle output directory selection"""
        directory = QFileDialog.getExistingDirectory(self, "Select Output Directory")
        if directory:
            self.output_dir_edit.setText(directory)
            self.processor.set_output_directory(directory)
            if self.settings_manager:
                self.settings_manager.set('output_dir', directory)

    def load_saved_directories(self):
        """Load previously saved directories"""
        if self.settings_manager:
            input_dir = self.settings_manager.get('input_dir')
            output_dir = self.settings_manager.get('output_dir')
            if input_dir:
                self.input_dir_edit.setText(input_dir)
            if output_dir:
                self.output_dir_edit.setText(output_dir)

    def setup_video_settings(self):
        # ...existing video settings code...
        
        video_layout = QFormLayout()  # Define video_layout here
        
        # Add frame duration setting
        self.frame_duration_spin = QDoubleSpinBox()
        self.frame_duration_spin.setRange(0.1, 10.0)
        self.frame_duration_spin.setValue(1.0)
        self.frame_duration_spin.setSingleStep(0.1)
        self.frame_duration_spin.setDecimals(1)
        self.frame_duration_spin.setSuffix(" sec")
        
        video_layout.addRow("Frame Duration:", self.frame_duration_spin)
        
    def get_processor_options(self) -> dict:
        options = {
            # ...existing options...
            'frame_duration': self.frame_duration_spin.value()
        }
        return options