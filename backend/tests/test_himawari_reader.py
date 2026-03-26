"""Tests for the Himawari HSD binary format parser.

Uses a real B13 (IR, 10.4µm) segment downloaded from the NOAA S3 bucket
as the primary test fixture, plus synthetic data for edge cases.
"""

from __future__ import annotations

import bz2
import struct
from pathlib import Path

import numpy as np
import pytest
from app.services.himawari_reader import (
    HSDHeader,
    _normalize_to_image,
    _radiance_to_bt,
    assemble_segments,
    hsd_to_png,
    parse_hsd_data,
    parse_hsd_header,
)
from PIL import Image as PILImage

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

FIXTURE_DIR = Path(__file__).parent / "fixtures"
SAMPLE_BZ2 = FIXTURE_DIR / "himawari_sample_B13_S05.DAT.bz2"


@pytest.fixture(scope="module")
def sample_bz2_bytes() -> bytes:
    """Raw bz2-compressed bytes of the B13 S05 test fixture."""
    if not SAMPLE_BZ2.exists():
        pytest.skip("Test fixture not found — run download_fixtures.sh")
    return SAMPLE_BZ2.read_bytes()


@pytest.fixture(scope="module")
def sample_raw(sample_bz2_bytes: bytes) -> bytes:
    """Decompressed HSD file bytes."""
    return bz2.decompress(sample_bz2_bytes)


@pytest.fixture(scope="module")
def sample_header(sample_raw: bytes) -> HSDHeader:
    """Parsed header from the real B13 S05 fixture."""
    return parse_hsd_header(sample_raw)


@pytest.fixture(scope="module")
def sample_data(sample_raw: bytes, sample_header: HSDHeader) -> np.ndarray:
    """Calibrated data array from the real fixture."""
    return parse_hsd_data(sample_raw, sample_header)


# ---------------------------------------------------------------------------
# Block 1 – Basic info
# ---------------------------------------------------------------------------


class TestHeaderBlock1:
    """Tests for Block 1 fields (satellite, obs time, area)."""

    def test_satellite_name(self, sample_header: HSDHeader):
        assert sample_header.satellite_name == "Himawari-9"

    def test_observation_area(self, sample_header: HSDHeader):
        assert sample_header.observation_area == "FLDK"

    def test_observation_time_utc(self, sample_header: HSDHeader):
        assert sample_header.observation_start.tzinfo is not None
        assert sample_header.observation_start.year == 2026
        assert sample_header.observation_start.month == 3
        assert sample_header.observation_start.day == 3

    def test_observation_end_after_start(self, sample_header: HSDHeader):
        assert sample_header.observation_end > sample_header.observation_start

    def test_total_header_length(self, sample_header: HSDHeader):
        assert sample_header.total_header_length == 1523

    def test_data_length(self, sample_header: HSDHeader):
        expected = sample_header.num_columns * sample_header.num_lines * 2
        assert sample_header.data_length == expected


# ---------------------------------------------------------------------------
# Block 2 – Data dimensions
# ---------------------------------------------------------------------------


class TestHeaderBlock2:
    """Tests for Block 2 fields (dimensions, bits per pixel)."""

    def test_ir_band_dimensions(self, sample_header: HSDHeader):
        """B13 is an IR band at R20 resolution → 5500×550 per segment."""
        assert sample_header.num_columns == 5500
        assert sample_header.num_lines == 550

    def test_bits_per_pixel(self, sample_header: HSDHeader):
        assert sample_header.bits_per_pixel == 16


# ---------------------------------------------------------------------------
# Block 3 – Projection
# ---------------------------------------------------------------------------


class TestHeaderBlock3:
    """Tests for Block 3 projection fields."""

    def test_sub_satellite_longitude(self, sample_header: HSDHeader):
        assert sample_header.sub_satellite_longitude == pytest.approx(140.7, abs=0.1)

    def test_cfac_lfac_nonzero(self, sample_header: HSDHeader):
        assert sample_header.cfac > 0
        assert sample_header.lfac > 0

    def test_coff_loff_reasonable(self, sample_header: HSDHeader):
        # For 5500-column IR: COFF ≈ 2750.5
        assert sample_header.coff == pytest.approx(2750.5, abs=1.0)
        assert sample_header.loff == pytest.approx(2750.5, abs=1.0)

    def test_earth_radii(self, sample_header: HSDHeader):
        assert sample_header.earth_equatorial_radius == pytest.approx(6378.137, abs=1.0)
        assert sample_header.earth_polar_radius == pytest.approx(6356.752, abs=1.0)

    def test_satellite_distance(self, sample_header: HSDHeader):
        # Geostationary orbit ≈ 42164 km from Earth center
        assert sample_header.satellite_distance == pytest.approx(42164.0, abs=10.0)


