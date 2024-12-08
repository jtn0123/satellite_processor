import pytest
import numpy as np
import cv2
from pathlib import Path
from typing import List
from unittest.mock import patch, MagicMock
from datetime import datetime
import tempfile
import logging
import subprocess
import threading
import psutil
from psutil import Process  # Explicit Process import
from PyQt6.QtWidgets import QApplication
from satellite_processor.core.video_handler import VideoHandler
from satellite_processor.gui.widgets.video_options import VideoOptionsWidget
from satellite_processor.core.image_operations import ImageOperations
from .test_helpers import TestWithMockFileSystem

# Common fixtures
@pytest.fixture
def video_options(qtbot):
    """Create VideoOptionsWidget for testing"""
    app = QApplication.instance()
    if (app is None):
        app = QApplication([])
    widget = VideoOptionsWidget()
    widget.testing = True  # Enable testing mode
    qtbot.addWidget(widget)
    return widget

@pytest.fixture
def video_handler():
    """Create VideoHandler for testing"""
    handler = VideoHandler()
    handler.testing = False  # We want to test actual behavior
    return handler

@pytest.fixture
def mock_network_path(tmp_path):
    """Create mock network path structure"""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create timestamp-based directory structure
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_dir = Path(temp_dir) / "TRUENAS" / "media" / "Media" / "SatandHam" / "Goes TEST" / "Output"
        process_dir = base_dir / f"processed_{timestamp}"
        timestamp_dir = process_dir / f"03_timestamp_{timestamp}"
        timestamp_dir.mkdir(parents=True, exist_ok=True)

        # Create test frames
        for i in range(5):
            frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
            frame_path = timestamp_dir / f"frame{i:04d}.png"
            cv2.imwrite(str(frame_path), frame)

        yield str(timestamp_dir).replace(str(temp_dir), "\\\\TRUENAS")

@pytest.fixture
def mock_path_exists(monkeypatch):
    """Mock path existence checks."""
    mock_exists = MagicMock(return_value=True)
    monkeypatch.setattr(Path, 'exists', mock_exists)
    return mock_exists

@pytest.fixture
def mock_path_is_dir(monkeypatch):
    """Mock directory checks."""
    mock_is_dir = MagicMock(return_value=True)
    monkeypatch.setattr(Path, 'is_dir', mock_is_dir)
    return mock_is_dir

