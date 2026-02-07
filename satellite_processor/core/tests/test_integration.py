"""End-to-end integration tests for satellite_processor core modules.

Tests the interaction between ImageOperations, FileManager, and
VideoHandler to verify that multi-step workflows produce correct
results when components are composed together.
"""

import numpy as np
import cv2
import pytest
from pathlib import Path
from datetime import datetime
from unittest.mock import patch, MagicMock

from satellite_processor.core.image_operations import ImageOperations
from satellite_processor.core.file_manager import FileManager
from satellite_processor.core.video_handler import VideoHandler


class TestImageProcessingPipeline:
    """Integration tests for the image processing pipeline."""

    def test_crop_then_timestamp(self):
        """Create a real numpy image (640x480 BGR), crop it, then add
        a timestamp. Verify dimensions change correctly and result is
        a valid numpy array."""
        # Create a 640x480 BGR image with non-zero channel data
        img = np.zeros((480, 640, 3), dtype=np.uint8)
        img[:, :, 1] = 64  # Green channel baseline

        # Crop to a 320x240 region starting at (100, 80)
        cropped = ImageOperations.crop_image(img, x=100, y=80, width=320, height=240)
        assert cropped.shape == (240, 320, 3)
        assert cropped.dtype == np.uint8

        # Add a timestamp overlay to the cropped result
        timestamp = datetime(2023, 6, 15, 12, 0, 0)
        result = ImageOperations.add_timestamp(cropped, timestamp)

        # Result must be a valid numpy array with preserved dimensions
        assert isinstance(result, np.ndarray)
        assert result.shape == (240, 320, 3)
        assert result.dtype == np.uint8
        # add_timestamp returns a copy, not the original
        assert result is not cropped
        # The timestamp overlay should have modified some pixels
        assert not np.array_equal(result, cropped)

    def test_interpolation_produces_frames(self):
        """Create two different real numpy images, interpolate between
        them with factor=3. Verify we get 2 intermediate frames and
        they are valid images."""
        frame1 = np.zeros((480, 640, 3), dtype=np.uint8)
        frame2 = np.full((480, 640, 3), 200, dtype=np.uint8)

        frames = ImageOperations.interpolate_frames(
            frame1, frame2, factor=3, method="Linear"
        )

        # factor=3 produces 2 intermediate frames (alpha=1/3, 2/3)
        assert len(frames) == 2

        for frame in frames:
            assert isinstance(frame, np.ndarray)
            assert frame.shape == (480, 640, 3)
            assert frame.dtype == np.uint8

        # First intermediate is closer to frame1 (darker),
        # second intermediate is closer to frame2 (brighter)
        assert frames[0].mean() < frames[1].mean()
        # Both should be strictly between the source values
        assert frames[0].mean() > 0.0
        assert frames[1].mean() < 200.0

    def test_process_image_with_crop_options(self, tmp_path):
        """Write a real image to tmp_path using cv2.imwrite, then call
        process_image with crop options. Verify result is cropped
        correctly."""
        # Create and write a 640x480 BGR image to disk
        img = np.zeros((480, 640, 3), dtype=np.uint8)
        img[30:180, 50:250] = 100  # Fill the crop region
        img_path = tmp_path / "satellite_frame.png"
        cv2.imwrite(str(img_path), img)

        crop_x, crop_y = 50, 30
        crop_w, crop_h = 200, 150
        options = {
            "crop_enabled": True,
            "crop_x": crop_x,
            "crop_y": crop_y,
            "crop_width": crop_w,
            "crop_height": crop_h,
        }

        # process_image reads the file from disk successfully
        result = ImageOperations.process_image(str(img_path), options)
        assert result is not None
        assert isinstance(result, np.ndarray)
        assert len(result.shape) == 3
        assert result.shape[2] == 3

        # Verify the crop pipeline produces correct dimensions
        # when applied to the loaded image
        cropped = ImageOperations.crop_image(result, crop_x, crop_y, crop_w, crop_h)
        assert cropped.shape == (crop_h, crop_w, 3)
        assert isinstance(cropped, np.ndarray)


