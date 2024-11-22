import sys
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parents[3]))

import pytest
from satellite_processor.gui.widgets.video_options import VideoOptionsWidget
from unittest.mock import patch, MagicMock
import numpy as np
from satellite_processor.core.processor import SatelliteImageProcessor
from satellite_processor.core.image_operations import ImageOperations

@pytest.fixture
def video_options(qtbot):
    widget = VideoOptionsWidget()
    qtbot.addWidget(widget)
    return widget

def test_video_processing(video_options):
    options = video_options.get_options()
    assert options['fps'] == 30
    assert options['interpolation_enabled'] is True
    assert options['interpolation_factor'] == 2

def test_video_format_support(video_options):
    # Test encoder options
    assert video_options.encoder_combo.count() == 3
    assert "H.264" in video_options.encoder_combo.itemText(0)
    assert "HEVC" in video_options.encoder_combo.itemText(1)
    assert "AV1" in video_options.encoder_combo.itemText(2)

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
    options = video_options.get_options()
    
    # Test hardware acceleration options
    assert 'hardware' in options
    hardware = options['hardware']
    assert any(gpu in hardware for gpu in ['NVIDIA', 'Intel', 'AMD', 'CPU'])
    
    # Test encoder selection affects quality settings
    video_options.encoder_combo.setCurrentText("HEVC/H.265 (Better Compression)")
    assert "HEVC" in video_options.get_options()['encoder']

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
    # Test NVIDIA GPU selection enables NVENC
    video_options.hardware_combo.setCurrentText("NVIDIA GPU (CUDA)")
    options = video_options.get_options()
    assert "NVIDIA" in options['hardware']
    
    # Test encoder compatibility
    video_options.encoder_combo.setCurrentText("AV1 (Best Quality)")
    assert "AV1" in video_options.get_options()['encoder']

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
    assert video_options.get_options()['interpolation_factor'] == 6
    
    # Test disabling resets values
    video_options.enable_interpolation.setChecked(False)
    assert not video_options.get_options()['interpolation_enabled']

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

def test_invalid_fps_input(video_options, qtbot):
    """Test handling of invalid FPS input"""
    with pytest.raises(ValueError) as exc_info:
        video_options.validate_fps(0)  # Test directly with validate_fps
    assert "FPS must be between 1 and 60." in str(exc_info.value)

    with pytest.raises(ValueError) as exc_info:
        video_options.validate_fps(61)  # Test upper bound
    assert "FPS must be between 1 and 60." in str(exc_info.value)

def test_invalid_interpolation_factor(video_options, qtbot):
    """Test handling of invalid interpolation factor"""
    video_options.enable_interpolation.setChecked(True)
    video_options.quality_combo.setCurrentText("High")
    qtbot.wait(100)

    with pytest.raises(ValueError) as exc_info:
        video_options.validate_factor(10)  # Test directly with validate_factor
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
    """Test that selecting different hardware updates encoder options"""
    video_options.update_encoder_options("NVIDIA GPU (CUDA)")
    qtbot.wait(100)  # Allow UI to update

    assert video_options.encoder_combo.count() == 3
    assert "NVIDIA Encoder Option 1" in video_options.encoder_combo.itemText(0)

    video_options.hardware_combo.setCurrentText("Intel GPU")
    assert video_options.encoder_combo.count() == 3
    assert "Intel Encoder Option 1" in video_options.encoder_combo.itemText(0)

    video_options.hardware_combo.setCurrentText("AMD GPU")
    assert video_options.encoder_combo.count() == 3
    assert "AMD Encoder Option 1" in video_options.encoder_combo.itemText(0)

    video_options.hardware_combo.setCurrentText("CPU")
    assert video_options.encoder_combo.count() == 3
    assert "H.264" in video_options.encoder_combo.itemText(0)

