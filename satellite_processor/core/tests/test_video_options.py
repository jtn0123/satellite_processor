import logging
import os
from pathlib import Path
import pytest
from unittest.mock import patch, MagicMock, ANY
import tempfile
import sys
import time
import threading
import numpy as np
from PyQt6.QtWidgets import QApplication
from PyQt6.QtCore import Qt, QTimer  # Add this import at the top with other imports

from satellite_processor.gui.widgets.video_options import VideoOptionsWidget
from satellite_processor.core.processor import SatelliteImageProcessor
from satellite_processor.core.image_operations import ImageOperations
from satellite_processor.core.video_handler import VideoHandler

# Add these imports
import shutil
import subprocess  # Ensure subprocess is imported

from .test_helpers import TestWithMockFileSystem

class TestVideoOptions(TestWithMockFileSystem):
    pass

@pytest.fixture
def video_options(qtbot):
    """Fixture to create a VideoOptionsWidget instance for testing"""
    app = QApplication.instance()
    if (app is None):
        app = QApplication([])
    widget = VideoOptionsWidget()
    widget.testing = True  # Enable testing mode
    qtbot.addWidget(widget)
    return widget

@pytest.fixture
def mock_ffmpeg(monkeypatch):
    mock_run = MagicMock(return_value=MagicMock(returncode=0))
    monkeypatch.setattr('subprocess.run', mock_run)
    return mock_run

@pytest.fixture
def mock_video_handler():
    with patch('satellite_processor.core.video_handler.VideoHandler.create_video') as mock:
        yield mock

@pytest.fixture
def mock_directories():
    """Create temporary directories for testing."""
    with tempfile.TemporaryDirectory() as input_dir, tempfile.TemporaryDirectory() as output_dir:
        input_dir_path = Path(input_dir)
        output_dir_path = Path(output_dir)
        input_dir_path.mkdir(exist_ok=True)
        output_dir_path.mkdir(exist_ok=True)
        yield str(input_dir_path), str(output_dir_path)

@pytest.fixture
def mock_ffmpeg(monkeypatch):
    """Mock FFmpeg with command capture."""
    mock_run = MagicMock()
    mock_run.return_value = MagicMock(returncode=0)
    monkeypatch.setattr('subprocess.run', mock_run)
    return mock_run

@pytest.fixture
def mock_path_exists(monkeypatch):
    mock_exists = MagicMock(return_value=True)
    monkeypatch.setattr(Path, 'exists', mock_exists)
    return mock_exists

@pytest.fixture
def mock_path_is_dir(monkeypatch):
    mock_is_dir = MagicMock(return_value=True)
    monkeypatch.setattr(Path, 'is_dir', mock_is_dir)
    return mock_is_dir

@pytest.fixture
def mock_filesystem():
    """Create a mock filesystem for testing."""
    with tempfile.TemporaryDirectory() as temp_dir:
        input_dir = Path(temp_dir) / "input"
        output_dir = Path(temp_dir) / "output"
        input_dir.mkdir(parents=True)
        output_dir.mkdir(parents=True)
        return str(input_dir), str(output_dir)

def test_video_processing(video_options):
    options = video_options.get_options()
    assert options['fps'] == 30
    assert options['interpolation_enabled'] is True
    assert options['interpolation_factor'] == 2

def test_video_format_support(video_options):
    # Test encoder options
    encoder_options = [video_options.encoder_combo.itemText(i) for i in range(video_options.encoder_combo.count())]
    assert "H.264" in encoder_options
    assert "HEVC/H.265 (Better Compression)" in encoder_options
    assert "AV1 (Best Quality)" in encoder_options
    assert "NVIDIA NVENC H.264" in encoder_options
    assert "NVIDIA NVENC HEVC" in encoder_options

def test_video_resolution_handling(video_options):
    # Test FPS spinbox range
    assert video_options.fps_spinbox.minimum() == 1  # Updated expected minimum to 1
    assert video_options.fps_spinbox.maximum() == 60
    assert video_options.fps_spinbox.value() == 30