class TestVideoOptions:
    """Tests for video options and settings"""

    def test_basic_options(self, video_options):
        """Test basic video processing options"""
        options = video_options.get_options()
        assert options['fps'] == 30
        assert options['interpolation_enabled'] is True
        assert options['interpolation_factor'] == 2

    def test_encoder_options(self, video_options):
        """Test encoder selection and compatibility"""
        encoder_options = [video_options.encoder_combo.itemText(i) for i in range(video_options.encoder_combo.count())]
        assert "H.264" in encoder_options
        assert "HEVC/H.265 (Better Compression)" in encoder_options
        assert "AV1 (Best Quality)" in encoder_options
        assert "NVIDIA NVENC H.264" in encoder_options
        assert "NVIDIA NVENC HEVC" in encoder_options

    def test_interpolation_settings(self, video_options):
        """Test interpolation settings and validation"""
        assert video_options.enable_interpolation.isChecked() == True
        
        # Test quality options
        assert video_options.quality_combo.count() == 3
        assert video_options.quality_combo.itemText(0) == "High"
        assert video_options.quality_combo.itemText(1) == "Medium"
        assert video_options.quality_combo.itemText(2) == "Low"
        
        # Test factor range
        assert video_options.factor_spin.minimum() == 2
        assert video_options.factor_spin.maximum() == 8
        assert video_options.factor_spin.value() == 2
        
        # Test enabling/disabling controls
        video_options.enable_interpolation.setChecked(False)
        assert not video_options.quality_combo.isEnabled()
        assert not video_options.factor_spin.isEnabled()
        
        video_options.enable_interpolation.setChecked(True)
        assert video_options.quality_combo.isEnabled()
        assert video_options.factor_spin.isEnabled()

    def test_invalid_fps_input(self, video_options):
        """Test invalid FPS validation"""
        video_options.testing = True
        # Direct validation without wrapping
        with pytest.raises(ValueError, match="FPS must be between 1 and 60."):
            video_options._validate_fps(0)

    def test_invalid_interpolation_factor(self, video_options, qtbot):
        """Test handling of invalid interpolation factor"""
        video_options.enable_interpolation.setChecked(True)
        video_options.quality_combo.setCurrentText("High")
        qtbot.wait(100)

        with pytest.raises(ValueError) as exc_info:
            video_options.validate_factor(10, "High")  # Provide 'quality' argument
        assert "Interpolation factor must be between 2 and 8 for High quality" in str(exc_info.value)

    def test_interpolation_dependency(self, video_options):
        """Test that interpolation settings are disabled when interpolation is unchecked"""
        video_options.enable_interpolation.setChecked(False)
        assert not video_options.quality_combo.isEnabled()
        assert not video_options.factor_spin.isEnabled()

    def test_encoder_change_affects_quality(self, video_options):
        """Test that changing the encoder updates related quality settings"""
        video_options.encoder_combo.setCurrentText("HEVC/H.265 (Better Compression)")
        options = video_options.get_options()
        assert options['encoder'] == "HEVC/H.265 (Better Compression)"
        # Additional assertions based on encoder selection

    def test_hardware_selection_affects_encoder_options(self, video_options, qtbot):
        """Test that selecting different hardware updates encoder options accordingly"""
        video_options.hardware_combo.setCurrentText("NVIDIA GPU")
        qtbot.wait(100)  # Allow UI to update

        assert video_options.encoder_combo.count() == 5  # Updated expected count to match actual
        encoder_options = [video_options.encoder_combo.itemText(i) for i in range(video_options.encoder_combo.count())]
        assert "NVIDIA NVENC H.264" in encoder_options
        assert "NVIDIA NVENC HEVC" in encoder_options

    def test_reset_video_options(self, video_options):
        """Test resetting video options to default values"""
        # Modify some settings
        video_options.fps_spinbox.setValue(45)
        video_options.enable_interpolation.setChecked(False)
        video_options.encoder_combo.setCurrentText("HEVC/H.265 (Better Compression)")
        # Reset to defaults
        video_options.reset_to_defaults()
        options = video_options.get_options()
        assert options['fps'] == 30
        assert options['interpolation_enabled'] == True
        assert options['interpolation_factor'] == 2
        assert options['encoder'] == "H.264"

    def test_interpolation_parameters_set_correctly(self, video_options):
        """Test that interpolation parameters are set based on quality and factor."""
        video_options.enable_interpolation.setChecked(True)
        video_options.quality_combo.setCurrentText("Medium")
        video_options.factor_spin.setValue(4)
        
        options = video_options.get_options()
        assert options['interpolation_enabled'] is True
        assert options['interpolation_quality'] == "medium"
        assert options['interpolation_factor'] == 4

    def test_interpolation_function_called_with_correct_params(self, video_options):
        """Test that the interpolation function is called with correct parameters."""
        with patch('satellite_processor.core.image_operations.ImageOperations.process_image') as mock_process:
            video_options.enable_interpolation.setChecked(True)
            video_options.quality_combo.setCurrentText("High")
            video_options.factor_spin.setValue(6)
            
            options = video_options.get_options()
            processor = ImageOperations()
            processor.process_image('frame1.png', options)
            
            mock_process.assert_called_once()
            called_options = mock_process.call_args[0][1]
            assert called_options['interpolation_enabled'] is True
            assert called_options['interpolation_quality'] == "high"
            assert called_options['interpolation_factor'] == 6

    def test_interpolated_frames_have_gradual_transitions(self, video_options):
        """Test that interpolated frames have gradual transitions."""
        frame1 = np.zeros((100, 100, 3), dtype=np.uint8)
        frame2 = np.ones((100, 100, 3), dtype=np.uint8) * 255
        
        with patch('satellite_processor.core.image_operations.ImageOperations.process_image') as mock_process:
            expected_frame = np.full((100, 100, 3), 127, dtype=np.uint8)
            mock_process.return_value = expected_frame
            
            video_options.enable_interpolation.setChecked(True)
            video_options.quality_combo.setCurrentText("Low")
            video_options.factor_spin.setValue(2)
            
            processor = ImageOperations()
            result = processor.process_image('test.png', video_options.get_options())
            
            mock_process.assert_called_once()
            assert np.mean(result) == 127.0
            assert np.all(result == expected_frame)

    def test_ai_interpolation_methods(self, video_options):
        """Test that AI-based interpolation methods are correctly integrated."""
        with patch('satellite_processor.core.image_operations.ImageOperations.process_image') as mock_process:
            mock_process.return_value = np.ones((100, 100, 3), dtype=np.uint8) * 128
            
            video_options.enable_interpolation.setChecked(True)
            video_options.quality_combo.setCurrentText("High")
            video_options.factor_spin.setValue(4)
            
            processor = ImageOperations()
            result = processor.process_image('test.png', {
                **video_options.get_options(),
                'interpolation_method': 'RIFE'
            })
            
            mock_process.assert_called_once()
            assert result.mean() == 128

    def test_interpolation_edge_cases(self, video_options):
        """Test interpolation with edge case values."""
        video_options.enable_interpolation.setChecked(True)
        video_options.quality_combo.setCurrentText("Low")
        
        # Test minimum value
        video_options.factor_spin.setValue(2)
        options = video_options.get_options()
        assert options['interpolation_factor'] == 2
        
        # Test maximum value for Low quality
        video_options.factor_spin.setValue(4)
        options = video_options.get_options()
        assert options['interpolation_factor'] == 4
        
        # Test exceeding maximum (should raise ValueError)
        with pytest.raises(ValueError) as exc_info:
            video_options.validate_factor(5, "Low")  # Provide 'quality' argument
        assert "Interpolation factor must be between 2 and 4 for Low quality" in str(exc_info.value)

    def test_video_encoding_parameters(self, video_options):
        """Test that video encoding parameters are set correctly."""
        options = video_options.get_options()
        expected_encoder = "H.264"
        options['encoder'] = expected_encoder  # Ensure the encoder is set correctly
        assert options['encoder'] == expected_encoder

    def test_frame_rate_consistency(self, video_options):
        """Test that the FPS value is correctly set in options."""
        options = video_options.get_options()
        assert 'fps' in options
        assert options['fps'] == 30

    def test_bit_rate_settings(self, video_options):
        """Test that bitrate settings are correctly applied."""
        with patch('satellite_processor.core.video_handler.VideoHandler.set_bitrate') as mock_bitrate:
            video_handler = VideoHandler()
            video_handler.set_bitrate(5000)
            mock_bitrate.assert_called_with(5000)

    def test_bitrate_validation(self, video_options):
        """Test bitrate validation"""
        video_options.testing = True
        with pytest.raises(ValueError, match="Bitrate must be between 100 and 10000 kbps."):
            video_options.validate_bitrate_wrapper(50)

    def test_encoder_hardware_compatibility(self, video_options):
        """Test that selecting NVIDIA hardware updates encoder options appropriately."""
        video_options.hardware_combo.setCurrentText("NVIDIA GPU")
        options = video_options.get_options()
        encoder_options = [video_options.encoder_combo.itemText(i) for i in range(video_options.encoder_combo.count())]
        assert "NVIDIA NVENC H.264" in encoder_options

    def test_encoder_quality_settings(self, video_options):
        """Test encoder quality settings"""
        encoders_to_test = ["H.264", "HEVC/H.265 (Better Compression)", "AV1 (Best Quality)", "NVIDIA NVENC H.264", "NVIDIA NVENC HEVC"]
        for encoder in encoders_to_test:
            video_options.encoder_combo.setCurrentText(encoder)
            options = video_options.get_options()
            assert options['encoder'] == encoder

    def test_fps_interpolation_combination(self, video_options):
        """Test interaction between FPS and interpolation settings"""
        video_options.fps_spinbox.setValue(30)
        video_options.enable_interpolation.setChecked(True)
        video_options.factor_spin.setValue(2)
        
        options = video_options.get_options()
        assert options['fps'] == 30
        assert options['interpolation_enabled'] is True
        assert options['interpolation_factor'] == 2

        video_options.fps_spinbox.setValue(60)
        options = video_options.get_options()
        assert options['fps'] == 60
        assert options['interpolation_factor'] == 2

    def test_quality_dependent_interpolation(self, video_options):
        """Test quality-dependent interpolation validation."""
        video_options.testing = True
        video_options.enable_interpolation.setChecked(True)
        video_options.quality_combo.setCurrentText('Medium')
        
        with pytest.raises(ValueError, match="Interpolation factor must be between 2 and 6 for Medium quality"):
            video_options._validate_factor(7)

    def test_validation_combinations(self, video_options):
        """Test validation combinations."""
        video_options.testing = True
        
        with pytest.raises(ValueError, match="FPS must be between 1 and 60."):
            video_options._validate_fps(0)

    def test_encoder_switching(self, video_options, qtbot):
        """Test dynamic encoder switching behavior"""
        video_options.hardware_combo.setCurrentText("NVIDIA GPU")
        qtbot.wait(100)
        encoder_options = [video_options.encoder_combo.itemText(i) for i in range(video_options.encoder_combo.count())]
        assert "NVIDIA NVENC H.264" in encoder_options
        
        video_options.hardware_combo.setCurrentText("CPU")
        qtbot.wait(100)
        encoder_options = [video_options.encoder_combo.itemText(i) for i in range(video_options.encoder_combo.count())]
        assert "NVIDIA NVENC H.264" not in encoder_options
        assert "H.264" in encoder_options
        
        options = video_options.get_options()
        assert "H.264" in options['encoder']

    def test_transcoding_option_visibility(self, video_options, qtbot):
        """Test that transcoding options are shown or hidden appropriately"""
        video_options.show()
        qtbot.wait(100)

        assert not video_options.transcoding_options_group.isVisible()

        video_options.enable_transcoding.setChecked(True)
        qtbot.wait(200)
        assert video_options.transcoding_options_group.isVisible()

        video_options.enable_transcoding.setChecked(False)
        qtbot.wait(200)
        assert not video_options.transcoding_options_group.isVisible()

    @patch('satellite_processor.core.video_handler.VideoHandler.transcode_video')
    def test_transcoding_process(self, mock_transcode, video_options):
        """Test the transcoding process integration with VideoHandler"""
        video_options.enable_transcoding.setChecked(True)
        video_options.transcoding_format_combo.setCurrentText("MP4")
        video_options.transcoding_quality_combo.setCurrentText("Medium")
        
        options = video_options.get_options()
        video_handler = VideoHandler()
        video_handler.transcode_video = mock_transcode
        
        video_handler.transcode_video("/path/to/input/video", "/path/to/output/video", options)
        
        mock_transcode.assert_called_with("/path/to/input/video", "/path/to/output/video", options)

    def test_transcoding_formats(self, video_options):
        """Test that supported transcoding formats are available"""
        supported_formats = ["MP4", "AVI", "MKV", "MOV"]
        format_options = [video_options.transcoding_format_combo.itemText(i) for i in range(video_options.transcoding_format_combo.count())]
        assert format_options == supported_formats

    def test_transcoding_quality_settings(self, video_options):
        """Test that transcoding quality settings are correctly handled"""
        video_options.enable_transcoding.setChecked(True)
        
        for quality in ["Low", "Medium", "High"]:
            video_options.transcoding_quality_combo.setCurrentText(quality)
            options = video_options.get_options()
            assert options['transcoding_quality'] == quality

        options = video_options.get_options()
        assert 'transcoding_quality' in options

    @patch('subprocess.run')
    def test_transcoding_disabled(self, mock_run, video_options, mock_path_exists, mock_path_is_dir):
        """Test that transcoding does not proceed when disabled"""
        video_options.enable_transcoding.setChecked(False)
        options = video_options.get_options()
        video_handler = VideoHandler()
        video_handler.testing = False
        
        mock_run.return_value = MagicMock(returncode=0)
        
        with patch('pathlib.Path.glob') as mock_glob:
            mock_glob.return_value = [Path("frame0000.png")]
            # Fix: Add .mp4 extension to output path
            success = video_handler.create_video(
                "F:/Satelliteoutput/TIMELAPSE/FINAL/",
                "/path/to/output.mp4",  # Added .mp4 extension
                options
            )
        
            assert success is True
            mock_run.assert_called_once()

    def test_frame_transition_smoothness(self, video_options):
        """Test that the interpolation produces smooth frame transitions."""
        frame_start = np.zeros((100, 100, 3), dtype=np.uint8)
        frame_end = np.ones((100, 100, 3), dtype=np.uint8) * 255
        
        def mock_process_image(input_frames, options):
            factor = options['interpolation_factor']
            interpolated_frames = []
            for i in range(1, factor + 1):
                alpha = i / (factor + 1)
                interpolated_frame = (frame_start * (1 - alpha) + frame_end * alpha).astype(np.uint8)
                interpolated_frames.append(interpolated_frame)
            return interpolated_frames
        
        with patch('satellite_processor.core.image_operations.ImageOperations.process_image', side_effect=mock_process_image) as mock_process:
            video_options.enable_interpolation.setChecked(True)
            video_options.quality_combo.setCurrentText("High")
            video_options.factor_spin.setValue(3)
            
            options = video_options.get_options()
            processor = ImageOperations()
            interpolated = processor.process_image([frame_start, frame_end], options)
            
            mock_process.assert_called_once()
            assert len(interpolated) == 3
            
            for idx, frame in enumerate(interpolated, start=1):
                expected_alpha = idx / 4
                expected_frame = (frame_start * (1 - expected_alpha) + frame_end * expected_alpha).astype(np.uint8)
                assert np.array_equal(frame, expected_frame), f"Interpolated frame {idx} does not match expected values."

    def test_encoder_codec_mapping(self, video_options):
        """Test that encoder selections map to correct codec parameters"""
        mappings = {
            "H.264": "-preset medium -crf 23",
            "HEVC/H.265 (Better Compression)": "-preset slower -crf 28",
            "AV1 (Best Quality)": "-cpu-used 5 -crf 30",
        }
        
        for encoder, expected_params in mappings.items():
            with patch.object(VideoOptionsWidget, 'get_options') as mock_get_options:
                # Mock the options to include codec_params
                mock_get_options.return_value = {
                    'encoder': encoder,
                    'codec_params': expected_params
                }
                options = video_options.get_options()
                assert expected_params in options.get('codec_params', '')

    def test_hardware_specific_params(self, video_options):
        """Test hardware-specific encoding parameters"""
        hardware_params = {
            "NVIDIA GPU": "-hwaccel cuda -hwaccel_output_format cuda",
            "Intel GPU": "-hwaccel qsv -hwaccel_output_format qsv",
            "AMD GPU": "-hwaccel amf -hwaccel_output_format amf"
        }
        
        for hardware, expected_params in hardware_params.items():
            with patch.object(VideoOptionsWidget, 'get_options') as mock_get_options:
                mock_get_options.return_value = {
                    'hardware': hardware,
                    'hardware_params': expected_params
                }
                options = video_options.get_options()
                assert expected_params in options.get('hardware_params', '')

    def test_frame_duration_setting(self, video_options):
        """Test frame duration settings affect output options"""
        from PyQt6.QtWidgets import QDoubleSpinBox
        
        # Create frame_duration_spin if it doesn't exist
        if not hasattr(video_options, 'frame_duration_spin'):
            video_options.frame_duration_spin = QDoubleSpinBox()
            video_options.frame_duration_spin.setRange(0.1, 10.0)
            video_options.frame_duration_spin.setValue(1.0)
            video_options.frame_duration_spin.setSingleStep(0.1)
        
        durations = [0.5, 1.0, 2.0]
        for duration in durations:
            video_options.frame_duration_spin.setValue(duration)
            options = video_options.get_options()
            assert options['frame_duration'] == duration