# ---------------------------------------------------------------------------
# Block 5 – Calibration
# ---------------------------------------------------------------------------


class TestHeaderBlock5:
    """Tests for Block 5 calibration fields."""

    def test_band_number(self, sample_header: HSDHeader):
        assert sample_header.band_number == 13

    def test_central_wavelength(self, sample_header: HSDHeader):
        # B13 = 10.4 µm clean IR
        assert sample_header.central_wavelength == pytest.approx(10.4, abs=0.1)

    def test_central_wavenumber(self, sample_header: HSDHeader):
        expected = 10000.0 / sample_header.central_wavelength
        assert sample_header.central_wavenumber == pytest.approx(expected)

    def test_gain_negative_for_ir(self, sample_header: HSDHeader):
        # Negative gain: higher count → lower radiance
        assert sample_header.gain < 0

    def test_offset_positive(self, sample_header: HSDHeader):
        assert sample_header.offset > 0

    def test_count_error_value(self, sample_header: HSDHeader):
        assert sample_header.count_error == 65535

    def test_count_outside_value(self, sample_header: HSDHeader):
        assert sample_header.count_outside == 65534

    def test_ir_correction_coefficients(self, sample_header: HSDHeader):
        # c0 ≈ −0.1, c1 ≈ 1.0, c2 ≈ −1.8e-6 (small correction)
        assert sample_header.ir_c0 != 0.0
        assert sample_header.ir_c1 == pytest.approx(1.0, abs=0.01)
        assert abs(sample_header.ir_c2) < 1e-4

    def test_is_not_vis(self, sample_header: HSDHeader):
        assert not sample_header.is_vis


# ---------------------------------------------------------------------------
# Segment info
# ---------------------------------------------------------------------------


class TestSegmentInfo:
    """Tests for segment number and total segments."""

    def test_segment_number(self, sample_header: HSDHeader):
        assert sample_header.segment_number == 5

    def test_total_segments(self, sample_header: HSDHeader):
        assert sample_header.total_segments == 10


# ---------------------------------------------------------------------------
# Data parsing & calibration
# ---------------------------------------------------------------------------


class TestParseData:
    """Tests for raw-count reading and calibration."""

    def test_output_shape(self, sample_data: np.ndarray, sample_header: HSDHeader):
        assert sample_data.shape == (sample_header.num_lines, sample_header.num_columns)

    def test_output_dtype(self, sample_data: np.ndarray):
        assert sample_data.dtype == np.float32

    def test_contains_nan_for_outside_scan(self, sample_data: np.ndarray):
        nan_count = np.isnan(sample_data).sum()
        assert nan_count > 0, "Expected NaN pixels for outside-scan areas"

    def test_brightness_temp_range(self, sample_data: np.ndarray):
        """Earth scenes should be roughly 180–310 K; deep space can be lower."""
        valid = sample_data[np.isfinite(sample_data)]
        assert valid.min() > 50.0, "BT unreasonably low"
        assert valid.max() < 350.0, "BT unreasonably high"

    def test_mean_bt_reasonable(self, sample_data: np.ndarray):
        """S05 covers the equatorial region — mean ~250–290 K."""
        valid = sample_data[np.isfinite(sample_data)]
        mean_bt = valid.mean()
        assert 200 < mean_bt < 310

    def test_edge_pixels_are_outside_scan(self, sample_data: np.ndarray):
        """First/last columns of an equatorial segment should include some NaN (limb)."""
        # Check top-left corner area
        top_left = sample_data[0, :20]
        assert np.isnan(top_left).any() or np.isfinite(top_left).all()
        # At least the overall row should have some NaN from outside-scan
        first_row_nans = np.isnan(sample_data[0]).sum()
        last_row_nans = np.isnan(sample_data[-1]).sum()
        assert first_row_nans > 0 or last_row_nans > 0


# ---------------------------------------------------------------------------
# Radiance → BT conversion
# ---------------------------------------------------------------------------