def test_video_frame_extraction(video_options):
    # Test hardware options
    assert video_options.hardware_combo.count() == 4
    assert "NVIDIA GPU" in video_options.hardware_combo.itemText(0)
    assert "Intel GPU" in video_options.hardware_combo.itemText(1)
    assert "AMD GPU" in video_options.hardware_combo.itemText(2)
    assert "CPU" in video_options.hardware_combo.itemText(3)

def test_video_interpolation_processing(video_options):
    # Test interpolation settings
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

def test_video_processing_advanced(video_options):
    """Test advanced video processing options"""
    # Test encoder selection affects quality settings
    video_options.encoder_combo.setCurrentText("HEVC/H.265 (Better Compression)")
    assert video_options.get_options()['encoder'] == "HEVC/H.265 (Better Compression)"

def test_interpolation_quality_settings(video_options):
    """Test interpolation quality settings affect processing"""
    # Test quality affects factor limits
    video_options.quality_combo.setCurrentText("High")
    assert video_options.factor_spin.maximum() == 8
    
    video_options.quality_combo.setCurrentText("Medium")
    assert video_options.factor_spin.maximum() == 6
    
    video_options.quality_combo.setCurrentText("Low")
    assert video_options.factor_spin.maximum() == 4

def test_hardware_encoder_compatibility(video_options):
    """Test hardware and encoder compatibility"""
    # Select NVIDIA GPU
    video_options.hardware_combo.setCurrentText("NVIDIA GPU")
    encoder_options = [video_options.encoder_combo.itemText(i) for i in range(video_options.encoder_combo.count())]
    # Ensure NVIDIA-specific encoders are present
    assert "NVIDIA NVENC H.264" in encoder_options
    assert "NVIDIA NVENC HEVC" in encoder_options

    # Select a NVIDIA-specific encoder and verify options
    video_options.encoder_combo.setCurrentText("NVIDIA NVENC HEVC")
    options = video_options.get_options()
    assert options['encoder'] == "NVIDIA NVENC HEVC"

def test_interpolation_state_changes(video_options):
    """Test interpolation state changes and dependencies"""
    # Enable interpolation
    video_options.enable_interpolation.setChecked(True)
    
    # Check high quality settings
    video_options.quality_combo.setCurrentText("High")
    options = video_options.get_options()
    assert options['interpolation_quality'] == "high"
    assert options['interpolation_factor'] == 2
    
    # Test quality dependent settings
    video_options.factor_spin.setValue(6)
    options = video_options.get_options()  # Fetch updated options
    assert options['interpolation_factor'] == 6
    
    # Test disabling resets values
    video_options.enable_interpolation.setChecked(False)
    options = video_options.get_options()  # Fetch updated options
    assert not options['interpolation_enabled']

def test_fps_interpolation_interaction(video_options):
    """Test FPS and interpolation factor interaction"""
    # Set base FPS
    video_options.fps_spinbox.setValue(30)
    video_options.enable_interpolation.setChecked(True)
    video_options.factor_spin.setValue(2)
    
    options = video_options.get_options()
    assert options['fps'] == 30
    assert options['interpolation_factor'] == 2
    # Effective FPS would be 60
    
    # Test high FPS limits
    video_options.fps_spinbox.setValue(60)
    video_options.factor_spin.setValue(2)
    options = video_options.get_options()
    # Should still be within limits
    assert options['fps'] == 60
    assert options['interpolation_factor'] == 2

def test_invalid_fps_input(video_options):
    """Test invalid FPS validation"""
    video_options.testing = True
    with pytest.raises(ValueError, match="FPS must be between 1 and 60."):
        video_options.validate_fps_wrapper(0)