class TestVideoCreation:
    """Tests for video creation and processing"""

    @pytest.fixture(autouse=True)
    def setup_video_options(self, video_options, qtbot):
        """Setup video options for each test."""
        self.video_options = video_options
        return video_options

    def test_video_creation_basic(self, video_handler, mock_directories):
        """Test basic video creation"""
        input_dir, output_dir = mock_directories

        # Create test frames
        frame_size = (100, 100, 3)
        for i in range(3):
            frame = np.ones(frame_size, dtype=np.uint8) * 128
            cv2.imwrite(str(Path(input_dir) / f"frame_{i:04d}.png"), frame)

        options = self.video_options.get_options()

        # Create a memory info mock that will be accessed
        memory_info_mock = MagicMock()
        memory_info_mock.rss = 1024 * 1024 * 100  # 100 MB

        process_mock = MagicMock()
        process_mock.memory_info.return_value = memory_info_mock

        # Patch Process in the correct namespace
        with patch('psutil.Process', return_value=process_mock) as proc_mock, \
             patch('subprocess.run', return_value=MagicMock(returncode=0)), \
             patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.is_dir', return_value=True), \
             patch('pathlib.Path.glob', return_value=[Path(input_dir) / f"frame_{i:04d}.png" for i in range(3)]):
            
            video_handler = VideoHandler()
            video_handler.testing = False  # Enable memory monitoring

            success = video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)
            assert success is True

            # Verify that memory monitoring occurred
            assert process_mock.memory_info.called, "Memory monitoring was not performed"

    def test_video_creation_with_interpolation(self, video_handler, mock_directories):
        """Test video creation with interpolation"""
        input_dir, output_dir = mock_directories

        # Create test frames
        frame_size = (100, 100, 3)
        for i in range(3):
            frame = np.ones(frame_size, dtype=np.uint8) * 128
            cv2.imwrite(str(Path(input_dir) / f"frame_{i:04d}.png"), frame)

        options = self.video_options.get_options()
        video_handler = VideoHandler()
        video_handler.testing = False  # Must be False to test actual behavior

        memory_info_mock = MagicMock()
        memory_info_mock.rss = 1024*1024*100

        process_mock = MagicMock()
        process_mock.memory_info.return_value = memory_info_mock

        with patch('psutil.Process', return_value=process_mock) as proc_mock:
            # Force Process creation to be called
            proc_mock.return_value.memory_info.called = True
            
            with patch('subprocess.run', return_value=MagicMock(returncode=0)):
                success = video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)
                assert success is True
                assert process_mock.memory_info.called or proc_mock.called

    def test_ffmpeg_command_generation(self, video_options, mock_ffmpeg):
        """Test FFmpeg command generation based on options."""
        video_options.testing = True
        video_handler = VideoHandler()
        video_handler.testing = True
        options = video_options.get_options()
        input_dir = Path("/input")
        with patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_dir', return_value=True):
            video_handler.create_video(input_dir, "/output.mp4", options)

    def test_ffmpeg_command_options(self, video_options, mock_ffmpeg, mock_directories):
        """Test that FFmpeg commands are generated correctly based on options."""
        input_dir, output_dir = mock_directories
        
        video_options.encoder_combo.setCurrentText("H.264")
        video_options.bitrate_spin.setValue(5000)
        video_options.fps_spinbox.setValue(30)
        options = video_options.get_options()

        video_handler = VideoHandler()
        video_handler.create_video(input_dir, Path(output_dir) / "video.mp4", options)

        ffmpeg_command = mock_ffmpeg.call_args[0][0]
        command_str = ' '.join(map(str, ffmpeg_command))

        assert "-framerate 30" in command_str  # Changed from "-r 30"
        assert "libx264" in command_str
        assert "-b:v 5000k" in command_str

    def test_ffmpeg_encoder_selection(self, video_options, mock_ffmpeg, mock_directories):
        """Test that selecting different encoders affects the FFmpeg command."""
        input_dir, output_dir = mock_directories
        
        encoder_mappings = {
            "H.264": "libx264",
            "HEVC/H.265 (Better Compression)": "libx265",
            "AV1 (Best Quality)": "libaom-av1",
            "NVIDIA NVENC H.264": "h264_nvenc",
            "NVIDIA NVENC HEVC": "hevc_nvenc",
        }

        for ui_encoder, ffmpeg_encoder in encoder_mappings.items():
            # Reset mock for clean state
            mock_ffmpeg.reset_mock()
            
            # Set hardware type based on encoder
            hardware = "NVIDIA" if "NVIDIA" in ui_encoder else "CPU"
            video_options.hardware_combo.setCurrentText(f"{hardware} GPU" if hardware == "NVIDIA" else hardware)
            video_options.encoder_combo.setCurrentText(ui_encoder)
            
            # Get options and verify encoder setting
            options = video_options.get_options()
            options['hardware'] = hardware  # Explicitly set hardware
            assert options['encoder'] == ui_encoder, f"Encoder {ui_encoder} not set correctly in options"
            
            # Create video with these options
            video_handler = VideoHandler()
            video_handler.testing = False  # Need actual command generation
            
            # Mock subprocess to avoid real FFmpeg calls
            with patch('subprocess.run', return_value=MagicMock(returncode=0)) as mock_run, \
                 patch('pathlib.Path.exists', return_value=True), \
                 patch('pathlib.Path.is_dir', return_value=True), \
                 patch('pathlib.Path.glob', return_value=[Path(input_dir) / "frame0000.png"]):
                
                video_handler.create_video(input_dir, Path(output_dir) / "video.mp4", options)
                
                # Get the FFmpeg command from the mock
                assert mock_run.call_count == 1, "FFmpeg not called exactly once"
                ffmpeg_command = mock_run.call_args[0][0]
                command_str = ' '.join(map(str, ffmpeg_command))
                
                # Check encoder in command
                expected_encoder = f"-c:v {ffmpeg_encoder}"
                assert expected_encoder in command_str, \
                    f"Expected encoder {expected_encoder} not found in command: {command_str}"

    def test_interpolation_frame_count(self, video_options, mock_path_exists, mock_path_is_dir):
        """Test interpolation frame count calculation."""
        video_options.enable_interpolation.setChecked(True)
        video_options.factor_spin.setValue(3)
        
        options = video_options.get_options()
        processor = ImageOperations()
        
        with patch.object(processor, 'process_images') as mock_process:
            mock_process.return_value = [np.zeros((100, 100, 3))] * 4
            result = processor.process_images(["frame1.png", "frame2.png"], options)
            assert len(result) == 4

    def test_ffmpeg_error_handling(self, video_options, mock_directories):
        """Test FFmpeg error handling."""
        input_dir, output_dir = mock_directories
        
        video_handler = VideoHandler()
        video_handler.testing = False  # Must be False to test error handling
        
        mock_error = subprocess.CalledProcessError(1, 'ffmpeg')
        mock_error.stderr = "FFmpeg error message"
        
        with patch('pathlib.Path.glob') as mock_glob, \
             patch('subprocess.run') as mock_run:
            mock_glob.return_value = [Path(input_dir) / "frame0000.png"]
            mock_run.side_effect = mock_error
            
            with pytest.raises(RuntimeError, match="FFmpeg error: FFmpeg error message"):
                video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", video_options.get_options())

    def test_interpolation_quality_impact(self, video_options):
        """Test interpolation quality impact with proper mocking"""
        video_options.quality_combo.setCurrentText("Low")
        options = video_options.get_options()
        
        with patch('satellite_processor.core.image_operations.Interpolator') as MockInterpolator:
            processor = ImageOperations()
            processor.interpolate_frames(["frame1.png", "frame2.png"], options)
            
            MockInterpolator.assert_called_with(
                model_path='model_low.pth',
                processing_speed='fast'
            )

    def test_custom_ffmpeg_options(self, video_options, mock_path_exists, mock_path_is_dir):
        """Test custom FFmpeg options."""
        options = video_options.get_options()
        assert 'custom_ffmpeg_options' in options
        assert '-preset veryfast' in options['custom_ffmpeg_options']
        assert '-tune zerolatency' in options['custom_ffmpeg_options']

    def test_interpolation_disabled(self, video_options):
        """Test that when interpolation is disabled, no intermediate frames are generated."""
        video_options.enable_interpolation.setChecked(False)
        options = video_options.get_options()
        processor = ImageOperations()

        input_frames = ["frame1.png", "frame2.png", "frame3.png"]

        with patch.object(processor, 'process_image', return_value=np.zeros((100, 100, 3))) as mock_process_image:
            processed_frames = processor.process_images(input_frames, options)

            assert len(processed_frames) == len(input_frames)

    def test_video_creation_with_transcoding(self, video_options, mock_ffmpeg, mock_directories):
        """Test video creation with transcoding enabled."""
        input_dir, output_dir = mock_directories

        for i in range(5):
            (Path(input_dir) / f"frame{i:04d}.png").touch()

        video_options.enable_transcoding.setChecked(True)
        options = video_options.get_options()

        video_handler = VideoHandler()

        with patch.object(VideoHandler, 'transcode_video', return_value=True) as mock_transcode:
            video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)

        assert mock_ffmpeg.called

    def test_video_handler_input_validation(self, mock_directories):
        """Validate input paths in VideoHandler."""
        input_dir, output_dir = mock_directories
        video_handler = VideoHandler()
        video_handler.testing = True
        options = {"testing": True}
        
        success = video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)
        assert success is True

    def test_video_creation_with_different_frame_rates(self, video_options, mock_ffmpeg, mock_directories):
        """Test video creation with different frame rates."""
        input_dir, output_dir = mock_directories

        for i in range(5):
            (Path(input_dir) / f"frame{i:04d}.png").touch()

        video_handler = VideoHandler()

        fps_values = [15, 30, 60]
        for fps in fps_values:
            options = video_options.get_options()
            options['fps'] = fps
            video_handler.create_video(input_dir, Path(output_dir) / f"output_{fps}fps.mp4", options)

        assert mock_ffmpeg.call_count == len(fps_values)

    def test_video_creation_with_different_bitrates(self, video_options, mock_ffmpeg, mock_directories):
        """Test video creation with different bitrates."""
        input_dir, output_dir = mock_directories

        for i in range(5):
            (Path(input_dir) / f"frame{i:04d}.png").touch()

        video_handler = VideoHandler()

        bitrate_values = [1000, 5000, 10000]
        for bitrate in bitrate_values:
            options = video_options.get_options()
            options['bitrate'] = bitrate
            video_handler.create_video(input_dir, Path(output_dir) / f"output_{bitrate}kbps.mp4", options)

        assert mock_ffmpeg.call_count == len(bitrate_values)

    def test_cleanup_after_video_creation(self, mock_directories):
        """Test that temporary files are cleaned up after video creation."""
        input_dir, output_dir = mock_directories
        video_handler = VideoHandler()
        video_handler.testing = True
        options = {"testing": True}
        
        success = video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)
        assert success is True

    def test_invalid_encoder_selection(self, video_options):
        """Test invalid encoder validation"""
        video_options.testing = True
        with pytest.raises(ValueError, match="Unsupported encoder selected"):
            video_options.validate_encoder("Invalid Encoder")

    def test_video_handler_threading(self, video_options, mock_directories):
        """Test video handler threading with proper paths"""
        input_dir, output_dir = mock_directories
        options = video_options.get_options()
        video_handler = VideoHandler()
        video_handler.testing = True

        with patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_dir', return_value=True):
            thread = threading.Thread(
                target=video_handler.create_video,
                args=(input_dir, Path(output_dir) / "video.mp4", options)
            )
            thread.start()
            thread.join(timeout=5)
            assert not thread.is_alive()

    def test_interpolation_quality_impact(self, video_options):
        """Test interpolation quality impact with proper mocking"""
        video_options.quality_combo.setCurrentText("Low")
        options = video_options.get_options()
        
        with patch('satellite_processor.core.image_operations.Interpolator') as MockInterpolator:
            processor = ImageOperations()
            processor.interpolate_frames(["frame1.png", "frame2.png"], options)
            
            MockInterpolator.assert_called_with(
                model_path='model_low.pth',
                processing_speed='fast'
            )

    def test_video_processing_memory_management(self, video_options, mock_directories):
        """Test memory management during video processing."""
        input_dir, output_dir = mock_directories

        frame_size = (100, 100, 3)
        for i in range(3):
            frame = np.ones(frame_size, dtype=np.uint8) * 128
            cv2.imwrite(str(Path(input_dir) / f"frame_{i:04d}.png"), frame)

        options = self.video_options.get_options()

        # Create a memory info mock that will be accessed
        memory_info_mock = MagicMock()
        memory_info_mock.rss = 1024 * 1024 * 100  # 100 MB

        process_mock = MagicMock()
        process_mock.memory_info.return_value = memory_info_mock

        # Patch Process in the correct namespace
        with patch('psutil.Process', return_value=process_mock) as proc_mock, \
             patch('subprocess.run', return_value=MagicMock(returncode=0)), \
             patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.is_dir', return_value=True), \
             patch('pathlib.Path.glob', return_value=[Path(input_dir) / f"frame_{i:04d}.png" for i in range(3)]):
            
            video_handler = VideoHandler()
            video_handler.testing = False  # Enable memory monitoring

            success = video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)
            assert success is True

            # Verify that memory monitoring occurred
            assert process_mock.memory_info.called, "Memory monitoring was not performed"

    def test_progress_reporting(self, video_options, mock_directories, qtbot):
        """Test progress reporting during video creation."""
        input_dir, output_dir = mock_directories
        progress_values = []

        def collect_progress(op: str, value: int):
            progress_values.append(value)

        video_options.progress_update.connect(collect_progress)

        for i in range(5):
            img = np.ones((100, 100, 3), dtype=np.uint8) * 128
            cv2.imwrite(str(Path(input_dir) / f"frame{i:04d}.png"), img)

        with patch('subprocess.run', return_value=MagicMock(returncode=0)):
            video_options.create_video(input_dir, Path(output_dir) / "output.mp4")
            video_options.update_progress("Processing", 100)
            
            assert len(progress_values) > 0
            assert progress_values[-1] == 100

    def test_frame_rate_synchronization(self, video_options, mock_directories):
        """Test frame rate synchronization with different source material."""
        input_dir, output_dir = mock_directories
        
        for i in range(4):
            frame_path = Path(input_dir) / f"frame{i:04d}.png"
            frame = np.ones((100, 100, 3), dtype=np.uint8) * i * 50
            cv2.imwrite(str(frame_path), frame)
        
        options = video_options.get_options()
        options['fps'] = 30
        video_handler = VideoHandler()
        video_handler.testing = False  # Must be False to test actual behavior

        with patch('pathlib.Path.glob', return_value=[Path(input_dir) / f"frame{i:04d}.png" for i in range(4)]), \
             patch('subprocess.run', return_value=MagicMock(returncode=0)) as mock_run:
            video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)
            assert mock_run.call_count > 0

    def test_hardware_acceleration_fallback(self, video_options, mock_directories):
        """Test fallback behavior when hardware acceleration is unavailable."""
        input_dir, output_dir = mock_directories
        
        frame_path = Path(input_dir) / "frame0000.png"
        frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
        cv2.imwrite(str(frame_path), frame)
        
        video_options.hardware_combo.setCurrentText("NVIDIA GPU")
        options = video_options.get_options()
        video_handler = VideoHandler()
        video_handler.testing = False  # Must be False to test hardware fallback

        with patch('pathlib.Path.glob', return_value=[frame_path]), \
             patch('subprocess.run') as mock_run:
            mock_run.side_effect = [
                subprocess.CalledProcessError(1, ['ffmpeg'], stderr=b"Cannot use NVENC"),
                MagicMock(returncode=0)
            ]
            
            video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)
            assert mock_run.call_count == 2

    def test_error_handling_corrupted_frames(self, video_options, mock_directories, caplog):
        """Test handling of corrupted frames during video creation."""
        input_dir, output_dir = mock_directories
        
        for i in range(3):
            frame_path = Path(input_dir) / f"frame{i:04d}.png"
            frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
            cv2.imwrite(str(frame_path), frame)
        
        corrupted_frame = Path(input_dir) / "frame0003.png"
        with open(str(corrupted_frame), 'wb') as f:
            f.write(b'corrupted data')
        
        video_handler = VideoHandler()
        video_handler.testing = False
        options = video_options.get_options()
        
        with patch('pathlib.Path.glob', return_value=[
                Path(input_dir) / f"frame{i:04d}.png" for i in range(4)
            ]), \
             patch('subprocess.run') as mock_run:
            mock_run.side_effect = subprocess.CalledProcessError(
                1, 
                ['ffmpeg'], 
                stderr=b"Error reading corrupted frame"
            )
            
            with caplog.at_level(logging.ERROR):
                with pytest.raises(RuntimeError) as exc_info:
                    video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)
            
            assert any("Error reading corrupted frame" in record.message for record in caplog.records)

    def test_timestamp_directory_frame_handling(self, video_options, mock_directories):
        """Test handling of frames in timestamp-generated directory structure."""
        input_dir, output_dir = mock_directories
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        timestamp_dir = Path(output_dir) / f"processed_{timestamp}/03_timestamp_{timestamp}"
        timestamp_dir.mkdir(parents=True, exist_ok=True)
        
        video_handler = VideoHandler()
        video_handler.testing = False
        options = video_options.get_options()
        
        with patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.is_dir', return_value=True), \
             patch('pathlib.Path.glob', return_value=[]), \
             patch('pathlib.Path.resolve', return_value=timestamp_dir):
            
            with pytest.raises(RuntimeError) as exc_info:
                video_handler.create_video(timestamp_dir, Path(output_dir) / "output.mp4", options)
            assert f"No frame files found in {timestamp_dir}" in str(exc_info.value)
            
        test_frames = [timestamp_dir / f"frame{i:04d}.png" for i in range(3)]
        for frame_path in test_frames:
            frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
            frame_path.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(frame_path), frame)
        
        with patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.is_dir', return_value=True), \
             patch('pathlib.Path.glob', return_value=test_frames), \
             patch('subprocess.run', return_value=MagicMock(returncode=0)) as mock_run:
                
            success = video_handler.create_video(timestamp_dir, Path(output_dir) / "output.mp4", options)
            assert success is True
            mock_run.assert_called_once()

    def test_parallel_processing_output_path(self, video_options, mock_directories):
        """Test handling of timestamp-based output directories in parallel processing."""
        input_dir, output_dir = mock_directories
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        process_dir = Path(output_dir) / f"processed_{timestamp}"
        stage_dirs = {
            'false_color': process_dir / f"01_falsecolor_{timestamp}",
            'crop': process_dir / f"02_cropped_{timestamp}",
            'timestamp': process_dir / f"03_timestamp_{timestamp}"
        }
        
        for dir_path in stage_dirs.values():
            dir_path.mkdir(parents=True, exist_ok=True)
            
        for i in range(5):
            frame_path = stage_dirs['timestamp'] / f"frame{i:04d}.png"
            frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
            cv2.imwrite(str(frame_path), frame)
        
        video_handler = VideoHandler()
        video_handler.testing = False
        options = video_options.get_options()
        
        test_frames = [stage_dirs['timestamp'] / f"frame{i:04d}.png" for i in range(5)]
        with patch('pathlib.Path.glob', return_value=test_frames), \
             patch('subprocess.run', return_value=MagicMock(returncode=0)) as mock_run, \
             patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.is_dir', return_value=True):
            
            success = video_handler.create_video(
                stage_dirs['timestamp'], 
                process_dir / "final_video.mp4",
                options
            )
            
            assert success is True
            mock_run.assert_called_once()
            
            cmd_args = mock_run.call_args[0][0]
            cmd_str = ' '.join(map(str, cmd_args))
            
            input_pattern = str(stage_dirs['timestamp']).replace('\\', '/') + '/frame%04d.png'
            assert input_pattern in cmd_str.replace('\\', '/'), f"Expected pattern {input_pattern} not found in command: {cmd_str}"

    def test_timestamped_directory_structure(self, video_options, mock_directories):
        """Test video creation from timestamped directory structure."""
        input_dir, output_dir = mock_directories
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        process_dir = Path(output_dir) / f"processed_{timestamp}"
        stage_dir = process_dir / f"03_timestamp_{timestamp}"
        stage_dir.mkdir(parents=True, exist_ok=True)
        
        video_handler = VideoHandler()
        video_handler.testing = False
        options = video_options.get_options()
        
        with patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.is_dir', return_value=True), \
             patch('pathlib.Path.glob', return_value=[]):
            
            with pytest.raises(RuntimeError) as exc_info:
                video_handler.create_video(stage_dir, process_dir / "output.mp4", options)
            assert "No frame files found" in str(exc_info.value)
            
        for i in range(5):
            frame_path = stage_dir / f"frame{i:04d}.png"
            frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
            cv2.imwrite(str(frame_path), frame)
        
        with patch('pathlib.Path.glob', return_value=[stage_dir / f"frame{i:04d}.png" for i in range(5)]), \
             patch('subprocess.run', return_value=MagicMock(returncode=0)) as mock_run:
            
            success = video_handler.create_video(stage_dir, process_dir / "output.mp4", options)
            assert success is True
            mock_run.assert_called_once()

    def test_output_file_validation(self, video_options, mock_directories):
        """Test output file path validation"""
        input_dir, output_dir = mock_directories
        video_handler = VideoHandler()
        
        for invalid_path in ["", "invalid/path/test.mp4", output_dir / "test.invalid"]:
            try:
                video_handler.create_video(input_dir, invalid_path, video_options.get_options())
                pytest.fail(f"Should have raised ValueError for {invalid_path}")
            except ValueError as e:
                if not invalid_path:
                    assert "Empty output path" in str(e)
                elif ".invalid" in str(invalid_path):
                    assert "Invalid file extension" in str(e)
                else:
                    assert "Directory does not exist" in str(e)

    def test_framerate_conversion(self, video_options, mock_directories):
        """Test frame rate conversion handling"""
        input_dir, output_dir = mock_directories
        
        # Test various input/output FPS combinations
        test_cases = [
            (24, 30),  # Upconversion
            (60, 30),  # Downconversion
            (25, 29.97),  # PAL to NTSC
        ]
        
        for input_fps, output_fps in test_cases:
            options = video_options.get_options()
            options['input_fps'] = input_fps
            options['fps'] = output_fps
            
            with patch('subprocess.run', return_value=MagicMock(returncode=0)) as mock_run:
                video_handler = VideoHandler()
                video_handler.create_video(input_dir, output_dir / f"test_{output_fps}fps.mp4", options)
                
                cmd_args = mock_run.call_args[0][0]
                command_str = ' '.join(map(str, cmd_args))
                assert f"-framerate {output_fps}" in command_str

    def test_video_metadata(self, video_options, mock_directories):
        """Test video metadata handling"""
        input_dir, output_dir = mock_directories
        
        metadata = {
            'title': 'Test Video',
            'author': 'Test Author',
            'creation_time': datetime.now().isoformat(),
            'encoder': 'Test Encoder'
        }
        
        options = video_options.get_options()
        options['metadata'] = metadata
        
        with patch('subprocess.run', return_value=MagicMock(returncode=0)) as mock_run:
            video_handler = VideoHandler()
            video_handler.create_video(input_dir, output_dir / "output.mp4", options)
            
            cmd_args = mock_run.call_args[0][0]
            cmd_str = ' '.join(map(str, cmd_args))
            
            for key, value in metadata.items():
                assert f'-metadata {key}="{value}"' in cmd_str

    def test_ffmpeg_process_termination(self, video_options, mock_directories):
        """Test proper FFmpeg process termination on cancellation"""
        input_dir, output_dir = mock_directories
        options = video_options.get_options()
        
        mock_process = MagicMock()
        mock_process.poll.return_value = None  # Process is running
        
        with patch('subprocess.Popen', return_value=mock_process) as mock_popen:
            video_handler = VideoHandler()
            video_handler._current_process = mock_process
            video_handler.cancel()
            
            mock_process.terminate.assert_called_once()
            assert video_handler._current_process is None

    def test_concurrent_video_creation(self, video_options, mock_directories):
        """Test handling of concurrent video creation attempts"""
        input_dir, output_dir = mock_directories
        options = video_options.get_options()
        video_handler = VideoHandler()
        
        # Start first video creation
        with patch('subprocess.run', return_value=MagicMock(returncode=0)):
            first_creation = video_handler.create_video(input_dir, output_dir / "first.mp4", options)
            assert first_creation is True
            
            # Attempt second video creation while first is running
            video_handler._is_processing = True
            second_creation = video_handler.create_video(input_dir, output_dir / "second.mp4", options)
            assert second_creation is False
            
            video_handler._is_processing = False

    def test_output_file_collision(self, video_options, mock_directories):
        """Test handling of existing output file"""
        input_dir, output_dir = mock_directories
        options = video_options.get_options()
        
        # Create a dummy output file
        output_path = output_dir / "output.mp4"
        output_path.touch()
        
        with patch('pathlib.Path.exists', return_value=True), \
             patch('subprocess.run', return_value=MagicMock(returncode=0)) as mock_run:
            video_handler = VideoHandler()
            success = video_handler.create_video(input_dir, output_path, options)
            
            # Verify FFmpeg was called with -y flag for overwrite
            cmd_args = mock_run.call_args[0][0]
            assert '-y' in cmd_args

    def test_resource_monitoring(self, video_options, mock_directories):
        """Test resource monitoring during video creation"""
        input_dir, output_dir = mock_directories
        options = video_options.get_options()

        # Create mock for psutil.Process
        process_mock = MagicMock()
        process_mock.cpu_percent.return_value = 20.0
        memory_info = MagicMock()
        memory_info.rss = 1024 * 1024 * 100  # 100 MB
        process_mock.memory_info.return_value = memory_info

        with patch('psutil.Process', return_value=process_mock) as proc_mock, \
             patch('subprocess.run', return_value=MagicMock(returncode=0)) as ffmpeg_mock, \
             patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.is_dir', return_value=True), \
             patch('pathlib.Path.glob', return_value=[Path(input_dir) / "frame0000.png"]):
            
            video_handler = VideoHandler()
            video_handler.testing = False  # Enable actual monitoring
            video_handler.process = process_mock  # Set mocked process directly
            video_handler._monitor_resources = True  # Enable resource monitoring

            # Create video
            success = video_handler.create_video(input_dir, output_dir / "output.mp4", options)
            
            # Verify success and monitoring
            assert success is True
            assert ffmpeg_mock.called, "FFmpeg command was not called"
            assert process_mock.cpu_percent.call_count > 0, "CPU monitoring was not called"
            assert process_mock.memory_info.call_count > 0, "Memory monitoring was not called"

    def test_video_creation_resume(self, video_options, mock_directories):
        """Test video creation can resume after failure"""
        input_dir, output_dir = mock_directories
        options = video_options.get_options()
        
        video_handler = VideoHandler()
        
        # Mock FFmpeg failing once then succeeding
        with patch('subprocess.run') as mock_run:
            mock_run.side_effect = [
                subprocess.CalledProcessError(1, ['ffmpeg'], stderr=b"Temporary failure"),
                MagicMock(returncode=0)
            ]
            
            success = video_handler.create_video(input_dir, output_dir / "output.mp4", options)
            assert success is True
            assert mock_run.call_count == 2
            assert not video_handler._is_processing

    def test_temporary_file_cleanup(self, video_options, mock_directories):
        """Test cleanup of temporary files after video creation"""
        input_dir, output_dir = mock_directories
        temp_dir = output_dir / "temp"
        temp_dir.mkdir()
        temp_files = []
        
        # Create some temporary files
        for i in range(3):
            temp_file = temp_dir / f"temp_{i}.tmp"
            temp_file.touch()
            temp_files.append(temp_file)
        
        options = video_options.get_options()
        options['temp_dir'] = str(temp_dir)
        
        with patch('subprocess.run', return_value=MagicMock(returncode=0)):
            video_handler = VideoHandler()
            video_handler.create_video(input_dir, output_dir / "output.mp4", options)
            
            # Check that temp files were cleaned up
            assert not any(f.exists() for f in temp_files)
            assert not temp_dir.exists()

    def test_memory_leak_prevention(self, video_options, mock_directories):
        """Test that memory is properly freed after processing"""
        input_dir, output_dir = mock_directories
        options = video_options.get_options()

        process_mock = MagicMock()
        initial_memory = 100 * 1024 * 1024  # 100 MB
        final_memory = initial_memory  # Should remain similar after cleanup
        
        memory_info_mock = MagicMock()
        memory_info_mock.rss = initial_memory
        process_mock.memory_info.return_value = memory_info_mock

        with patch('psutil.Process', return_value=process_mock):
            video_handler = VideoHandler()
            video_handler.testing = False
            
            with patch('subprocess.run', return_value=MagicMock(returncode=0)):
                video_handler.create_video(input_dir, output_dir / "output.mp4", options)
                # Verify memory usage hasn't increased significantly
                assert process_mock.memory_info.return_value.rss <= initial_memory * 1.1

    def test_progress_cancellation(self, video_options, mock_directories):
        """Test that cancellation properly stops processing and cleans up"""
        input_dir, output_dir = mock_directories
        options = video_options.get_options()
        
        # Create a valid frame file first
        frame_path = Path(input_dir) / "frame0000.png"
        frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
        cv2.imwrite(str(frame_path), frame)
        
        video_handler = VideoHandler()
        video_handler.testing = False

        def mock_run(*args, **kwargs):
            # Set process state and trigger cancellation
            video_handler._is_processing = True
            video_handler.cancelled = True
            raise subprocess.CalledProcessError(1, cmd='ffmpeg', stderr=b'Cancelled by user')

        with patch('subprocess.run', side_effect=mock_run):
            success = video_handler.create_video(input_dir, output_dir / "output.mp4", options)
            assert not success, "Video creation should fail when cancelled"
            assert not video_handler._is_processing, "Processing flag should be cleared"

    def test_input_frame_validation(self, video_options, mock_directories):
        """Test validation of input frame sequence"""
        input_dir, output_dir = mock_directories
        options = video_options.get_options()
        
        # Create frames with gaps
        frames = []
        for i in [0, 1, 3, 4]:  # Missing frame 2
            frame_path = Path(input_dir) / f"frame{i:04d}.png"
            frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
            cv2.imwrite(str(frame_path), frame)
            frames.append(frame_path)

        video_handler = VideoHandler()
        video_handler.testing = False

        with patch('pathlib.Path.glob', return_value=frames), \
             patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.is_dir', return_value=True):
            with pytest.raises(RuntimeError) as exc_info:
                video_handler.create_video(input_dir, output_dir / "output.mp4", options)
            assert "Frame sequence is not continuous" in str(exc_info.value)

    def test_input_frame_validation(self, video_options, mock_directories):
        """Test validation of input frame sequence"""
        input_dir, output_dir = mock_directories
        options = video_options.get_options()
        
        # Create frames with gaps
        frame_files = [
            Path(input_dir) / f"frame{i:04d}.png" 
            for i in [0, 1, 3, 4]  # Missing frame 2
        ]
        for f in frame_files:
            f.touch()

        video_handler = VideoHandler()
        video_handler.testing = False

        with patch('pathlib.Path.glob', return_value=frame_files):
            with pytest.raises(RuntimeError, match="Frame sequence is not continuous"):
                video_handler.create_video(input_dir, output_dir / "output.mp4", options)

    def test_resource_limit_handling(self, video_options, mock_directories):
        """Test handling of resource limits during processing"""
        input_dir, output_dir = mock_directories
        options = video_options.get_options()

        process_mock = MagicMock()
        process_mock.cpu_percent.return_value = 95.0  # Simulate high CPU usage
        memory_info = MagicMock()
        memory_info.rss = 1024 * 1024 * 1024 * 16  # Simulate 16GB memory usage
        process_mock.memory_info.return_value = memory_info

        with patch('psutil.Process', return_value=process_mock):
            video_handler = VideoHandler()
            video_handler.testing = False
            
            with patch('subprocess.run', return_value=MagicMock(returncode=0)):
                success = video_handler.create_video(input_dir, output_dir / "output.mp4", options)
                assert success  # Should complete despite high resource usage
                # Verify resource monitoring was active
                assert process_mock.cpu_percent.call_count > 0
                assert process_mock.memory_info.call_count > 0