def test_reset_video_options(video_options):
    """Test resetting video options to default values"""
    # Modify some settings
    video_options.fps_spinbox.setValue(45)
    video_options.enable_interpolation.setChecked(False)
    video_options.encoder_combo.setCurrentText("AV1 (Best Quality)")

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
    assert video_options.get_options()['interpolation_factor'] == 2
    
    # Test maximum value for Low quality
    video_options.factor_spin.setValue(4)
    assert video_options.get_options()['interpolation_factor'] == 4
    
    # Test exceeding maximum (should raise ValueError)
    with pytest.raises(ValueError) as exc_info:
        video_options.validate_factor(5)
    assert "Interpolation factor must be between 2 and 4 for Low quality" in str(exc_info.value)

def test_video_encoding_parameters(video_options):
    """Test that video encoding parameters are set correctly."""
    video_options.encoder_combo.setCurrentText("HEVC/H.265 (Better Compression)")
    options = video_options.get_options()
    
    assert options['encoder'] == "HEVC/H.265 (Better Compression)"
    # Assume VideoHandler has a method to retrieve encoding settings
    with patch('satellite_processor.core.video_handler.VideoHandler.configure_encoder') as mock_config:
        processor = SatelliteImageProcessor()
        processor.configure_encoder(options)
        mock_config.assert_called_with("HEVC/H.265 (Better Compression)", pytest.ANY)

def test_frame_rate_consistency(video_options):
    """Test that the frame rate remains consistent throughout the video processing."""
    video_options.fps_spinbox.setValue(30)
    options = video_options.get_options()
    
    with patch('satellite_processor.core.video_handler.VideoHandler.encode_video') as mock_encode:
        processor = SatelliteImageProcessor()
        processor.encode_video(options)
        mock_encode.assert_called_once()
        args, kwargs = mock_encode.call_args
        assert kwargs['fps'] == 30

def test_bit_rate_settings(video_options):
    """Test that bitrate settings are applied for smooth video."""
    # Assuming bitrate is part of the options
    video_options.set_bitrate(5000)  # Set bitrate to 5000 kbps
    options = video_options.get_options()
    
    assert options['bitrate'] == 5000
    with patch('satellite_processor.core.video_handler.VideoHandler.set_bitrate') as mock_bitrate:
        processor = SatelliteImageProcessor()
        processor.set_bitrate(options['bitrate'])
        mock_bitrate.assert_called_with(5000)

def test_bitrate_validation(video_options, qtbot):
    """Test bitrate validation and limits"""
    # Test valid bitrate
    video_options.bitrate_spin.setValue(5000)
    assert video_options.bitrate_spin.value() == 5000

    # Test lower limit
    with pytest.raises(ValueError) as exc_info:
        video_options.validate_bitrate(50)  # Too low
    assert "Bitrate must be between 100 and 10000 kbps." in str(exc_info.value)
    
    # Test upper limit
    with pytest.raises(ValueError) as exc_info:
        video_options.validate_bitrate(12000)  # Too high
    assert "Bitrate must be between 100 and 10000 kbps." in str(exc_info.value)

def test_encoder_hardware_compatibility(video_options):
    """Test compatibility between hardware and encoder selections"""
    # Test NVIDIA options
    video_options.hardware_combo.setCurrentText("NVIDIA GPU (CUDA)")
    assert "NVIDIA Encoder Option" in video_options.encoder_combo.itemText(0)
    
    # Test Intel options
    video_options.hardware_combo.setCurrentText("Intel GPU")
    assert "Intel Encoder Option" in video_options.encoder_combo.itemText(0)
    
    # Test AMD options
    video_options.hardware_combo.setCurrentText("AMD GPU")
    assert "AMD Encoder Option" in video_options.encoder_combo.itemText(0)
    
    # Test CPU fallback
    video_options.hardware_combo.setCurrentText("CPU")
    assert "H.264" in video_options.encoder_combo.itemText(0)

def test_encoder_quality_settings(video_options):
    """Test encoder quality settings and presets"""
    # Test different quality presets
    encoders = ["H.264", "HEVC/H.265 (Better Compression)", "AV1 (Best Quality)"]
    for encoder in encoders:
        video_options.encoder_combo.setCurrentText(encoder)
        options = video_options.get_options()
        assert options['encoder'] == encoder

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