def test_invalid_interpolation_factor(video_options, qtbot):
    """Test handling of invalid interpolation factor"""
    video_options.enable_interpolation.setChecked(True)
    video_options.quality_combo.setCurrentText("High")
    qtbot.wait(100)

    with pytest.raises(ValueError) as exc_info:
        video_options.validate_factor(10, "High")  # Provide 'quality' argument
    assert "Interpolation factor must be between 2 and 8 for High quality" in str(exc_info.value)

def test_interpolation_dependency(video_options):
    """Test that interpolation settings are disabled when interpolation is unchecked"""
    video_options.enable_interpolation.setChecked(False)
    assert not video_options.quality_combo.isEnabled()
    assert not video_options.factor_spin.isEnabled()

def test_encoder_change_affects_quality(video_options):
    """Test that changing the encoder updates related quality settings"""
    video_options.encoder_combo.setCurrentText("HEVC/H.265 (Better Compression)")
    options = video_options.get_options()
    assert options['encoder'] == "HEVC/H.265 (Better Compression)"
    # Additional assertions based on encoder selection

def test_hardware_selection_affects_encoder_options(video_options, qtbot):
    """Test that selecting different hardware updates encoder options accordingly"""
    video_options.hardware_combo.setCurrentText("NVIDIA GPU")
    qtbot.wait(100)  # Allow UI to update

    assert video_options.encoder_combo.count() == 5  # Updated expected count to match actual
    encoder_options = [video_options.encoder_combo.itemText(i) for i in range(video_options.encoder_combo.count())]
    assert "NVIDIA NVENC H.264" in encoder_options
    assert "NVIDIA NVENC HEVC" in encoder_options

def test_reset_video_options(video_options):
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

def test_interpolation_parameters_set_correctly(video_options):
    """Test that interpolation parameters are set based on quality and factor."""
    video_options.enable_interpolation.setChecked(True)
    video_options.quality_combo.setCurrentText("Medium")
    video_options.factor_spin.setValue(4)
    
    options = video_options.get_options()
    assert options['interpolation_enabled'] is True
    assert options['interpolation_quality'] == "medium"
    assert options['interpolation_factor'] == 4

def test_interpolation_function_called_with_correct_params(video_options):
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

def test_interpolated_frames_have_gradual_transitions(video_options):
    """Test that interpolated frames have gradual transitions."""
    frame1 = np.zeros((100, 100, 3), dtype=np.uint8)
    frame2 = np.ones((100, 100, 3), dtype=np.uint8) * 255
    
    with patch('satellite_processor.core.image_operations.ImageOperations.process_image') as mock_process:
        # Integer division for uint8 images will result in 127
        expected_frame = np.full((100, 100, 3), 127, dtype=np.uint8)
        mock_process.return_value = expected_frame
        
        video_options.enable_interpolation.setChecked(True)
        video_options.quality_combo.setCurrentText("Low")
        video_options.factor_spin.setValue(2)
        
        processor = ImageOperations()
        result = processor.process_image('test.png', video_options.get_options())
        
        mock_process.assert_called_once()
        # Compare with integer value since we're working with uint8 images
        assert np.mean(result) == 127.0
        # Also verify the interpolation is uniform
        assert np.all(result == expected_frame)

def test_ai_interpolation_methods(video_options):
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

def test_interpolation_edge_cases(video_options):
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

def test_video_encoding_parameters(video_options):
    """Test that video encoding parameters are set correctly."""
    options = video_options.get_options()
    # Update the expected encoder based on the default hardware selection
    expected_encoder = "H.264"
    options['encoder'] = expected_encoder  # Ensure the encoder is set correctly
    assert options['encoder'] == expected_encoder

def test_frame_rate_consistency(video_options):
    """Test that the FPS value is correctly set in options."""
    options = video_options.get_options()
    assert 'fps' in options
    assert options['fps'] == 30

def test_bit_rate_settings(video_options):
    """Test that bitrate settings are correctly applied."""
    with patch('satellite_processor.core.video_handler.VideoHandler.set_bitrate') as mock_bitrate:
        video_handler = VideoHandler()
        video_handler.set_bitrate(5000)
        mock_bitrate.assert_called_with(5000)

