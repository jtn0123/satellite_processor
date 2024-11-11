import cv2
import subprocess
from pathlib import Path
import logging
import tempfile
import shutil
from typing import List, Optional
import numpy as np
from datetime import datetime  # Add missing import
import os
import re
from .file_manager import FileManager  # Add this import

"""
Video Processing Module
----------------------
Handles video creation and encoding operations:
- FFmpeg integration and execution
- Video codec management
- Frame rate handling
- Video quality settings
- Frame sequence assembly

Key Responsibilities:
- Video creation from image sequences
- Codec selection and optimization
- Frame rate/duration management
- Video format handling

Does NOT handle:
- File management (use FileManager)
- Image processing
- Directory operations
- File ordering
"""

class VideoHandler:
    """Handle video creation and processing operations"""
    
    def __init__(self):
        """Initialize video handler with file manager"""
        self.logger = logging.getLogger(__name__)
        self.file_manager = FileManager()  # Initialize file manager
        
        # Find FFmpeg executable
        self.ffmpeg_path = self._find_ffmpeg()
        if not self.ffmpeg_path:
            # Try common Windows paths
            common_paths = [
                'C:/ffmpeg/bin/ffmpeg.exe',
                'C:/Program Files/ffmpeg/bin/ffmpeg.exe',
                'C:/Program Files (x86)/ffmpeg/bin/ffmpeg.exe',
                os.path.expanduser('~/ffmpeg/bin/ffmpeg.exe'),
            ]
            
            for path in common_paths:
                if os.path.exists(path):
                    self.ffmpeg_path = Path(path)
                    break
                    
        if not self.ffmpeg_path:
            raise RuntimeError("FFmpeg not found. Please install FFmpeg and ensure it's in your PATH")
            
        self.logger.info(f"Using FFmpeg from: {self.ffmpeg_path}")

    def _find_ffmpeg(self) -> Optional[Path]:
        """Find FFmpeg executable"""
        try:
            # Check Windows-specific paths first
            common_paths = [
                Path('C:/ffmpeg/bin/ffmpeg.exe'),
                Path(os.environ.get('PROGRAMFILES', ''), 'ffmpeg/bin/ffmpeg.exe'),
                Path(os.environ.get('PROGRAMFILES(X86)', ''), 'ffmpeg/bin/ffmpeg.exe'),
                Path(os.environ.get('LOCALAPPDATA', ''), 'ffmpeg/bin/ffmpeg.exe'),
            ]
            
            for path in common_paths:
                if path.exists():
                    self.logger.debug(f"Found FFmpeg at: {path}")
                    return path

            # Try PATH environment
            try:
                result = subprocess.run(['ffmpeg', '-version'], 
                                     capture_output=True, 
                                     text=True)
                if result.returncode == 0:
                    return Path('ffmpeg')
            except Exception:
                pass

            return None
        except Exception as e:
            self.logger.error(f"Error finding FFmpeg: {e}")
            return None
        
    def create_video(self, images: List[np.ndarray], output_path: Path, options: dict) -> bool:
        """Create a video from processed images with better error handling"""
        if not images:
            self.logger.error("No images provided for video creation")
            return False

        temp_dir = None
        try:
            # Create temp directory with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            temp_dir = Path(tempfile.mkdtemp(prefix=f"frames_{timestamp}_"))
            self.logger.debug(f"Created temp directory: {temp_dir}")
            
            # Save frames with sequential naming
            frame_files = []
            for idx, img in enumerate(images):
                frame_path = temp_dir / f"frame_{idx:08d}.png"
                success = cv2.imwrite(str(frame_path), img)
                if success:
                    frame_files.append(frame_path)
                else:
                    self.logger.error(f"Failed to write frame {idx}")

            if not frame_files:
                raise RuntimeError("No frames were successfully saved")

            # Create frame list file
            list_file = temp_dir / "frames.txt"
            with open(list_file, "w", encoding='utf-8') as f:
                for frame in frame_files:
                    f.write(f"file '{frame.name}'\n")
                    f.write(f"duration {1.0/options.get('fps', 30)}\n")

            # Create FFmpeg command with explicit path
            cmd = [
                str(self.ffmpeg_path),
                '-y',  # Overwrite output
                '-f', 'concat',  # Use concat demuxer
                '-safe', '0',
                '-i', str(list_file),
                '-c:v', 'libx264',  # Use CPU encoder
                '-preset', options.get('preset', 'medium'),
                '-crf', options.get('crf', '23'),
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                str(output_path)
            ]

            # Log full command
            self.logger.debug(f"FFmpeg command: {' '.join(cmd)}")
            
            # Run FFmpeg
            process = subprocess.run(
                cmd,
                cwd=str(temp_dir),  # Set working directory
                capture_output=True,
                text=True,
                check=False
            )

            # Check result
            if process.returncode != 0:
                self.logger.error(f"FFmpeg stderr: {process.stderr}")
                return False

            # Verify output was created
            if not output_path.exists():
                self.logger.error("Output file was not created")
                return False

            self.logger.info(f"Video created successfully: {output_path}")
            return True

        except Exception as e:
            self.logger.error(f"Video creation failed: {str(e)}")
            return False

        finally:
            # Cleanup
            if temp_dir and temp_dir.exists():
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception as e:
                    self.logger.error(f"Failed to cleanup temp directory: {e}")

    def _create_ffmpeg_video(self, frame_paths: List[Path], output_path: Path, options: dict) -> bool:
        """Create video using FFmpeg"""
        try:
            fps = options.get('fps', 30)  # Lower default FPS
            encoder = options.get('encoder', 'H.264')
            bitrate = options.get('bitrate', '8000k')
            preset = options.get('preset', 'slow')
            frame_duration = options.get('frame_duration', 1.0)  # Add frame duration option

            # Validate output path
            output_path = Path(output_path).resolve()
            output_path.parent.mkdir(parents=True, exist_ok=True)

            # Create image list file with modified duration
            temp_dir = frame_paths[0].parent
            image_list_path = (temp_dir / "image_list.txt").resolve()
            with open(image_list_path, 'w', encoding='utf-8') as f:
                for frame_path in frame_paths:
                    f.write(f"file '{frame_path}'\n")
                    f.write(f"duration {frame_duration}\n")  # Use frame_duration instead of 1/fps

            # Build FFmpeg command with modified settings
            cmd = [
                str(self.ffmpeg_path),
                '-y',
                '-f', 'concat',
                '-safe', '0',
                '-i', str(image_list_path),
                '-c:v', self._get_codec(encoder),
                '-preset', preset,
                '-b:v', bitrate,
                '-vf', f'fps={fps}',  # Force output FPS
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                str(output_path)
            ]

            # Run FFmpeg with proper environment
            process = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                env=os.environ.copy(),  # Use current environment
                check=False  # Don't raise exception, handle it ourselves
            )

            if process.returncode != 0:
                self.logger.error(f"FFmpeg stderr: {process.stderr}")
                raise RuntimeError(f"FFmpeg failed with code {process.returncode}")

            # Verify output file was created
            if not output_path.exists():
                raise RuntimeError("Output file was not created")

            return True

        except Exception as e:
            self.logger.error(f"Video creation failed: {str(e)}")
            return False
            
        finally:
            # Improved cleanup
            try:
                if 'image_list_path' in locals() and isinstance(image_list_path, Path):
                    image_list_path.unlink(missing_ok=True)
                
                if frame_paths:
                    for frame_path in frame_paths:
                        try:
                            frame_path.unlink(missing_ok=True)
                        except Exception as e:
                            self.logger.debug(f"Failed to remove frame: {e}")
                
                if temp_dir and temp_dir.exists():
                    try:
                        shutil.rmtree(temp_dir, ignore_errors=True)
                    except Exception as e:
                        self.logger.debug(f"Failed to remove temp directory: {e}")
            except Exception as e:
                self.logger.error(f"Cleanup error: {e}")

    def apply_interpolation(self, video_path: Path, output_path: Path, fps: int) -> bool:
        """Apply frame interpolation to video"""
        try:
            # FFmpeg command with improved interpolation settings
            ffmpeg_cmd = [
                str(self.ffmpeg_path),
                '-y',
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

    def interpolate_frames(self, input_path: Path, output_path: Path, fps: int) -> bool:
        """Interpolate frames to increase video smoothness"""
        try:
            ffmpeg_cmd = [
                str(self.ffmpeg_path),
                '-y',
                '-i', str(input_path),
                '-filter:v', f'minterpolate=fps={fps}:mi_mode=mci:me_mode=bidir:mc_mode=obmc:vsbmc=1',
                '-c:v', 'libx264',
                '-preset', 'slow',
                '-crf', '18',
                str(output_path)
            ]
            
            process = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
            if process.returncode != 0:
                raise RuntimeError(f"FFmpeg interpolation failed: {process.stderr}")
            return True

        except Exception as e:
            self.logger.error(f"Frame interpolation failed: {str(e)}")
            return False

    def get_video_info(self, video_path: Path) -> dict:
        """Get video file information using FFmpeg"""
        try:
            cmd = [
                str(self.ffmpeg_path),
                '-i', str(video_path)
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            # Parse FFmpeg output for video information
            info = {}
            if result.stderr:
                # Extract duration
                duration_match = re.search(r'Duration: (\d{2}:\d{2}:\d{2}\.\d{2})', result.stderr)
                if duration_match:
                    info['duration'] = duration_match.group(1)
                # Extract resolution
                resolution_match = re.search(r'(\d{2,}x\d{2,})', result.stderr)
                if resolution_match:
                    info['resolution'] = resolution_match.group(1)
            return info

        except Exception as e:
            self.logger.error(f"Failed to get video info: {e}")
            return {}