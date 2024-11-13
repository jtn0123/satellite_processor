# Satellite Image Processor

A powerful Qt-based application specifically designed for processing NOAA GOES satellite imagery and creating animations from the processed images.

## NOAA GOES Satellite Support

This application is specifically designed to process images from NOAA's Geostationary Operational Environmental Satellites (GOES), including:
- GOES-16 (GOES-East)
- GOES-18 (GOES-West replacement)

### Supported Image Formats

#### Input Requirements
- **File Format:** PNG images exported from GOES satellite data
- **Naming Convention:** Must follow GOES naming format (e.g., `G16_13_YYYYMMDDTHHMMSSZ.png`)
- **Resolution:** Full resolution GOES images (typically 5424×5424 or 10848×10848 pixels)
- **Bit Depth:** 8-bit or 16-bit grayscale images
- **Channels Supported:**
  - Channel 13 (Clean Infrared)
  - Channel 02 (Red Visible)
  - Channel 07 (Shortwave IR)
  - Multi-channel composites

#### Output Formats
- **Video:** MP4 files with configurable codecs
  - H.264 (default, maximum compatibility)
  - HEVC/H.265 (better compression)
  - AV1 (best quality)
- **Images:** 
  - PNG (lossless)
  - JPEG (configurable quality)
  - TIFF (for further processing)

### GOES Image Processing Features
- **False Color Generation:**
  - Uses Sanchez algorithm for atmospheric penetration
  - Multiple color schemes available
  - Custom underlay map support
- **Image Enhancement:**
  - Automatic contrast enhancement
  - Temperature-based colorization
  - Cloud top enhancement
- **Timestamp Overlay:**
  - Automatic extraction from GOES filename
  - Configurable format and position
  - UTC/Local time display

## Features

- **Image Processing**
  - Batch processing of satellite images
  - Cropping and scaling options
  - Timestamp overlay support
  - False color processing using Sanchez
  - Multi-threaded processing for improved performance
  - Progress tracking and error handling

- **Video Creation**
  - Create animations from processed images
  - Configurable FPS and duration
  - Multiple codec support (H.264, HEVC, AV1)
  - Hardware acceleration options (NVIDIA NVENC, Intel QSV, AMD AMF)
  - Custom frame interpolation options

- **Advanced Features**
  - Frame interpolation (Linear, Cubic, AI-based)
  - Multiple false color methods
  - Real-time system resource monitoring (CPU, RAM, GPU)
  - Progress tracking and detailed status updates
  - Drag and drop file support
  - Settings persistence
  - Error handling and logging

## Requirements

### Software Requirements
- Python 3.9 or higher
- FFmpeg (must be installed and in system PATH)
- Sanchez (optional, for false color processing)
- NVIDIA GPU drivers (optional, for NVENC hardware acceleration)

### Python Package Requirements
```bash
# Install all required packages
pip install -r requirements.txt

# Or install individually:
pip install PyQt6>=6.4.0
pip install opencv-python>=4.6.0
pip install numpy>=1.23.0
pip install pillow>=9.3.0
pip install psutil>=5.9.0
pip install wmi>=1.5.1        # For Windows system monitoring
pip install pynvml>=11.4.1    # For NVIDIA GPU monitoring
pip install ffmpeg-python>=0.2.0
pip install typing-extensions>=4.4.0
pip install requests>=2.28.0
pip install pathlib>=1.0.1
```

## Installation

// ...existing installation section...

## Usage for GOES Imagery

1. **Obtain GOES Images:**
   - Download from NOAA's data servers or pull from sat
   - Use GOES tools like GeoNetcast
   - Support for direct GRB data feed (with additional tools)

2. **Prepare Images:**
   - Ensure files follow naming convention
   - Place in a single directory
   - Images should be in chronological order by text nameing

3. **Process Images:**
   - Select input directory containing GOES images
   - Choose desired false color method
   - Configure timestamp and enhancement options
   - Select output format and location

4. **Create Animation:**
   - Set desired frame rate (typical 10-30 fps)
   - Choose interpolation method if desired
   - Select video codec and quality settings
   - Generate final animation

### Recommended Settings for GOES

#### False Color Processing
- **Standard Method:** Best for general viewing
- **Enhanced Method:** Better for storm structure
- **Natural:** Best for daytime imagery
- **Fire Detection:** Optimized for hot spot detection

#### Frame Settings
- **Frame Rate:** 10-15 fps for smooth motion
- **Duration:** 0.5-1.0 seconds per frame
- **Interpolation:** Recommended for >30 minute intervals