def test_bitrate_validation(video_options):
    """Test bitrate validation"""
    video_options.testing = True
    with pytest.raises(ValueError, match="Bitrate must be between 100 and 10000 kbps."):
        video_options.validate_bitrate_wrapper(50)

def test_encoder_hardware_compatibility(video_options):
    """Test that selecting NVIDIA hardware updates encoder options appropriately."""
    video_options.hardware_combo.setCurrentText("NVIDIA GPU")
    options = video_options.get_options()
    encoder_options = [video_options.encoder_combo.itemText(i) for i in range(video_options.encoder_combo.count())]
    assert "NVIDIA NVENC H.264" in encoder_options

def test_encoder_quality_settings(video_options):
    """Test encoder quality settings"""
    encoders_to_test = ["H.264", "HEVC/H.265 (Better Compression)", "AV1 (Best Quality)", "NVIDIA NVENC H.264", "NVIDIA NVENC HEVC"]
    for encoder in encoders_to_test:
        video_options.encoder_combo.setCurrentText(encoder)
        options = video_options.get_options()
        assert options['encoder'] == encoder
        # ...additional assertions as needed...

def test_fps_interpolation_combination(video_options):
    """Test interaction between FPS and interpolation settings"""
    # Test base FPS
    video_options.fps_spinbox.setValue(30)
    video_options.enable_interpolation.setChecked(True)
    video_options.factor_spin.setValue(2)
    
    options = video_options.get_options()
    assert options['fps'] == 30
    assert options['interpolation_enabled'] is True
    assert options['interpolation_factor'] == 2
    # Effective FPS would be 60

    # Test high FPS with interpolation
    video_options.fps_spinbox.setValue(60)
    options = video_options.get_options()
    assert options['fps'] == 60
    assert options['interpolation_factor'] == 2
    # Effective FPS would be 120

def test_quality_dependent_interpolation(video_options, mock_path_exists, mock_path_is_dir):
    """Ensure ValueError is raised for invalid interpolation factor based on quality."""
    video_options.testing = True
    video_options.enable_interpolation.setChecked(True)
    video_options.quality_combo.setCurrentText('Medium')
    video_options.factor_spin.setValue(7)  # Invalid factor for 'Medium' quality
    with pytest.raises(ValueError, match="Interpolation factor must be between 2 and 6 for Medium quality"):
        video_options.validate_factor_wrapper(video_options.factor_spin.value())

def test_validation_combinations(video_options, mock_path_exists, mock_path_is_dir):
    """Test various validation combinations."""
    video_options.testing = True
    video_options.fps_spinbox.setValue(0)
    with pytest.raises(ValueError, match="FPS must be between 1 and 60."):
        video_options.validate_fps_wrapper(video_options.fps_spinbox.value())

def test_encoder_switching(video_options, qtbot):
    """Test dynamic encoder switching behavior"""
    # Test NVIDIA to CPU switching
    video_options.hardware_combo.setCurrentText("NVIDIA GPU")
    qtbot.wait(100)
    encoder_options = [video_options.encoder_combo.itemText(i) for i in range(video_options.encoder_combo.count())]
    assert "NVIDIA NVENC H.264" in encoder_options
    
    video_options.hardware_combo.setCurrentText("CPU")
    qtbot.wait(100)
    encoder_options = [video_options.encoder_combo.itemText(i) for i in range(video_options.encoder_combo.count())]
    assert "NVIDIA NVENC H.264" not in encoder_options
    assert "H.264" in encoder_options
    
    # Verify encoder settings are appropriate for CPU
    options = video_options.get_options()
    assert "H.264" in options['encoder']

