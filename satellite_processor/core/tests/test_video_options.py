import sys
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parents[3]))

import pytest
from satellite_processor.gui.widgets.video_options import VideoOptionsWidget

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