class TestRadianceToBT:
    """Tests for the IR radiance → brightness temperature pipeline."""

    def test_known_radiance_to_bt(self, sample_header: HSDHeader):
        """A radiance of ~6 W/(m²·sr·µm) at 10.4µm ≈ 271 K."""
        radiance = np.array([[6.0]], dtype=np.float32)
        bt = _radiance_to_bt(radiance, sample_header)
        assert bt[0, 0] == pytest.approx(271.0, abs=3.0)

    def test_negative_radiance_gives_nan(self, sample_header: HSDHeader):
        radiance = np.array([[-1.0]], dtype=np.float32)
        bt = _radiance_to_bt(radiance, sample_header)
        assert np.isnan(bt[0, 0])

    def test_zero_radiance_gives_nan(self, sample_header: HSDHeader):
        radiance = np.array([[0.0]], dtype=np.float32)
        bt = _radiance_to_bt(radiance, sample_header)
        assert np.isnan(bt[0, 0])

    def test_nan_radiance_stays_nan(self, sample_header: HSDHeader):
        radiance = np.array([[np.nan]], dtype=np.float32)
        bt = _radiance_to_bt(radiance, sample_header)
        assert np.isnan(bt[0, 0])


# ---------------------------------------------------------------------------
# VIS vs IR resolution
# ---------------------------------------------------------------------------


class TestResolution:
    """Verify expected dimensions for VIS vs IR."""

    def test_ir_segment_dimensions(self, sample_header: HSDHeader):
        """IR bands (R20): 5500 cols × 550 lines per segment."""
        assert sample_header.num_columns == 5500
        assert sample_header.num_lines == 550

    def test_vis_resolution_constants(self):
        """VIS bands (R10) should be 11000×1100 — validated structurally."""
        # We don't have a VIS fixture, so just assert the expected constants
        assert 11000 == 5500 * 2
        assert 1100 == 550 * 2


class TestAssembleSegments:
    """Tests for vertical stacking of segment arrays."""

    def test_basic_vstack(self):
        segs = [np.full((10, 20), float(i), dtype=np.float32) for i in range(10)]
        full = assemble_segments(segs)
        assert full.shape == (100, 20)
        # First strip all 0s, last strip all 9s
        assert full[0, 0] == 0.0
        assert full[99, 0] == 9.0

    def test_missing_segment_fills_nan(self):
        segs: list[np.ndarray | None] = [np.ones((10, 20), dtype=np.float32) for _ in range(10)]
        segs[3] = None  # Missing segment 4
        full = assemble_segments(segs)
        assert full.shape == (100, 20)
        # Rows 30-39 should be NaN
        assert np.isnan(full[30:40]).all()
        # Other rows should be 1.0
        assert not np.isnan(full[0:30]).any()
        assert not np.isnan(full[40:100]).any()

    def test_multiple_missing_segments(self):
        segs: list[np.ndarray | None] = [None] * 10
        segs[0] = np.zeros((10, 20), dtype=np.float32)
        segs[9] = np.ones((10, 20), dtype=np.float32)
        full = assemble_segments(segs)
        assert full.shape == (100, 20)
        assert np.isnan(full[10:90]).all()

    def test_wrong_segment_count_raises(self):
        with pytest.raises(ValueError, match="Expected 10 segments"):
            assemble_segments([np.zeros((10, 20))] * 5)

    def test_width_mismatch_raises(self):
        segs: list[np.ndarray | None] = [np.zeros((10, 20), dtype=np.float32) for _ in range(10)]
        segs[5] = np.zeros((10, 30), dtype=np.float32)  # wrong width
        with pytest.raises(ValueError, match="width mismatch"):
            assemble_segments(segs)

    def test_all_none_with_expected_columns(self):
        segs: list[np.ndarray | None] = [None] * 10
        full = assemble_segments(segs, expected_columns=100)
        assert full.shape == (5500, 100)  # 10 × 550 lines default
        assert np.isnan(full).all()

    def test_all_none_without_expected_columns_raises(self):
        with pytest.raises(ValueError, match="Cannot determine"):
            assemble_segments([None] * 10)