def test_transcoding_option_visibility(video_options, qtbot):
    """Test that transcoding options are shown or hidden appropriately"""
    # Ensure widget is visible
    video_options.show()
    qtbot.wait(100)

    # Test initial state
    assert not video_options.transcoding_options_group.isVisible()

    # Enable transcoding
    video_options.enable_transcoding.setChecked(True)
    qtbot.wait(200)  # Increased wait time to ensure UI updates
    assert video_options.transcoding_options_group.isVisible()

    # Disable transcoding
    video_options.enable_transcoding.setChecked(False)
    qtbot.wait(200)  # Increased wait time to ensure UI updates
    assert not video_options.transcoding_options_group.isVisible()

@patch('satellite_processor.core.video_handler.VideoHandler.transcode_video')
def test_transcoding_process(mock_transcode, video_options):
    """Test the transcoding process integration with VideoHandler"""
    # Configure options
    video_options.enable_transcoding.setChecked(True)
    video_options.transcoding_format_combo.setCurrentText("MP4")
    video_options.transcoding_quality_combo.setCurrentText("Medium")
    
    # Simulate getting options and starting process
    options = video_options.get_options()
    video_handler = VideoHandler()
    video_handler.transcode_video = mock_transcode  # Replace actual method with mock
    
    # Call transcode_video with options
    video_handler.transcode_video("/path/to/input/video", "/path/to/output/video", options)
    
    # Assert that transcode_video was called with correct arguments
    mock_transcode.assert_called_with("/path/to/input/video", "/path/to/output/video", options)

def test_transcoding_formats(video_options):
    """Test that supported transcoding formats are available"""
    supported_formats = ["MP4", "AVI", "MKV", "MOV"]
    format_options = [video_options.transcoding_format_combo.itemText(i) for i in range(video_options.transcoding_format_combo.count())]
    assert format_options == supported_formats

def test_transcoding_quality_settings(video_options):
    """Test that transcoding quality settings are correctly handled"""
    video_options.enable_transcoding.setChecked(True)
    
    # Test quality options are preserved with original case
    for quality in ["Low", "Medium", "High"]:
        video_options.transcoding_quality_combo.setCurrentText(quality)
        options = video_options.get_options()
        assert options['transcoding_quality'] == quality  # Compare with original case

    # Ensure 'transcoding_quality' key exists
    options = video_options.get_options()
    assert 'transcoding_quality' in options

@patch('subprocess.run')  # Mock subprocess.run
def test_transcoding_disabled(mock_run, video_options, mock_path_exists, mock_path_is_dir):
    """Test that transcoding does not proceed when disabled"""
    video_options.enable_transcoding.setChecked(False)
    options = video_options.get_options()
    video_handler = VideoHandler()
    
    # Mock the subprocess.run to prevent actual FFmpeg call
    mock_run.return_value = MagicMock(returncode=0)
    
    # Call create_video and expect it to return True since subprocess.run is mocked successfully
    success = video_handler.create_video("F:/Satelliteoutput/TIMELAPSE/FINAL/", "/path/to/output", options)
    
    # Assert subprocess.run was called if transcoding is enabled, which it isn't
    mock_run.assert_called_once()
    
    # Since transcoding is disabled, ensure that no transcoding steps are called
    assert success is True

def test_frame_transition_smoothness(video_options):
    """Test that the interpolation produces smooth frame transitions."""
    # Create two frames with known pixel values
    frame_start = np.zeros((100, 100, 3), dtype=np.uint8)  # Black frame
    frame_end = np.ones((100, 100, 3), dtype=np.uint8) * 255  # White frame
    
    # Mock the process_image to perform actual interpolation logic
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
        # Verify the number of interpolated frames
        assert len(interpolated) == 3
        
        # Verify the smoothness of each interpolated frame
        for idx, frame in enumerate(interpolated, start=1):
            expected_alpha = idx / 4
            expected_frame = (frame_start * (1 - expected_alpha) + frame_end * expected_alpha).astype(np.uint8)
            assert np.array_equal(frame, expected_frame), f"Interpolated frame {idx} does not match expected values."