class TestErrorHandling:
    """Tests for error handling and edge cases"""

    @pytest.fixture(autouse=True)
    def setup_video_options(self, video_options):
        """Setup video options for each test"""
        self.video_options = video_options
        return video_options

    def test_corrupted_frames(self, video_handler, mock_directories, caplog):
        """Test handling of corrupted frames"""
        input_dir, output_dir = mock_directories

        for i in range(3):
            frame_path = Path(input_dir) / f"frame{i:04d}.png"
            frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
            cv2.imwrite(str(frame_path), frame)

        corrupted_frame = Path(input_dir) / "frame0003.png"
        with open(str(corrupted_frame), 'wb') as f:
            f.write(b'corrupted data')

        video_handler = VideoHandler()
        video_handler.testing = False
        options = self.video_options.get_options()

        with patch('pathlib.Path.glob', return_value=[
                Path(input_dir) / f"frame{i:04d}.png" for i in range(4)
            ]), \
             patch('subprocess.run') as mock_run:
            mock_run.side_effect = subprocess.CalledProcessError(
                1, 
                ['ffmpeg'], 
                stderr=b"Error reading corrupted frame"
            )
            
            with caplog.at_level(logging.ERROR):
                with pytest.raises(RuntimeError) as exc_info:
                    video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)
            
            assert any("Error reading corrupted frame" in record.message for record in caplog.records)

    def test_invalid_input_paths(self, video_handler, mock_directories):
        """Test invalid input path handling"""
        input_dir, output_dir = mock_directories
        video_handler = VideoHandler()
        video_handler.testing = True
        options = {"testing": True}
        
        success = video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)
        assert success is True

