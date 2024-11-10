
import cv2
import subprocess
from pathlib import Path
import logging
from typing import List, Optional
import tempfile

class VideoProcessor:
    """Handle video creation and processing"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        
    def create_video(
        self,
        images: List[Path],
        output_path: Path,
        fps: int = 60,
        encoder: str = 'H.264',
        bitrate: str = '8000k',
        preset: str = 'slow'
    ) -> bool:
        """Create video from image files"""
        try:
            if not images:
                raise ValueError("No images provided")
                
            # Create temp file for image list
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
                for image_path in images:
                    f.write(f"file '{image_path.absolute()}'\n")
                    f.write(f"duration {1/fps}\n")
                image_list = Path(f.name)
            
            try:
                # Build FFmpeg command
                cmd = [
                    'ffmpeg', '-y',
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', str(image_list),
                    '-c:v', self._get_codec(encoder),
                    '-preset', preset,
                    '-b:v', bitrate,
                    '-r', str(fps),
                    '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart',
                    str(output_path)
                ]
                
                process = subprocess.run(cmd, capture_output=True, text=True, check=True)
                return True
                
            finally:
                image_list.unlink(missing_ok=True)
                
        except Exception as e:
            self.logger.error(f"Video creation failed: {e}")
            return False
            
    def _get_codec(self, encoder: str) -> str:
        """Get appropriate codec based on encoder selection"""
        codecs = {
            'H.264 (CPU)': 'libx264',
            'H.264 (GPU)': 'h264_nvenc',
            'H.265/HEVC (CPU)': 'libx265',
            'H.265/HEVC (GPU)': 'hevc_nvenc',
            'AV1 (CPU)': 'libaom-av1'
        }
        return codecs.get(encoder, 'libx264')