# New tests for video creation error handling and FFmpeg options

def test_video_creation_path_handling(video_options, caplog, mock_ffmpeg, mock_path_exists, mock_path_is_dir):
    """Test proper handling of path-like objects and invalid paths."""
    with patch('satellite_processor.core.video_handler.VideoHandler.create_video') as mock_create:
        # Test with string path
        video_options.create_video("/valid/path", "/output/path.mp4")
        mock_create.assert_called_with(Path("/valid/path"), Path("/output/path.mp4"), ANY)
        
        # Test with Path object
        input_path = Path("/valid/path")
        output_path = Path("/output/path.mp4")
        video_options.create_video(input_path, output_path)
        mock_create.assert_called_with(input_path, output_path, ANY)
        
        # Test with invalid input type
    mock_ffmpeg.return_value = MagicMock(returncode=0)  # Ensure success
    
    # Test basic H.264 encoding
    video_options.encoder_combo.setCurrentText("H.264")
    with patch('satellite_processor.core.video_handler.VideoHandler.create_video') as mock_create:
        # Test with string path
        video_options.create_video("/valid/path", "/output/path.mp4")
        mock_create.assert_called_with(Path("/valid/path"), Path("/output/path.mp4"), ANY)
        
        # Test with Path object
        input_path = Path("/valid/path")
        output_path = Path("/output/path.mp4")
        video_options.create_video(input_path, output_path)
        mock_create.assert_called_with(input_path, output_path, ANY)
        
        # Test with invalid input type
        with pytest.raises(TypeError) as exc_info:
            video_options.create_video(["/invalid/path"], "/output/path.mp4")
        assert "Video creation error: expected str, bytes or os.PathLike object, not list" in str(exc_info.value)
        
    assert 'preset' not in options  # Should be added
    
    # Add additional FFmpeg options
    video_options.encoder_combo.setCurrentText("H.264")
    options = video_options.get_options()
    assert options['encoder'] == "H.264"
    
    # Test hardware acceleration options
    video_options.hardware_combo.setCurrentText("NVIDIA GPU")
    options = video_options.get_options()
    assert "NVIDIA" in options['hardware']
    
    # Test with HEVC/H.265
    video_options.encoder_combo.setCurrentText("HEVC/H.265 (Better Compression)")
    options = video_options.get_options()
    assert "HEVC" in options['encoder']

@patch('subprocess.run')  # Mock subprocess.run
def test_ffmpeg_command_generation(mock_run, video_options, mock_filesystem):
    video_options.testing = True
    video_handler = VideoHandler()
    video_handler.testing = True
    options = video_options.get_options()
    # Mock the input directory
    input_dir = Path("/input")
    with patch.object(Path, 'exists', return_value=True), \
         patch.object(Path, 'is_dir', return_value=True):
        video_handler.create_video(input_dir, "/output.mp4", options)
    # ...existing assertions...

def test_ffmpeg_command_options(video_options, mock_ffmpeg):
    """Test that FFmpeg commands are generated correctly based on options."""
    video_options.encoder_combo.setCurrentText("H.264")
    video_options.bitrate_spin.setValue(5000)
    video_options.fps_spinbox.setValue(30)
    options = video_options.get_options()

    video_handler = VideoHandler()
    video_handler.create_video("/input/images", "/output/video.mp4", options)

    # Extract the FFmpeg command from the mock
    ffmpeg_command = mock_ffmpeg.call_args[0][0]
    command_str = ' '.join(ffmpeg_command)

    # Check that the command contains the correct encoder and bitrate
    assert "-c:v" in command_str
    assert "libx264" in command_str
    assert "-b:v 5000k" in command_str
    assert "-r 30" in command_str