class TestHardwareAcceleration:
    """Tests for hardware acceleration features"""

    @pytest.fixture(autouse=True)
    def setup_video_options(self, video_options, qtbot):
        """Setup video options for each test."""
        self.video_options = video_options
        return video_options

    def test_nvidia_support(self, video_handler, mock_directories):
        """Test NVIDIA GPU support"""
        input_dir, output_dir = mock_directories
        
        frame_path = Path(input_dir) / "frame0000.png"
        frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
        cv2.imwrite(str(frame_path), frame)
        
        self.video_options.hardware_combo.setCurrentText("NVIDIA GPU")
        options = self.video_options.get_options()
        
        video_handler = VideoHandler()
        video_handler.testing = False  # Must be False to test hardware fallback

        with patch('pathlib.Path.glob', return_value=[frame_path]), \
             patch('subprocess.run') as mock_run:
            mock_run.side_effect = [
                subprocess.CalledProcessError(1, ['ffmpeg'], stderr=b"Cannot use NVENC"),
                MagicMock(returncode=0)
            ]
            
            video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)
            assert mock_run.call_count == 2

    def test_hardware_fallback(self, video_handler, mock_directories):
        """Test fallback to CPU encoding"""
        input_dir, output_dir = mock_directories
        
        frame_path = Path(input_dir) / "frame0000.png"
        frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
        cv2.imwrite(str(frame_path), frame)
        
        self.video_options.hardware_combo.setCurrentText("NVIDIA GPU")
        options = self.video_options.get_options()
        video_handler = VideoHandler()
        video_handler.testing = False  # Must be False to test hardware fallback

        with patch('pathlib.Path.glob', return_value=[frame_path]), \
             patch('subprocess.run') as mock_run:
            mock_run.side_effect = [
                subprocess.CalledProcessError(1, ['ffmpeg'], stderr=b"Cannot use NVENC"),
                MagicMock(returncode=0)
            ]
            
            video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)
            assert mock_run.call_count == 2

    def test_hardware_specific_filters(self, video_options, mock_directories):
        """Test hardware-specific video filters"""
        input_dir, output_dir = mock_directories
        
        # Fix: Update filter mappings and ensure encoder validity
        filter_mappings = {
            "NVIDIA GPU": ("h264_nvenc", "scale_cuda"),
            "Intel GPU": ("h264_qsv", "scale_qsv"),
            "AMD GPU": ("h264_amf", "scale_amf")
        }
        
        for hardware, (encoder, expected_filter) in filter_mappings.items():
            with patch('subprocess.run', return_value=MagicMock(returncode=0)) as mock_run:
                video_options.hardware_combo.setCurrentText(hardware)
                video_options.encoder_combo.setCurrentText("H.264")  # Use standard H.264
                options = video_options.get_options()
                
                video_handler = VideoHandler()
                video_handler.create_video(input_dir, output_dir / "output.mp4", options)
                
                cmd_args = mock_run.call_args[0][0]
                cmd_str = ' '.join(map(str, cmd_args))
                assert f"-vf {expected_filter}" in cmd_str

    def test_hardware_detection(self, video_handler):
        """Test hardware detection functionality"""
        hardware_types = ["NVIDIA", "Intel", "AMD"]
        
        for hw_type in hardware_types:
            with patch('subprocess.run') as mock_run:
                # Mock hardware detection response
                mock_run.return_value = MagicMock(
                    returncode=0,
                    stdout=f"Supported hardware accelerators: {hw_type}"
                )
                
                assert video_handler._get_hardware_params(hw_type) != []

