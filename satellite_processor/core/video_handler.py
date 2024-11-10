
import cv2
import subprocess
from pathlib import Path
import logging
import tempfile
import shutil
from typing import List
import numpy as np

class VideoHandler:
    """Handle video creation and processing operations"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        
    def create_video(
        self,
        images: List[np.ndarray],
        output_path: Path,
        fps: int = 60,
        encoder: str = 'H.264',
        bitrate: str = '8000k',
        preset: str = 'slow'
    ) -> bool:
        """Create a video from processed images"""
        try:
            if not images:
                raise ValueError("No images provided for video creation")

            # Create temp directory for frames
            temp_dir = Path(tempfile.gettempdir()) / "frames"
            temp_dir.mkdir(parents=True, exist_ok=True)

            # Save numpy arrays as image files
            frame_paths = []
            for idx, img in enumerate(images):
                frame_path = temp_dir / f"frame_{idx:04d}.png"
                cv2.imwrite(str(frame_path), img)
                frame_paths.append(frame_path)

            # Create temp file for image list
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
                image_list_path = Path(f.name)
                for frame_path in frame_paths:
                    f.write(f"file '{frame_path.absolute()}'\n")
                    f.write(f"duration {1/fps}\n")

            # Build FFmpeg command
            cmd = [
                'ffmpeg', '-y',
                '-f', 'concat',
                '-safe', '0',
                '-i', str(image_list_path),
                '-c:v', self._get_codec(encoder),
                '-preset', preset,
                '-b:v', bitrate,
                '-r', str(fps),
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                str(output_path)
            ]

            # Run FFmpeg
            process = subprocess.run(cmd, capture_output=True, text=True)
            if process.returncode != 0:
                raise RuntimeError(f"FFmpeg error: {process.stderr}")

            return True

        except Exception as e:
            self.logger.error(f"Video creation failed: {str(e)}")
            return False
            
        finally:
            # Clean up temp files
            if 'image_list_path' in locals():
                try:
                    image_list_path.unlink(missing_ok=True)
                except Exception:
                    pass
            
            # Clean up frame files
            if 'temp_dir' in locals():
                try:
                    for frame_path in frame_paths:
                        frame_path.unlink(missing_ok=True)
                    temp_dir.rmdir()
                except Exception:
                    pass

    def apply_interpolation(self, video_path: Path, output_path: Path, fps: int) -> bool:
        """Apply frame interpolation to video"""
        try:
            # FFmpeg command with improved interpolation settings
            ffmpeg_cmd = [
                'ffmpeg', '-y',
                '-i', str(video_path),
                '-filter:v', f'minterpolate=fps={fps}:mi_mode=mci:me_mode=bidir:mc_mode=obmc:vsbmc=1:mb_size=16',
                '-c:v', 'libx264',
                '-preset', 'slow',
                '-crf', '18',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                str(output_path)
            ]
            
            process = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
            if process.returncode != 0:
                raise RuntimeError(f"FFmpeg interpolation failed: {process.stderr}")
            return True

        except Exception as e:
            self.logger.error(f"Interpolation failed: {str(e)}")
            return False

    def _get_codec(self, encoder: str) -> str:
        """Get appropriate codec based on encoder selection"""
        if encoder.startswith("CPU"):
            if "H.264" in encoder: return "libx264"
            if "H.265" in encoder or "HEVC" in encoder: return "libx265"
            if "AV1" in encoder: return "libaom-av1"
        else:  # GPU encoders
            if "H.264" in encoder: return "h264_nvenc"
            if "H.265" in encoder or "HEVC" in encoder: return "hevc_nvenc"
            if "AV1" in encoder: return "av1_nvenc"
        return "libx264"  # Default to H.264