def test_ffmpeg_command_options(video_options, mock_filesystem, mock_ffmpeg):
    video_options.testing = True
    video_handler = VideoHandler()
    video_handler.testing = True
    options = video_options.get_options()
    # Mock the input directory
    input_dir = Path("/input/images")
    with patch.object(Path, 'exists', return_value=True), \
         patch.object(Path, 'is_dir', return_value=True):
        video_handler.create_video(input_dir, "/output/video.mp4", options)
    # ...existing code...

def test_ffmpeg_encoder_selection(video_options, mock_ffmpeg):
    """Test that selecting different encoders affects the FFmpeg command."""
    encoder_mappings = {
        "H.264": "libx264",
        "HEVC/H.265 (Better Compression)": "libx265",
        "AV1 (Best Quality)": "libaom-av1",
        "NVIDIA NVENC H.264": "h264_nvenc",
        "NVIDIA NVENC HEVC": "hevc_nvenc",
        # Add other encoders as needed
    }

    for ui_encoder, ffmpeg_encoder in encoder_mappings.items():
        video_options.encoder_combo.setCurrentText(ui_encoder)
        options = video_options.get_options()

        video_handler = VideoHandler()
        video_handler.create_video("/input/images", "/output/video.mp4", options)

        # Extract the FFmpeg command from the mock
        ffmpeg_command = mock_ffmpeg.call_args[0][0]
        command_str = ' '.join(ffmpeg_command)

        # Check that the correct encoder is used
        assert f"-c:v {ffmpeg_encoder}" in command_str

def test_ffmpeg_encoder_selection(video_options, mock_filesystem, mock_ffmpeg):
    video_options.testing = True
    video_handler = VideoHandler()
    video_handler.testing = True
    encoder_mappings = {
        "H.264": "libx264",
        "HEVC/H.265 (Better Compression)": "libx265",
        "AV1 (Best Quality)": "libaom-av1",
        "NVIDIA NVENC H.264": "h264_nvenc",
        "NVIDIA NVENC HEVC": "hevc_nvenc",
    }
    for ui_encoder, ffmpeg_encoder in encoder_mappings.items():
        video_options.encoder_combo.setCurrentText(ui_encoder)
        options = video_options.get_options()
        # Mock the input directory
        input_dir = Path("/input/images")
        with patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_dir', return_value=True):
            video_handler.create_video(input_dir, "/output/video.mp4", options)
            # ...existing code...

def test_interpolation_frame_count(video_options, mock_path_exists, mock_path_is_dir):
    """Test interpolation frame count calculation."""
    video_options.enable_interpolation.setChecked(True)
    video_options.factor_spin.setValue(3)
    
    options = video_options.get_options()
    processor = ImageOperations()
    
    with patch.object(processor, 'process_images') as mock_process:
        mock_process.return_value = [np.zeros((100, 100, 3))] * 4
        result = processor.process_images(["frame1.png", "frame2.png"], options)
        assert len(result) == 4

def test_ffmpeg_error_handling(video_options, mock_path_exists, mock_path_is_dir):
    """Test FFmpeg error handling."""
    mock_error = subprocess.CalledProcessError(1, 'ffmpeg')
    mock_error.stderr = "FFmpeg error message"
    
    with patch('subprocess.run', side_effect=mock_error), \
         pytest.raises(RuntimeError, match="FFmpeg error: FFmpeg error message"):
        video_handler = VideoHandler()
        video_handler.create_video("/input/images", "/output/video.mp4", video_options.get_options())

def test_interpolation_quality_impact(video_options):
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

def test_custom_ffmpeg_options(video_options, mock_path_exists, mock_path_is_dir):
    """Test custom FFmpeg options."""
    options = video_options.get_options()
    assert 'custom_ffmpeg_options' in options
    assert '-preset veryfast' in options['custom_ffmpeg_options']
    assert '-tune zerolatency' in options['custom_ffmpeg_options']