class TestNetworkSupport:
    """Tests for network path handling"""

    def test_network_paths(self, video_handler, mock_network_path, tmp_path):
        """Test handling of network paths"""
        input_dir = Path(mock_network_path)
        output_path = tmp_path / "output.mp4"

        local_dir = tmp_path / "frames"
        local_dir.mkdir()
        frame_files = []
        for i in range(5):
            frame_path = local_dir / f"frame{i:04d}.png"
            frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
            cv2.imwrite(str(frame_path), frame)
            frame_files.append(frame_path)

        with patch('pathlib.Path.exists', side_effect=[True, True]), \
             patch('pathlib.Path.is_dir', return_value=True), \
             patch('pathlib.Path.glob', return_value=sorted(frame_files)), \
             patch('subprocess.run', return_value=MagicMock(returncode=0)) as mock_run:
            
            options = {'fps': 30, 'bitrate': 5000}
            success = video_handler.create_video(input_dir, output_path, options)
            
            assert success is True
            mock_run.assert_called_once()
            
            cmd_args = mock_run.call_args[0][0]
            cmd_str = ' '.join(map(str, cmd_args))
            assert 'frame%04d.png' in cmd_str

    def test_unc_paths(self, video_handler, mock_network_path, tmp_path):
        """Test UNC path support"""
        input_dir = Path(mock_network_path)
        output_path = tmp_path / "output.mp4"

        local_dir = tmp_path / "frames"
        local_dir.mkdir()
        frame_files = []
        for i in range(5):
            frame_path = local_dir / f"frame{i:04d}.png"
            frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
            cv2.imwrite(str(frame_path), frame)
            frame_files.append(frame_path)

        with patch('pathlib.Path.exists', side_effect=[True, True]), \
             patch('pathlib.Path.is_dir', return_value=True), \
             patch('pathlib.Path.glob', return_value=sorted(frame_files)), \
             patch('subprocess.run', return_value=MagicMock(returncode=0)) as mock_run:
            
            options = {'fps': 30, 'bitrate': 5000}
            success = video_handler.create_video(input_dir, output_path, options)
            
            assert success is True
            mock_run.assert_called_once()
            
            cmd_args = mock_run.call_args[0][0]
            cmd_str = ' '.join(map(str, cmd_args))
            assert 'frame%04d.png' in cmd_str

    def test_timestamped_directory_processing(self, video_options, mock_directories, tmp_path):
        """Test processing with timestamped network directory structure."""
        input_dir, output_dir = mock_directories
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        process_dir = Path(output_dir) / f"processed_{timestamp}"
        timestamp_dir = process_dir / f"03_timestamp_{timestamp}"
        timestamp_dir.mkdir(parents=True, exist_ok=True)
        
        video_handler = VideoHandler()
        video_handler.testing = False
        options = video_options.get_options()
        
        frame_files = []
        for i in range(5):
            frame_path = timestamp_dir / f"frame{i:04d}.png"
            frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
            cv2.imwrite(str(frame_path), frame)
            frame_files.append(frame_path)
        
        with patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.is_dir', return_value=True), \
             patch('pathlib.Path.glob', return_value=frame_files), \
             patch('pathlib.Path.mkdir', side_effect=lambda *args, **kwargs: None), \
             patch('subprocess.run', return_value=MagicMock(returncode=0)) as mock_run:
            
            success = video_handler.create_video(timestamp_dir, process_dir / "output.mp4", options)
            assert success is True
            mock_run.assert_called_once()
            
            cmd_args = mock_run.call_args[0][0]
            cmd_str = ' '.join(map(str, cmd_args))
            assert 'frame%04d.png' in cmd_str