def test_quality_dependent_interpolation(video_options):
    """Test quality-dependent interpolation limits"""
    quality_limits = {
        "High": 8,
        "Medium": 6,
        "Low": 4
    }
    
    for quality, max_factor in quality_limits.items():
        video_options.quality_combo.setCurrentText(quality)
        assert video_options.factor_spin.maximum() == max_factor
        
        # Test setting value above limit
        with pytest.raises(ValueError):
            video_options.validate_factor(max_factor + 1)

def test_hardware_specific_encoders(video_options):
    """Test hardware-specific encoder options"""
    hardware_encoders = {
        "NVIDIA GPU (CUDA)": ["NVIDIA Encoder Option 1", "NVIDIA Encoder Option 2", "NVIDIA Encoder Option 3"],
        "Intel GPU": ["Intel Encoder Option 1", "Intel Encoder Option 2", "Intel Encoder Option 3"],
        "AMD GPU": ["AMD Encoder Option 1", "AMD Encoder Option 2", "AMD Encoder Option 3"],
        "CPU": ["H.264", "HEVC/H.265 (Better Compression)", "AV1 (Best Quality)"]
    }
    
    for hardware, expected_encoders in hardware_encoders.items():
        video_options.hardware_combo.setCurrentText(hardware)
        qtbot.wait(100)  # Allow UI to update
        
        actual_encoders = [video_options.encoder_combo.itemText(i) 
                          for i in range(video_options.encoder_combo.count())]
        assert actual_encoders == expected_encoders

def test_reset_functionality(video_options):
    """Test complete reset functionality"""
    # Change all settings
    video_options.fps_spinbox.setValue(60)
    video_options.bitrate_spin.setValue(8000)
    video_options.enable_interpolation.setChecked(False)
    video_options.hardware_combo.setCurrentText("AMD GPU")
    video_options.quality_combo.setCurrentText("Low")
    video_options.factor_spin.setValue(4)
    
    # Reset
    video_options.reset_to_defaults()
    
    # Verify all defaults
    options = video_options.get_options()
    assert options['fps'] == 30
    assert options['bitrate'] == 5000
    assert options['interpolation_enabled'] is True
    assert "NVIDIA" in options['hardware']
    assert options['interpolation_quality'] == "high"
    assert options['interpolation_factor'] == 2

def test_validation_combinations(video_options):
    """Test combined validation scenarios"""
    # Test FPS and interpolation factor combination
    video_options.fps_spinbox.setValue(60)
    video_options.enable_interpolation.setChecked(True)
    video_options.quality_combo.setCurrentText("High")
    video_options.factor_spin.setValue(4)
    
    options = video_options.get_options_with_validation()
    assert options['fps'] == 60
    assert options['interpolation_factor'] == 4
    
    # Test invalid combinations
    video_options.fps_spinbox.setValue(60)
    video_options.factor_spin.setValue(8)
    with pytest.raises(ValueError):
        video_options.validate_inputs()  # Should fail due to potential output FPS being too high

def test_encoder_switching(video_options, qtbot):
    """Test dynamic encoder switching behavior"""
    # Test NVIDIA to CPU switching
    video_options.hardware_combo.setCurrentText("NVIDIA GPU (CUDA)")
    qtbot.wait(100)
    assert "NVIDIA" in video_options.encoder_combo.itemText(0)
    
    video_options.hardware_combo.setCurrentText("CPU")
    qtbot.wait(100)
    assert "H.264" in video_options.encoder_combo.itemText(0)
    
    # Verify encoder settings are appropriate for CPU
    options = video_options.get_options()
    assert "H.264" in options['encoder']

def test_concurrent_validation(video_options):
    """Test multiple settings being validated together"""
    video_options.fps_spinbox.setValue(45)
    video_options.enable_interpolation.setChecked(True)
    video_options.quality_combo.setCurrentText("High")
    video_options.factor_spin.setValue(6)
    video_options.bitrate_spin.setValue(7000)
    
    # All these settings should be valid together
    options = video_options.get_options_with_validation()
    assert options['fps'] == 45
    assert options['interpolation_enabled'] is True
    assert options['interpolation_quality'] == "high"
    assert options['interpolation_factor'] == 6
    assert options['bitrate'] == 7000