import pytest
from PyQt6.QtWidgets import QApplication
from satellite_processor.gui.widgets.video_options import VideoOptionsWidget  # Corrected import
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

# Required for Qt widget testing
@pytest.fixture
def app():
    return QApplication([])

@pytest.fixture
def video_options(app):
    return VideoOptionsWidget()

def test_video_processing(video_options):
    # Test default values
    options = video_options.get_options()
    assert options['fps'] == 30
    assert options['interpolation_enabled'] == True
    assert options['interpolation_factor'] == 2

def test_video_format_support(video_options):
    # Test encoder options
    assert video_options.encoder_combo.count() == 3
    assert "H.264" in video_options.encoder_combo.itemText(0)
    assert "HEVC" in video_options.encoder_combo.itemText(1)
    assert "AV1" in video_options.encoder_combo.itemText(2)

def test_video_resolution_handling(video_options):
    # Test FPS spinbox range
    assert video_options.fps_spinbox.minimum() == 1
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

def test_invalid_fps_input(video_options):
    """Test handling of invalid FPS input"""
    video_options.fps_spinbox.setValue(0)  # Invalid FPS
    with pytest.raises(ValueError):
        video_options.get_options()

    video_options.fps_spinbox.setValue(100)  # Exceeds maximum
    with pytest.raises(ValueError):
        video_options.get_options()

def test_invalid_interpolation_factor(video_options):
    """Test handling of invalid interpolation factor"""
    video_options.quality_combo.setCurrentText("High")
    video_options.factor_spin.setValue(10)  # Exceeds maximum for High quality
    with pytest.raises(ValueError):
        video_options.get_options()

    video_options.quality_combo.setCurrentText("Low")
    video_options.factor_spin.setValue(1)  # Below minimum
    with pytest.raises(ValueError):
        video_options.get_options()

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

def test_hardware_selection_affects_encoder_options(video_options):
    """Test that selecting different hardware updates encoder options"""
    video_options.hardware_combo.setCurrentText("NVIDIA GPU (CUDA)")
    assert video_options.encoder_combo.count() == 3
    assert "NVIDIA Encoder Option 1" in video_options.encoder_combo.itemText(0)
    assert "NVIDIA Encoder Option 2" in video_options.encoder_combo.itemText(1)
    assert "NVIDIA Encoder Option 3" in video_options.encoder_combo.itemText(2)

    video_options.hardware_combo.setCurrentText("CPU")
    assert video_options.encoder_combo.count() == 3
    assert "CPU Encoder Option 1" in video_options.encoder_combo.itemText(0)
    assert "CPU Encoder Option 2" in video_options.encoder_combo.itemText(1)
    assert "CPU Encoder Option 3" in video_options.encoder_combo.itemText(2)

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