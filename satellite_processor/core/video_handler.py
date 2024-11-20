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
import time
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
        self._current_process = None
        self._processor = None  # Reference to main processor

    def set_processor(self, processor):
        """Set reference to main processor for process tracking"""
        self._processor = processor

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
        
    def _check_gpu_support(self) -> bool:
        """Check if NVIDIA GPU encoding is supported"""
        try:
            cmd = [
                str(self.ffmpeg_path),
                '-encoders'
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            return 'h264_nvenc' in result.stdout
        except Exception:
            return False

    def create_video(self, image_paths: List[Path], output_path: Path, options: dict) -> bool:
        """Create video from images with proper frame timing and progress tracking"""
        if not image_paths:
            self.logger.error("No images provided for video creation")
            return False

        temp_dir = None
        try:
            # Get encoding settings from options
            encoder = self._get_codec(options.get('codec', 'libx264'))  # Use _get_codec here
            frame_duration = options.get('frame_duration', 1.0)
            target_fps = options.get('target_fps', 30)
            bitrate = options.get('bitrate', '8M')
            preset = options.get('preset', 'medium')  # Changed from p7 to medium for CPU codecs
            
            # Create working directory and image list
            temp_dir = Path(tempfile.mkdtemp())
            image_list_path = temp_dir / "files.txt"
            
            with open(image_list_path, 'w', encoding='utf-8') as f:
                for image_path in image_paths:
                    f.write(f"file '{image_path.absolute()}'\n")
                    f.write(f"duration {frame_duration}\n")
                f.write(f"file '{image_paths[-1].absolute()}'\n")

            # Build FFmpeg command
            cmd = [
                str(self.ffmpeg_path),
                '-y',
                '-f', 'concat',
                '-safe', '0',
                '-i', str(image_list_path),
                '-c:v', encoder,
                '-preset', preset if 'x26' in encoder else 'p7',  # Use p7 only for NVENC
                '-b:v', bitrate,
                '-maxrate', str(int(float(bitrate[:-1]) * 1.5)) + 'M',
                '-bufsize', str(int(float(bitrate[:-1]) * 2)) + 'M',
                '-r', str(target_fps),
                '-pix_fmt', 'yuv420p',
                str(output_path)
            ]

            self.logger.info(f"Running FFmpeg command: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=False
            )

            if result.returncode != 0:
                self.logger.error(f"FFmpeg error: {result.stderr}")
                return False

            if not output_path.exists():
                self.logger.error("Output file was not created")
                return False

            return True

        except Exception as e:
            self.logger.error(f"Video creation error: {str(e)}")
            return False
            
        finally:
            if temp_dir and temp_dir.exists():
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception as e:
                    self.logger.error(f"Error cleaning up temp directory: {e}")

    def _try_encode(self, cmd: List[str], temp_dir: Path, output_path: Path) -> bool:
        """Try to encode with given FFmpeg command"""
        try:
            self.logger.info("Starting FFmpeg encoding process...")
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(temp_dir),
                creationflags=subprocess.HIGH_PRIORITY_CLASS if os.name == 'nt' else 0,
                universal_newlines=True,
                bufsize=1
            )

            # Store process and monitor
            self._current_process = process
            if self._processor:
                self._processor._ffmpeg_processes.add(process)

            # Monitor the process with timeout and progress feedback
            start_time = time.time()
            timeout = 300  # 5 minutes timeout
            
            while process.poll() is None:
                # Check for timeout
                if time.time() - start_time > timeout:
                    self.logger.error("FFmpeg process timed out")
                    process.terminate()
                    return False
                
                # Read stderr for progress info
                if process.stderr:
                    line = process.stderr.readline()
                    if line:
                        self.logger.info(f"FFmpeg: {line.strip()}")
                
                # Brief sleep to prevent CPU overuse
                time.sleep(0.1)

            # Get final output
            _, stderr = process.communicate()
            
            # Remove from tracking
            if self._processor:
                self._processor._ffmpeg_processes.discard(process)
            self._current_process = None

            if process.returncode != 0:
                self.logger.error(f"FFmpeg error: {stderr}")
                return False

            # Verify output file
            if not output_path.exists():
                self.logger.error("Output file was not created")
                return False

            file_size = output_path.stat().st_size
            if file_size == 0:
                self.logger.error("Output file is empty")
                return False

            self.logger.info(f"Successfully created video at {output_path} ({file_size/1024/1024:.1f} MB)")
            return True

        except Exception as e:
            self.logger.error(f"Encoding failed: {str(e)}")
            return False
        finally:
            if process:
                try:
                    process.terminate()
                except:
                    pass

    def _create_initial_video(self, frame_files: List[Path], output: Path, fps: float, options: dict) -> bool:
        """Create initial video with proper frame timing"""
        try:
            list_file = output.parent / "frames.txt"
            frame_duration = options.get('frame_duration', 1.0)
            
            # Create frame list with proper durations
            with open(list_file, "w", encoding='utf-8') as f:
                for frame in frame_files:
                    f.write(f"file '{frame.name}'\n")
                    f.write(f"duration {frame_duration}\n")
                # Add last frame duration
                f.write(f"file '{frame_files[-1].name}'\n")

            cmd = [
                str(self.ffmpeg_path),
                '-y',
                '-f', 'concat',
                '-safe', '0',
                '-i', str(list_file),
                '-c:v', 'h264_nvenc',
                '-preset', 'p7',
                '-rc', 'vbr',
                '-b:v', '35M',
                '-maxrate', '45M',
                '-bufsize', '70M',
                '-profile:v', 'main',
                '-fps_mode', 'cfr',  # Use CFR mode instead of -vsync
                '-r', str(fps),      # Set input/output frame rate
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                str(output)
            ]

            self.logger.debug(f"Running initial video creation: {' '.join(cmd)}")
            
            process = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=False
            )

            if process.returncode != 0:
                self.logger.error(f"Initial video creation failed: {process.stderr}")
                return False

            return True

        except Exception as e:
            self.logger.error(f"Error in _create_initial_video: {str(e)}")
            return False

    def _apply_interpolation(self, input_path: Path, output_path: Path, target_fps: int, options: dict) -> bool:
        """Apply high-quality interpolation"""
        try:
            cmd = [
                str(self.ffmpeg_path),
                '-y',
                '-i', str(input_path),
                '-filter_complex',
                f'minterpolate=fps={target_fps}:'
                'mi_mode=mci:'
                'mc_mode=aobmc:'
                'me_mode=bilat:'
                'me=umh:'        # Use UMH for better quality
                'mb_size=16:'
                'search_param=400:'  # Increased search area
                'vsbmc=1:'
                'scd=none',     # Disable scene change detection
                '-c:v', 'h264_nvenc',
                '-preset', 'p7',
                '-rc', 'vbr',
                '-b:v', '35M',
                '-maxrate', '45M',
                '-bufsize', '70M',
                '-profile:v', 'main',
                '-pix_fmt', 'yuv420p',
                str(output_path)
            ]

            self.logger.debug(f"Running interpolation: {' '.join(cmd)}")
            
            process = subprocess.run(cmd, capture_output=True, text=True)
            if process.returncode != 0:
                self.logger.error(f"Interpolation failed: {process.stderr}")
                return False

            return True

        except Exception as e:
            self.logger.error(f"Error in _apply_interpolation: {str(e)}")
            return False

    def _get_codec_params(self, codec: str) -> List[str]:
        """Get optimal codec parameters based on selected encoder"""
        params = {
            'h264_nvenc': [
                '-c:v', 'h264_nvenc',
                '-preset', 'p7',
                '-rc', 'vbr',
                '-cq', '16',
                '-b:v', '35M',
                '-maxrate', '45M',
                '-bufsize', '70M',
                '-profile:v', 'main',  # Changed from high to main
                '-movflags', '+faststart'
            ],
            'hevc_nvenc': [
                '-c:v', 'hevc_nvenc',
                '-preset', 'p7',
                '-rc', 'vbr',
                '-cq', '20',
                '-b:v', '35M',
                '-maxrate', '45M',
                '-bufsize', '70M',
                '-profile:v', 'main',
                '-movflags', '+faststart'
            ],
            'libx264': [
                '-c:v', 'libx264',
                '-preset', 'slow',
                '-crf', '18',
                '-profile:v', 'main',  # Changed from high to main
                '-movflags', '+faststart'
            ]
        }
        return params.get(codec, params['libx264'])

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
        codec_map = {
            'H.264 (Maximum Compatibility)': 'libx264',
            'H.264': 'libx264',
            'H.265': 'libx265',
            'HEVC': 'libx265',
            'CPU H.264': 'libx264',
            'CPU H.265': 'libx265',
            'NVIDIA H.264': 'h264_nvenc',
            'NVIDIA H.265': 'hevc_nvenc',
            'AV1': 'libaom-av1'
        }
        return codec_map.get(encoder, 'libx264')  # Default to libx264 if unknown

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