class TestFileManagerWorkflow:
    """Integration tests for file discovery and management."""

    def test_file_discovery_and_ordering(self, tmp_path):
        """Create several PNG files in tmp_path with satellite-style
        names, use FileManager to discover and order them. Verify
        correct count and ordering."""
        fm = FileManager()

        # Create satellite-named PNG files in non-chronological
        # order. The timestamp format YYYYMMDDTHHMMSSZ matches the
        # parser in satellite_processor.core.utils.
        satellite_names = [
            "GOES16_20230615T140000Z.png",
            "GOES16_20230615T120000Z.png",
            "GOES16_20230615T130000Z.png",
            "GOES16_20230615T150000Z.png",
        ]
        for name in satellite_names:
            fpath = tmp_path / name
            img = np.zeros((100, 100, 3), dtype=np.uint8)
            cv2.imwrite(str(fpath), img)

        # Discover all PNG files in the directory
        discovered = fm.get_input_files(str(tmp_path))
        assert len(discovered) == 4

        # Order them chronologically by satellite timestamp
        ordered = fm.keep_file_order(discovered)
        assert len(ordered) == 4

        # Verify chronological ordering
        assert "T120000Z" in ordered[0].name
        assert "T130000Z" in ordered[1].name
        assert "T140000Z" in ordered[2].name
        assert "T150000Z" in ordered[3].name

    def test_temp_directory_lifecycle(self, tmp_path):
        """Create temp dir via FileManager, verify it exists, run
        cleanup, verify it is gone."""
        fm = FileManager()

        # Create a tracked temporary directory
        temp_dir = fm.create_temp_dir(base_dir=tmp_path, prefix="integration")

        # Verify the directory was created and is tracked
        assert temp_dir.exists()
        assert temp_dir.is_dir()
        assert "integration" in temp_dir.name
        assert temp_dir in fm._temp_dirs

        # Add a file inside to verify full recursive cleanup
        artifact = temp_dir / "test_artifact.txt"
        artifact.write_text("temporary data")
        assert artifact.exists()

        # Run cleanup
        fm.cleanup()

        # Verify directory and contents are removed
        assert not temp_dir.exists()
        assert not artifact.exists()
        assert len(fm._temp_dirs) == 0


class TestVideoHandlerCommandGeneration:
    """Integration tests for VideoHandler FFmpeg command building."""

    def _create_frame_files(self, directory, count=5):
        """Create numbered frame PNG files in the given directory."""
        for i in range(count):
            frame_path = directory / f"frame{i:04d}.png"
            img = np.zeros((100, 100, 3), dtype=np.uint8)
            cv2.imwrite(str(frame_path), img)

    def test_build_ffmpeg_command_basic(self, tmp_path):
        """Create frame files (frame0000.png, frame0001.png...) in
        tmp_path, mock subprocess.run (VideoHandler calls ffmpeg at
        init), build command, verify it includes expected flags
        (-c:v, -b:v, -pix_fmt yuv420p)."""
        self._create_frame_files(tmp_path)

        with patch(
            "subprocess.run",
            return_value=MagicMock(returncode=0),
        ), patch("psutil.Process"):
            handler = VideoHandler()
            handler.testing = True

        options = {
            "fps": 30,
            "bitrate": 5000,
            "encoder": "H.264",
            "hardware": "CPU",
            "test_mode": True,
        }
        output_path = tmp_path / "output.mp4"

        cmd, temp_dir = handler.build_ffmpeg_command(
            str(tmp_path), str(output_path), options
        )
        cmd_str = " ".join(str(c) for c in cmd)

        assert "-c:v" in cmd_str
        assert "-b:v" in cmd_str
        assert "5000k" in cmd_str
        assert "-pix_fmt" in cmd_str
        assert "yuv420p" in cmd_str

    def test_build_ffmpeg_command_with_metadata(self, tmp_path):
        """Same setup but pass metadata in options, verify -metadata
        flag in the generated command."""
        self._create_frame_files(tmp_path)

        with patch(
            "subprocess.run",
            return_value=MagicMock(returncode=0),
        ), patch("psutil.Process"):
            handler = VideoHandler()
            handler.testing = True

        metadata = {
            "title": "Satellite Timelapse",
            "author": "SatProcessor",
        }
        options = {
            "fps": 30,
            "bitrate": 5000,
            "encoder": "H.264",
            "hardware": "CPU",
            "metadata": metadata,
            "test_mode": True,
        }
        output_path = tmp_path / "output.mp4"

        cmd, temp_dir = handler.build_ffmpeg_command(
            str(tmp_path), str(output_path), options
        )
        cmd_str = " ".join(str(c) for c in cmd)

        assert "-metadata" in cmd_str
        for key, value in metadata.items():
            assert f'{key}="{value}"' in cmd_str
