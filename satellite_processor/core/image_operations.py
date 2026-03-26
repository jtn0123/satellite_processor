"""
Image Processing Operations
-------------------------
Responsibilities:
- Image processing and enhancement
- Batch processing optimization
- Image format conversions
- Adding timestamp overlays

Does NOT handle:
- File operations (see file_manager.py)
- Timestamp parsing (use helpers.py)
- Configuration management
"""

from __future__ import annotations

import logging
import multiprocessing
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

import cv2  # type: ignore
import numpy as np  # type: ignore

from .utils import parse_satellite_timestamp

logger = logging.getLogger(__name__)


class ImageOperations:
    """Static methods for image processing"""

    @staticmethod
    def crop_image(img: np.ndarray, x: int, y: int, width: int, height: int) -> np.ndarray:
        """Crop the image to the specified rectangle."""
        return img[y : y + height, x : x + width]

    @staticmethod
    def apply_false_color(
        input_path: str,
        output_path: str,
        sanchez_path: str,
        underlay_path: str,
        method: str = "Standard",
    ) -> bool:
        """Apply false color using Sanchez"""
        try:
            # Verify input files
            sanchez_exe = Path(sanchez_path)
            sanchez_dir = sanchez_exe.parent

            if not sanchez_exe.exists():
                logger.error(f"Sanchez.exe not found at {sanchez_path}")
                return False
            if not Path(underlay_path).exists():
                logger.error(f"Underlay image not found at {underlay_path}")
                return False
            if not Path(input_path).exists():
                logger.error(f"Input image not found at {input_path}")
                return False

            # Create output directory
            output_dir = Path(output_path)
            output_dir.mkdir(parents=True, exist_ok=True)
            output_file = output_dir / f"{Path(input_path).stem}_sanchez.jpg"

            # Run Sanchez from its original directory to maintain resource paths
            cmd = [
                str(sanchez_exe),
                "-s",
                str(Path(input_path).absolute()),
                "-u",
                str(Path(underlay_path).absolute()),
                "-o",
                str(output_file.absolute()),
                "-F",
                "jpg",
                "-q",
                "-falsecolor",
            ]

            logger.info("Running Sanchez with paths:")
            logger.info(f"Working dir: {sanchez_dir}")
            logger.info(f"Command: {' '.join(cmd)}")

            # Run Sanchez from its directory
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                shell=False,
                cwd=str(sanchez_dir),
            )

            if result.returncode != 0:
                logger.error(f"Sanchez error: {result.stderr}")
                return False

            # Verify output was created
            if output_file.exists():
                logger.info(f"Successfully created: {output_file}")
                return True

            logger.error(f"Output file not created: {output_file}")
            return False

        except Exception as e:
            logger.error(f"Error in apply_false_color: {e}", exc_info=True)
            return False

    @staticmethod
    def add_timestamp(img: np.ndarray, source: datetime | Path | str) -> np.ndarray:
        """Add a timestamp overlay to the image"""
        try:
            logger.debug(f"Starting timestamp addition for: {source}")

            # Verify input image
            if img is None or not isinstance(img, np.ndarray):
                logger.error("Invalid input image")
                return img

            logger.info(f"Adding timestamp to image from source: {source}")

            # Get timestamp from various input types
            if isinstance(source, datetime):
                timestamp = source
            elif isinstance(source, (Path, str)):
                filename = source if isinstance(source, str) else source.name
                timestamp = parse_satellite_timestamp(filename)
                if timestamp == datetime.min:
                    logger.error(f"No valid timestamp found in: {filename}")
                    return img
            else:
                logger.error(f"Invalid source type for timestamp: {type(source)}")
                return img

            # Format timestamp string
            timestamp_str = timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
            logger.debug(f"Using timestamp string: {timestamp_str}")

            # Create a copy of the image to avoid modifying original
            img_copy = img.copy()

            # Setup text parameters
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 1.0
            color = (255, 255, 255)  # White text
            thickness = 2
            padding = 10

            # Calculate text size and position
            text_size = cv2.getTextSize(timestamp_str, font, font_scale, thickness)[0]
            text_x = padding
            text_y = img_copy.shape[0] - padding  # Bottom-left position

            # Add black background for better visibility
            cv2.rectangle(
                img_copy,
                (text_x - 2, text_y + 2),
                (text_x + text_size[0] + 2, text_y - text_size[1] - 2),
                (0, 0, 0),
                -1,
            )

            # Add text
            cv2.putText(
                img_copy,
                timestamp_str,
                (text_x, text_y),
                font,
                font_scale,
                color,
                thickness,
                cv2.LINE_AA,
            )

            logger.debug("Successfully added timestamp to image")
            return img_copy

        except Exception as e:
            logger.error(f"Failed to add timestamp: {e}", exc_info=True)
            return img

    @staticmethod
    def apply_false_color_and_read(
        image_path: str, output_dir: str, sanchez_path: str, underlay_path: str
    ) -> np.ndarray | None:
        """Apply false color to an image and return the result as a numpy array.

        Shared helper that eliminates duplicated false-color-then-read logic
        across processor.py and image_operations.py.
        """
        output_dir_path = Path(output_dir)
        output_dir_path.mkdir(parents=True, exist_ok=True)

        success = ImageOperations.apply_false_color(image_path, str(output_dir_path), sanchez_path, underlay_path)
        if not success:
            logger.error(f"Failed to apply false color to: {image_path}")
            return None

        output_file = output_dir_path / f"{Path(image_path).stem}_sanchez.jpg"
        img = cv2.imread(str(output_file))
        if img is None:
            logger.error(f"Failed to read false color output: {output_file}")
            return None

        logger.info(f"Successfully applied false color to: {image_path}")
        return img

    @staticmethod
    def _extract_timestamp(filename: str) -> datetime | None:
        """Extract timestamp from filename"""
        return parse_satellite_timestamp(filename)

    @staticmethod
    def process_image(img_or_path: np.ndarray | str | None, options: dict) -> np.ndarray | None:
        """Process image with validation. Accepts ndarray or file path string."""
        try:
            if isinstance(img_or_path, str):
                img = cv2.imread(img_or_path)
                if img is None:
                    logger.error(f"Failed to read image: {img_or_path}")
                    return None
            elif isinstance(img_or_path, np.ndarray):
                img = img_or_path
            else:
                if img_or_path is None:
                    logger.error("Invalid input image: None")
                else:
                    logger.error(f"Invalid input type: {type(img_or_path)}")
                return None

            if img.size == 0:
                logger.error("Invalid input image: empty")
                return None

            # Deep copy to prevent modifications to original
            img = img.copy()

            if options.get("crop_enabled"):
                img = ImageOperations.crop_image(
                    img,
                    options.get("crop_x", 0),
                    options.get("crop_y", 0),
                    options.get("crop_width", img.shape[1]),
                    options.get("crop_height", img.shape[0]),
                )

                # Validate crop result
                if img is None or img.size == 0:
                    logger.error("Cropping resulted in invalid image")
                    return None

            if options.get("interpolation_enabled"):
                factor = options.get("interpolation_factor", 2)
                method = options.get("interpolation_method", "Linear")

                frame1 = img
                frame2 = img  # Placeholder for next frame
                ImageOperations.interpolate_frames(frame1, frame2, factor, method)

            return img

        except Exception as e:
            logger.error(f"Image processing failed: {e}", exc_info=True)
            return None

    @staticmethod
    def process_image_batch(images: list[Path], options: dict) -> list[np.ndarray]:
        """Process images using real multiprocessing with parallel Sanchez"""
        if not images:
            return []

        logger.info(f"Starting batch processing with {len(images)} images")
        num_processes = max(1, multiprocessing.cpu_count() - 1)
        chunk_size = max(1, len(images) // num_processes)

        with multiprocessing.Pool(processes=num_processes, initializer=ImageOperations._init_worker) as pool:
            try:
                results = []
                total = len(images)
                process_args = [(img, options) for img in images]

                for idx, result in enumerate(
                    pool.imap_unordered(
                        ImageOperations._parallel_process_image,
                        process_args,
                        chunksize=chunk_size,
                    )
                ):
                    if result is not None:
                        results.append(result)
                    logger.debug(f"Processed {idx + 1}/{total} images")

                logger.info(f"Successfully processed {len(results)}/{total} images")
                return results

            finally:
                pool.close()
                pool.join()

    @staticmethod
    def _parallel_process_image(args) -> np.ndarray | None:
        """Process a single image with Sanchez in parallel worker"""
        image_path, options = args
        try:
            logger.debug(f"Processing {image_path} in worker process")

            img = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
            if img is None:
                logger.error(f"Failed to read image: {image_path}")
                return None

            if options.get("false_color_enabled"):
                logger.debug(f"Applying false color to {image_path}")
                sanchez_path = options.get("sanchez_path")
                underlay_path = options.get("underlay_path")
                output_dir = Path(options.get("temp_dir")) / "sanchez_output"
                output_dir.mkdir(parents=True, exist_ok=True)

                success = ImageOperations.apply_false_color(
                    str(image_path), str(output_dir), sanchez_path, underlay_path
                )

                if success:
                    output_path = output_dir / f"{Path(image_path).stem}_sanchez.jpg"
                    img = cv2.imread(str(output_path))
                    if img is None:
                        logger.error(f"Failed to read Sanchez output: {output_path}")
                        return None
                else:
                    logger.error(f"Sanchez processing failed for: {image_path}")
                    return None

            if options.get("crop_enabled"):
                img = ImageOperations.crop_image(
                    img,
                    options.get("crop_x", 0),
                    options.get("crop_y", 0),
                    options.get("crop_width", img.shape[1]),
                    options.get("crop_height", img.shape[0]),
                )
                if img is None or img.shape[0] == 0 or img.shape[1] == 0:
                    logger.error(f"Crop produced empty image: {image_path}")
                    return None

            if options.get("add_timestamp", True):
                img = ImageOperations.add_timestamp(img, Path(image_path))

            return img

        except Exception as e:
            logger.error(f"Error processing {image_path}: {e}", exc_info=True)
            return None

    @staticmethod
    def _init_worker():
        """Initialize worker process"""
        try:
            import psutil

            process = psutil.Process()
            if os.name == "nt":
                process.nice(psutil.ABOVE_NORMAL_PRIORITY_CLASS)
            else:
                process.nice(-5)
        except PermissionError:
            logger.debug("Insufficient permissions to set process priority")
        except Exception:
            logger.debug("Failed to set process priority", exc_info=True)

    @staticmethod
    def _apply_interpolation(img: np.ndarray, options: dict) -> np.ndarray | None:
        """Apply interpolation/resize to an image."""
        method = options.get("interpolation_method", "Linear")
        factor = options.get("interpolation_factor", 2)
        interp_map = {"Linear": cv2.INTER_LINEAR, "Cubic": cv2.INTER_CUBIC}
        logger.debug(f"Applying interpolation: {method}")
        try:
            if method in interp_map:
                img = cv2.resize(img, None, fx=factor, fy=factor, interpolation=interp_map[method])
            elif method in ["RIFE", "DAIN"]:
                logger.warning(f"AI interpolation method '{method}' is not implemented — returning image unchanged")
            else:
                logger.warning(f"Unknown interpolation method '{method}' — returning image unchanged")
        except Exception as e:
            logger.error(f"Interpolation failed: {e}", exc_info=True)
            return None
        return img

    @staticmethod
    def _apply_false_color(img: np.ndarray, image_path: str, options: dict) -> np.ndarray | None:
        """Apply Sanchez false color, preserving prior edits via a temp file."""
        import tempfile as _tempfile

        logger.debug("Applying false color with Sanchez")
        base_dir = options.get("temp_dir") or _tempfile.gettempdir()
        Path(base_dir).mkdir(parents=True, exist_ok=True)
        # Use a unique per-invocation workspace to avoid collisions across concurrent jobs
        unique_dir = _tempfile.mkdtemp(dir=base_dir, prefix="fc_")
        temp_fc_path = str(Path(unique_dir) / f"fc_input_{Path(image_path).stem}.png")
        cv2.imwrite(temp_fc_path, img)
        sanchez_path = options.get("sanchez_path")
        underlay_path = options.get("underlay_path")
        if not sanchez_path or not underlay_path:
            logger.error("sanchez_path or underlay_path not provided in options")
            shutil.rmtree(unique_dir, ignore_errors=True)
            return None
        result = ImageOperations.apply_false_color_and_read(
            temp_fc_path,
            unique_dir,
            sanchez_path,
            underlay_path,
        )
        shutil.rmtree(unique_dir, ignore_errors=True)
        if result is None:
            logger.error("False color application failed")
            return None
        return result

    @staticmethod
    def _read_image(image_path: str) -> np.ndarray | None:
        """Read an image in BGR format. IMREAD_COLOR guarantees 3 channels."""
        img = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if img is None:
            logger.error(f"Failed to read image: {image_path}")
            return None
        return img

    @staticmethod
    def process_image_subprocess(image_path: str, options: dict) -> np.ndarray | None:
        """Process a single image in a subprocess with full pipeline support.

        Applies the following steps in order (each gated by options):
        1. Read image and ensure BGR format
        2. Crop (if crop_enabled)
        3. Timestamp overlay (if add_timestamp)
        4. False color via Sanchez (if false_color_enabled)
        5. Interpolation / resize (if interpolation_enabled)
        6. Validate final dimensions
        """
        try:
            logger.debug(f"Processing {image_path} on process {multiprocessing.current_process().name}")

            img = ImageOperations._read_image(image_path)
            if img is None:
                return None

            # 2. Crop
            if options.get("crop_enabled"):
                img = ImageOperations.crop_image(
                    img,
                    options.get("crop_x", 0),
                    options.get("crop_y", 0),
                    options.get("crop_width", img.shape[1]),
                    options.get("crop_height", img.shape[0]),
                )
                if img is None or img.shape[0] == 0 or img.shape[1] == 0:
                    logger.error(f"Crop produced empty image: {image_path}")
                    return None

            # 3. Timestamp
            if options.get("add_timestamp", False):
                img = ImageOperations.add_timestamp(img, Path(image_path))

            # 4. False color
            if options.get("false_color_enabled"):
                img = ImageOperations._apply_false_color(img, image_path, options)
                if img is None:
                    return None

            # 5. Interpolation (resize)
            if options.get("interpolation_enabled"):
                img = ImageOperations._apply_interpolation(img, options)
                if img is None:
                    return None

            # 6. Validate output
            if img is None or len(img.shape) != 3 or img.shape[2] != 3:
                logger.error(f"Invalid image dimensions after processing: {image_path}")
                return None

            return img

        except Exception as e:
            logger.error(f"Error processing {image_path}: {e}", exc_info=True)
            return None

    @staticmethod
    def process_single(image_path: Path, options: dict) -> np.ndarray | None:
        """Process a single image - simplified"""
        try:
            img = cv2.imread(str(image_path))
            if img is None:
                return None

            img = img.copy()

            if options.get("crop_enabled"):
                img = ImageOperations.crop_image(
                    img,
                    options.get("crop_x", 0),
                    options.get("crop_y", 0),
                    options.get("crop_width", img.shape[1]),
                    options.get("crop_height", img.shape[0]),
                )
                if img is None or img.shape[0] == 0 or img.shape[1] == 0:
                    logger.error(f"Crop produced empty image: {image_path}")
                    return None

            return img

        except Exception as e:
            logger.error(f"Error in process_single: {e}", exc_info=True)
            return None

    @staticmethod
    def interpolate_frames(
        frame1: np.ndarray, frame2: np.ndarray, factor: int = 2, method: str = "Linear"
    ) -> list[np.ndarray]:
        """Generate interpolated frames between two frames with chosen method"""
        try:
            frames = []
            f1 = frame1.astype(np.float32)
            f2 = frame2.astype(np.float32)

            for i in range(1, factor):
                alpha = i / factor
                if method == "Linear":
                    interpolated = cv2.addWeighted(f1, 1.0 - alpha, f2, alpha, 0.0)
                elif method == "Cubic":
                    interpolated = cv2.resize(
                        f1 + (f2 - f1) * alpha,
                        None,
                        fx=1,
                        fy=1,
                        interpolation=cv2.INTER_CUBIC,
                    )
                else:
                    interpolated = cv2.addWeighted(f1, 1.0 - alpha, f2, alpha, 0.0)
                frames.append(interpolated.astype(np.uint8))

            return frames
        except Exception as e:
            logger.error(f"Error interpolating frames: {e}", exc_info=True)
            return []

    def process_images(self, image_paths: list[str | Path], options: dict) -> list[np.ndarray]:
        """Process multiple images with the given options."""
        processed = []
        for path in image_paths:
            result = self.process_image(path, options)
            if result is not None:
                processed.append(result)
        return processed

    def interpolate_frames_with_options(self, frame_paths: list[str | Path], options: dict) -> list[np.ndarray | None]:
        """Interpolate frames based on options.

        TODO(#358): wire Interpolator to actually interpolate between frames.
        Currently the interpolation_enabled branch is a no-op stub.
        """
        return [self.process_image(path, options) for path in frame_paths]


class Interpolator:
    """Handle frame interpolation."""

    def __init__(self, model_path, processing_speed):
        self.model_path = model_path
        self.processing_speed = processing_speed

    def interpolate(self, frame1, frame2, factor=2):
        # Interpolation implementation
        pass
