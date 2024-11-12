import logging
from datetime import datetime
from pathlib import Path, WindowsPath
from typing import Optional
from PyQt6.QtCore import QObject, pyqtSignal
from ...utils.url_handler import create_file_url, create_link_data  # Add create_link_data to imports
import os

class LogManager(QObject):
    """Centralized manager for all logging and link handling"""
    
    message_received = pyqtSignal(str)
    error_received = pyqtSignal(str)
    warning_received = pyqtSignal(str)
    link_received = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.logger = logging.getLogger(__name__)
        self._last_message = None
        self._message_count = 0
        self._last_success = None
        self.setup_file_logging()
    
    def setup_file_logging(self):
        """Setup file-based logging"""
        try:
            log_dir = Path("logs")
            log_dir.mkdir(exist_ok=True)
            
            current_date = datetime.now().strftime("%Y%m%d")
            file_handler = logging.FileHandler(
                log_dir / f"satellite_processor_{current_date}.log",
                encoding='utf-8'  # Specify UTF-8 encoding
            )
            file_handler.setFormatter(
                logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            )
            self.logger.addHandler(file_handler)
            
        except Exception as e:
            print(f"Failed to setup file logging: {e}")
    
    def log_message(self, message: str, level: str = "info"):
        """Central logging method with Unicode support"""
        try:
            # Clean up message
            clean_msg = self._clean_message(message)
            
            # Handle duplicate messages
            if clean_msg == self._last_message:
                self._message_count += 1
                return
            
            # Reset counter for new message
            if self._message_count > 1:
                self.message_received.emit(f"(repeated {self._message_count} times)")
            self._message_count = 1
            self._last_message = clean_msg

            # Regular message handling with proper encoding
            if level == "error":
                self.error_received.emit(clean_msg)
            elif level == "warning":
                self.warning_received.emit(clean_msg)
            else:
                self.message_received.emit(clean_msg)
                
            # Log to file/console with proper encoding
            if hasattr(self, 'logger'):
                if level == "error":
                    self.logger.error(clean_msg)
                elif level == "warning":
                    self.logger.warning(clean_msg)
                else:
                    self.logger.info(clean_msg)

        except Exception as e:
            print(f"Logging error: {e}")

    def _clean_message(self, message: str) -> str:
        """Clean up message content"""
        # Remove style attributes from links
        if 'style="' in message:
            message = message.split('style="')[0] + '">'
        return message.strip()

    def _handle_success_message(self, message: str) -> None:
        """Handle success messages with deduplication and proper formatting"""
        if message != self._last_success:
            self._last_success = message
            formatted_message = f'<div style="color: #2ecc71; margin: 5px 0;">{message}</div>'
            self.message_received.emit(formatted_message)
            
    def _create_link_html(self, file_url: str, display_name: str) -> str:
        """Create standardized link HTML with proper escaping"""
        return (
            '<div style="margin: 10px 0; padding: 8px; background-color: #2c3e50; '
            'border-radius: 4px;">'
            f'📁 Output: <a href="{file_url}" style="color: #3498db; '
            'text-decoration: none; padding: 4px 8px; background-color: #34495e; '
            f'border-radius: 3px;">{display_name}</a></div>'
        ).replace('">', '">')  # Fix any malformed HTML

    def _format_success_message(self, message: str) -> None:
        """Only emit success message once"""
        if not hasattr(self, '_last_success'):
            self._last_success = None
        
        if message != self._last_success:
            self._last_success = message
            self.message_received.emit(message)

    def _normalize_network_path(self, file_path: Path) -> Path:
        """Normalize network paths for proper handling"""
        try:
            path_str = str(file_path)
            
            # Clean up malformed paths
            if '"' in path_str:
                path_str = path_str.split('"')[0]
            
            # Handle network drives
            if ':' in path_str and os.path.exists(path_str):
                try:
                    import win32api
                    drive_letter = path_str[0].upper()
                    if win32api.GetDriveType(f"{drive_letter}:") == 4:  # DRIVE_NETWORK
                        import win32wnet
                        path_str = win32wnet.WNetGetUniversalName(path_str, 1)
                except ImportError:
                    pass
            
            if path_str.startswith(r'\\'):  # UNC path
                return WindowsPath(path_str)
            return Path(path_str).resolve()
        except Exception as e:
            self.warning_received.emit(f"Path normalization error: {e}")
            return file_path

    def create_output_link(self, file_path: Path) -> str:
        """Create standardized clickable output link with enhanced path validation"""
        try:
            norm_path = self._normalize_network_path(Path(file_path))
            
            if not norm_path.exists():
                self.warning_received.emit(f"File not found: {norm_path}")
                return None
                
            file_url = create_file_url(str(norm_path))
            
            # Simplified HTML generation
            link_html = (
                '<div class="output-link">'
                f'📁 Output: <a href="{file_url}">{norm_path.name}</a>'
                '</div>'
            )
            
            return link_html
            
        except Exception as e:
            self.warning_received.emit(f"Error creating link: {e}")
            return None

    def format_link_html(self, link_data: dict) -> str:
        """Format link data into HTML"""
        return f'''
            <div style="margin: 10px 0; padding: 8px; background-color: #2c3e50; border-radius: 4px;">
                📁 Output: <a href="{link_data['url']}" 
                style="color: #3498db; text-decoration: none; 
                padding: 4px 8px; background-color: #34495e; 
                border-radius: 3px;">{link_data['display_name']}</a>
            </div>
        '''

    def log_completion(self, file_path: Optional[Path] = None):
        """Handle completion logging with enhanced output"""
        try:
            if file_path and file_path.exists():
                # Create the link HTML
                link_data = create_link_data(file_path)  # Now this will work
                link_html = (
                    '<div class="output-link">'
                    f'📁 Output: <a href="{link_data["url"]}">{link_data["display_name"]}</a>'
                    '</div>'
                )
                
                # Emit messages in sequence
                self.message_received.emit("──────────────────────────")
                self.link_received.emit(link_html)  # Use link_received for the HTML link
                self._handle_success_message("✨ Processing completed successfully!")
            else:
                self._handle_success_message("✨ Processing completed successfully!")
        except Exception as e:
            self.warning_received.emit(f"Error creating completion link: {e}")