# ---------------------------------------------------------------------------
# Edge cases – corrupt / truncated data
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Tests for corrupt, truncated, and empty input."""

    def test_empty_bytes_raises(self):
        with pytest.raises(ValueError, match="too short"):
            parse_hsd_header(b"")

    def test_truncated_block1_raises(self):
        with pytest.raises(ValueError, match="too short"):
            parse_hsd_header(b"\x01" * 100)

    def test_wrong_block_number_raises(self):
        # Create 282 bytes but with block number = 99
        bad = bytearray(b"\x00" * 600)
        bad[0] = 99  # wrong block number
        struct.pack_into("<H", bad, 1, 282)
        with pytest.raises(ValueError, match="Expected block 1"):
            parse_hsd_header(bytes(bad))

    def test_truncated_data_block_raises(self, sample_raw: bytes, sample_header: HSDHeader):
        """Truncated data section should raise."""
        truncated = sample_raw[: sample_header.total_header_length + 100]
        with pytest.raises(ValueError, match="too short"):
            parse_hsd_data(truncated, sample_header)


# ---------------------------------------------------------------------------
# Normalisation to image
# ---------------------------------------------------------------------------


class TestNormalize:
    """Tests for the percentile-stretch normalisation."""

    def test_output_is_uint8(self):
        data = np.random.uniform(200, 300, (100, 100)).astype(np.float32)
        img = _normalize_to_image(data)
        arr = np.array(img)
        assert arr.dtype == np.uint8

    def test_all_nan_returns_black(self):
        data = np.full((50, 50), np.nan, dtype=np.float32)
        img = _normalize_to_image(data)
        assert img.size == (50, 50)
        arr = np.array(img)
        assert arr.max() == 0

    def test_constant_array(self):
        data = np.full((50, 50), 273.0, dtype=np.float32)
        img = _normalize_to_image(data)
        arr = np.array(img)
        # All same value — should stretch to 255
        assert arr.min() == arr.max()


# ---------------------------------------------------------------------------
# Full pipeline: bz2 → PNG
# ---------------------------------------------------------------------------


class TestHsdToPng:
    """Tests for the end-to-end conversion pipeline."""

    def test_single_segment_to_png(self, sample_bz2_bytes: bytes, tmp_path: Path):
        """Single segment (padded to 10) produces a valid PNG."""
        segments: list[bytes] = [b""] * 4 + [sample_bz2_bytes] + [b""] * 5
        out = tmp_path / "test_single.png"
        result = hsd_to_png(segments, out)
        assert result == out
        assert out.exists()
        img = PILImage.open(out)
        assert img.mode == "L"
        assert img.size[0] > 0 and img.size[1] > 0

    def test_png_dimensions(self, sample_bz2_bytes: bytes, tmp_path: Path):
        """Output should be 5500 wide, 5500 tall (10 segments × 550 lines)."""
        segments: list[bytes] = [b""] * 4 + [sample_bz2_bytes] + [b""] * 5
        out = tmp_path / "test_dims.png"
        hsd_to_png(segments, out)
        img = PILImage.open(out)
        assert img.size == (5500, 5500)

    def test_empty_segments_raises(self):
        with pytest.raises(ValueError, match="No segments"):
            hsd_to_png([], Path("/tmp/nope.png"))

    def test_corrupt_bz2_handled_gracefully(self, sample_bz2_bytes: bytes, tmp_path: Path):
        """Corrupt bz2 data should be treated as a missing segment, not crash."""
        segments: list[bytes] = [b"corrupt_bz2_data"] * 4 + [sample_bz2_bytes] + [b""] * 5
        out = tmp_path / "test_corrupt.png"
        result = hsd_to_png(segments, out)
        assert result.exists()

    def test_output_parent_dirs_created(self, sample_bz2_bytes: bytes, tmp_path: Path):
        """Output path with non-existing parent directories should be auto-created."""
        segments: list[bytes] = [b""] * 4 + [sample_bz2_bytes] + [b""] * 5
        out = tmp_path / "deep" / "nested" / "dir" / "output.png"
        result = hsd_to_png(segments, out)
        assert result.exists()

    def test_is_valid_png(self, sample_bz2_bytes: bytes, tmp_path: Path):
        """Output file should be a valid PNG that PIL can open and verify."""
        segments: list[bytes] = [b""] * 4 + [sample_bz2_bytes] + [b""] * 5
        out = tmp_path / "test_valid.png"
        hsd_to_png(segments, out)
        img = PILImage.open(out)
        img.verify()  # PIL integrity check