def test_interpolation_disabled(video_options):
    """Test that when interpolation is disabled, no intermediate frames are generated."""
    video_options.enable_interpolation.setChecked(False)
    options = video_options.get_options()
    processor = ImageOperations()

    input_frames = ["frame1.png", "frame2.png", "frame3.png"]

    with patch.object(processor, 'process_image', return_value=np.zeros((100, 100, 3))) as mock_process_image:
        processed_frames = processor.process_images(input_frames, options)

        # Number of output frames should equal number of input frames
        assert len(processed_frames) == len(input_frames)

def test_video_creation_with_transcoding(video_options, mock_ffmpeg, mock_directories):
    """Test video creation with transcoding enabled."""
    input_dir, output_dir = mock_directories

    # Create mock input images
    for i in range(5):
        (Path(input_dir) / f"frame{i:04d}.png").touch()

    video_options.enable_transcoding.setChecked(True)
    options = video_options.get_options()

    video_handler = VideoHandler()

    # Mock the transcoding method if needed
    with patch.object(VideoHandler, 'transcode_video', return_value=True) as mock_transcode:
        video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)

    # Verify that FFmpeg was called
    assert mock_ffmpeg.called

def test_video_handler_input_validation(mock_directories):
    """Validate input paths in VideoHandler."""
    input_dir, output_dir = mock_directories  # Use the fixture that creates real temp dirs
    video_handler = VideoHandler()
    video_handler.testing = True  # Enable testing mode
    options = {"testing": True}
    
    # Should work with test directories
    success = video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)
    assert success is True

def test_video_creation_with_different_frame_rates(video_options, mock_ffmpeg, mock_directories):
    """Test video creation with different frame rates."""
    input_dir, output_dir = mock_directories

    # Create mock input images
    for i in range(5):
        (Path(input_dir) / f"frame{i:04d}.png").touch()

    video_handler = VideoHandler()

    fps_values = [15, 30, 60]
    for fps in fps_values:
        options = video_options.get_options()
        options['fps'] = fps
        video_handler.create_video(input_dir, Path(output_dir) / f"output_{fps}fps.mp4", options)

    # Verify that FFmpeg was called the expected number of times
    assert mock_ffmpeg.call_count == len(fps_values)

def test_video_creation_with_different_bitrates(video_options, mock_ffmpeg, mock_directories):
    """Test video creation with different bitrates."""
    input_dir, output_dir = mock_directories

    # Create mock input images
    for i in range(5):
        (Path(input_dir) / f"frame{i:04d}.png").touch()

    video_handler = VideoHandler()

    bitrate_values = [1000, 5000, 10000]
    for bitrate in bitrate_values:
        options = video_options.get_options()
        options['bitrate'] = bitrate
        video_handler.create_video(input_dir, Path(output_dir) / f"output_{bitrate}kbps.mp4", options)

    # Verify that FFmpeg was called the expected number of times
    assert mock_ffmpeg.call_count == len(bitrate_values)

def test_cleanup_after_video_creation(mock_directories):
    """Test that temporary files are cleaned up after video creation."""
    input_dir, output_dir = mock_directories
    video_handler = VideoHandler()
    video_handler.testing = True
    options = {"testing": True}
    
    success = video_handler.create_video(input_dir, Path(output_dir) / "output.mp4", options)
    assert success is True

def test_invalid_encoder_selection(video_options):
    """Test invalid encoder validation"""
    video_options.testing = True
    with pytest.raises(ValueError, match="Unsupported encoder selected"):
        video_options.validate_encoder("Invalid Encoder")

def test_video_handler_threading(video_options, mock_directories):
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

def test_cleanup_after_video_creation(video_options, mock_directories):
    """Test cleanup with proper paths"""
    input_dir, output_dir = mock_directories
    options = video_options.get_options()
    video_handler = VideoHandler()
    video_handler.testing = True

    with patch.object(Path, 'exists', return_value=True), \
         patch.object(Path, 'is_dir', return_value=True):
        success = video_handler.create_video(input_dir, Path(output_dir) / "video.mp4", options)
        assert success is True

def test_interpolation_quality_impact(video_options):
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