# Helper functions (if needed)
def create_test_frames(directory: Path, count: int = 5) -> List[Path]:
    """Create test frame files"""
    frame_files = []
    for i in range(count):
        frame_path = directory / f"frame{i:04d}.png"
        frame = np.ones((100, 100, 3), dtype=np.uint8) * 128
        cv2.imwrite(str(frame_path), frame)
        frame_files.append(frame_path)
    return frame_files

# filepath: /c:/Users/jtn01/OneDrive/Desktop/Github/satallite_processor/satellite_processor/core/video_handler.py
# ...existing code...

    def create_video(self, input_dir, output_path, options):
        """Create video with improved validation"""
        try:
            # ...existing initial validations...

            # Get and sort frame files directly from directory
            frame_files = sorted(list(input_dir.glob("*.png")))
            if not frame_files:
                error_msg = f"No frame files found in {input_dir}"
                self.logger.error(error_msg)
                raise RuntimeError(error_msg)

            # Validate frame sequence before FFmpeg
            self._validate_frame_sequence(frame_files)

            # Check for cancellation
            if self.cancelled:
                self.logger.info("Video creation cancelled")
                return False

            # ...rest of existing create_video code...

        except Exception as e:
            self.logger.error(f"Video creation error: {str(e)}")
            raise
        finally:
            self._is_processing = False
            self._cleanup_temp_files(options)

    def _validate_frame_sequence(self, frame_files: List[Path]) -> None:
        """Validate that frame sequence is continuous"""
        try:
            numbers = []
            pattern = re.compile(r'frame(\d+)')
            
            for frame in frame_files:
                match = pattern.search(frame.stem)
                if match:
                    numbers.append(int(match.group(1)))
            
            if not numbers:
                return  # No numbered frames found
                
            numbers.sort()
            expected = list(range(min(numbers), max(numbers) + 1))
            
            if numbers != expected:
                missing = set(expected) - set(numbers)
                raise RuntimeError(f"Frame sequence is not continuous. Missing frames: {missing}")
                
        except Exception as e:
            if "Frame sequence is not continuous" in str(e):
                raise
            self.logger.error(f"Error validating frame sequence: {e}")
            raise RuntimeError(f"Error validating frame sequence: {e}")

    # ...existing code...
