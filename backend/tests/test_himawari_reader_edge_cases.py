"""Edge case tests for Himawari HSD reader — covers malformed headers,
invalid segments, and missing data scenarios.
"""

from __future__ import annotations

import bz2
import struct
from pathlib import Path

import numpy as np
import pytest
from app.services.himawari_reader import (
    HSDHeader,
    _decompress_and_parse_segment,
    _detect_segment_dimensions,
    _find_segment_info,
    _parse_block1,
    _parse_block2,
    _parse_block3,
    _parse_block5_calibration,
    assemble_segments,
    hsd_to_png,
    parse_hsd_data,
    parse_hsd_header,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

FIXTURE_DIR = Path(__file__).parent / "fixtures"
SAMPLE_BZ2 = FIXTURE_DIR / "himawari_sample_B13_S05.DAT.bz2"


@pytest.fixture(scope="module")
def sample_bz2_bytes() -> bytes:
    if not SAMPLE_BZ2.exists():
        pytest.skip("Test fixture not found")
    return SAMPLE_BZ2.read_bytes()


@pytest.fixture(scope="module")
def sample_raw(sample_bz2_bytes: bytes) -> bytes:
    return bz2.decompress(sample_bz2_bytes)


@pytest.fixture(scope="module")
def sample_header(sample_raw: bytes) -> HSDHeader:
    return parse_hsd_header(sample_raw)


# ---------------------------------------------------------------------------
# Malformed HSD header tests
# ---------------------------------------------------------------------------


class TestMalformedHeaders:
    """Tests for malformed/corrupt HSD headers."""

    def test_empty_bytes_raises(self):
        with pytest.raises(ValueError, match="too short"):
            parse_hsd_header(b"")

    def test_one_byte_raises(self):
        with pytest.raises(ValueError, match="too short"):
            parse_hsd_header(b"\x01")

    def test_exactly_281_bytes_raises(self):
        """One byte short of Block 1 minimum."""
        with pytest.raises(ValueError, match="too short"):
            parse_hsd_header(b"\x00" * 281)

    def test_wrong_block1_number_raises(self):
        """Block 1 must be number 1."""
        bad = bytearray(b"\x00" * 600)
        bad[0] = 99  # wrong block number
        struct.pack_into("<H", bad, 1, 282)
        with pytest.raises(ValueError, match="Expected block 1"):
            parse_hsd_header(bytes(bad))

    def test_block1_number_zero_raises(self):
        bad = bytearray(b"\x00" * 600)
        bad[0] = 0
        struct.pack_into("<H", bad, 1, 282)
        with pytest.raises(ValueError, match="Expected block 1"):
            parse_hsd_header(bytes(bad))

    def test_truncated_block2_raises(self):
        """Valid Block 1 length but data truncated before Block 2."""
        bad = bytearray(b"\x00" * 300)
        bad[0] = 1
        struct.pack_into("<H", bad, 1, 282)  # b1_len = 282
        # Data ends at 300, Block 2 starts at 282 and needs 50 bytes -> 332
        with pytest.raises(ValueError, match="too short for Block 2"):
            parse_hsd_header(bytes(bad))

    def test_wrong_block2_number_raises(self):
        """Block 2 should have block number 2."""
        bad = bytearray(b"\x00" * 700)
        bad[0] = 1
        struct.pack_into("<H", bad, 1, 282)
        # Block 2 at offset 282
        bad[282] = 99  # wrong block number
        struct.pack_into("<H", bad, 283, 50)
        with pytest.raises(ValueError, match="Expected block 2"):
            parse_hsd_header(bytes(bad))

    def test_truncated_block3_raises(self):
        """Valid Block 1 + 2 but Block 3 truncated."""
        bad = bytearray(b"\x00" * 340)
        bad[0] = 1
        struct.pack_into("<H", bad, 1, 282)
        bad[282] = 2
        struct.pack_into("<H", bad, 283, 50)
        # Block 3 starts at 332, data ends at 340 -- need 127 bytes
        with pytest.raises(ValueError, match="too short for Block 3"):
            parse_hsd_header(bytes(bad))

    def test_wrong_block3_number_raises(self):
        bad = bytearray(b"\x00" * 1200)
        bad[0] = 1
        struct.pack_into("<H", bad, 1, 282)
        bad[282] = 2
        struct.pack_into("<H", bad, 283, 50)
        bad[332] = 99  # wrong block number
        struct.pack_into("<H", bad, 333, 127)
        with pytest.raises(ValueError, match="Expected block 3"):
            parse_hsd_header(bytes(bad))

    def test_truncated_block5_raises(self):
        """Valid Block 1-4 but Block 5 truncated."""
        bad = bytearray(b"\x00" * 600)
        bad[0] = 1
        struct.pack_into("<H", bad, 1, 282)
        bad[282] = 2
        struct.pack_into("<H", bad, 283, 50)
        bad[332] = 3
        struct.pack_into("<H", bad, 333, 127)
        bad[459] = 4
        struct.pack_into("<H", bad, 460, 139)
        # Block 5 starts at 598, data ends at 600 -- need 35 bytes
        with pytest.raises(ValueError, match="too short for Block 5"):
            parse_hsd_header(bytes(bad))

    def test_wrong_block5_number_raises(self):
        bad = bytearray(b"\x00" * 1800)
        bad[0] = 1
        struct.pack_into("<H", bad, 1, 282)
        bad[282] = 2
        struct.pack_into("<H", bad, 283, 50)
        bad[332] = 3
        struct.pack_into("<H", bad, 333, 127)
        bad[459] = 4
        struct.pack_into("<H", bad, 460, 139)
        bad[598] = 99  # wrong block number
        struct.pack_into("<H", bad, 599, 200)
        with pytest.raises(ValueError, match="Expected block 5"):
            parse_hsd_header(bytes(bad))


# ---------------------------------------------------------------------------
# Data parsing with wrong data types / truncated data
# ---------------------------------------------------------------------------


class TestParseDataEdgeCases:
    """Tests for data block edge cases."""

    def test_truncated_data_block_raises(self, sample_raw: bytes, sample_header: HSDHeader):
        truncated = sample_raw[: sample_header.total_header_length + 100]
        with pytest.raises(ValueError, match="too short"):
            parse_hsd_data(truncated, sample_header)

    def test_data_exactly_at_boundary_raises(self, sample_raw: bytes, sample_header: HSDHeader):
        """Data ending exactly at header boundary (zero pixels)."""
        exactly_header = sample_raw[: sample_header.total_header_length]
        with pytest.raises(ValueError, match="too short"):
            parse_hsd_data(exactly_header, sample_header)

    def test_all_error_counts_produce_all_nan(self, sample_raw: bytes, sample_header: HSDHeader):
        """If every pixel is the error count, result should be all NaN."""
        n_pixels = sample_header.num_columns * sample_header.num_lines
        error_data = struct.pack(f"<{n_pixels}H", *([sample_header.count_error] * n_pixels))
        fake = sample_raw[: sample_header.total_header_length] + error_data
        result = parse_hsd_data(fake, sample_header)
        assert np.isnan(result).all()

    def test_all_outside_counts_produce_all_nan(self, sample_raw: bytes, sample_header: HSDHeader):
        """If every pixel is outside-scan count, result should be all NaN."""
        n_pixels = sample_header.num_columns * sample_header.num_lines
        outside_data = struct.pack(f"<{n_pixels}H", *([sample_header.count_outside] * n_pixels))
        fake = sample_raw[: sample_header.total_header_length] + outside_data
        result = parse_hsd_data(fake, sample_header)
        assert np.isnan(result).all()


# ---------------------------------------------------------------------------
# Invalid segment numbers
# ---------------------------------------------------------------------------


class TestInvalidSegments:
    """Tests for invalid segment number handling."""

    def test_segment_number_zero_from_block7(self):
        """If segment number is 0 from filename but block 7 provides it."""
        data = bytearray(b"\x00" * 20)
        data[0] = 7  # block number
        struct.pack_into("<H", data, 1, 10)  # block length
        data[3] = 10  # total_segments
        data[4] = 3  # segment_seq
        total_segs, seg_num = _find_segment_info(bytes(data), 0, 1, 0)
        assert total_segs == 10
        assert seg_num == 3

    def test_segment_number_preserved_if_nonzero(self):
        """If segment_number is already non-zero, block 7 shouldn't override it."""
        data = bytearray(b"\x00" * 20)
        data[0] = 7
        struct.pack_into("<H", data, 1, 10)
        data[3] = 10
        data[4] = 7  # different segment
        total_segs, seg_num = _find_segment_info(bytes(data), 0, 1, 5)
        assert seg_num == 5  # preserved original

    def test_no_block7_uses_defaults(self):
        """With no block 7 in remaining blocks, defaults apply."""
        data = bytearray(b"\x00" * 20)
        data[0] = 8  # not block 7
        struct.pack_into("<H", data, 1, 10)
        total_segs, seg_num = _find_segment_info(bytes(data), 0, 1, 0)
        assert total_segs == 10
        assert seg_num == 0

    def test_truncated_remaining_blocks(self):
        """Truncated data during block walk should not crash."""
        total_segs, seg_num = _find_segment_info(b"\x00", 0, 5, 0)
        assert total_segs == 10  # default
        assert seg_num == 0


# ---------------------------------------------------------------------------
# Missing segments in assembly
# ---------------------------------------------------------------------------


class TestMissingSegmentsAssembly:
    """Tests for segment assembly with various missing patterns."""

    def test_first_segment_missing(self):
        segs: list[np.ndarray | None] = [None] + [np.ones((10, 20), dtype=np.float32) for _ in range(9)]
        full = assemble_segments(segs)
        assert full.shape == (100, 20)
        assert np.isnan(full[0:10]).all()
        assert not np.isnan(full[10:100]).any()

    def test_last_segment_missing(self):
        segs: list[np.ndarray | None] = [np.ones((10, 20), dtype=np.float32) for _ in range(9)] + [None]
        full = assemble_segments(segs)
        assert np.isnan(full[90:100]).all()
        assert not np.isnan(full[0:90]).any()

    def test_alternating_missing(self):
        segs: list[np.ndarray | None] = [None if i % 2 == 0 else np.ones((10, 20), dtype=np.float32) for i in range(10)]
        full = assemble_segments(segs)
        for i in range(10):
            block = full[i * 10 : (i + 1) * 10]
            if i % 2 == 0:
                assert np.isnan(block).all()
            else:
                assert (block == 1.0).all()

    def test_only_one_segment_present(self):
        segs: list[np.ndarray | None] = [None] * 10
        segs[4] = np.ones((10, 20), dtype=np.float32) * 42.0
        full = assemble_segments(segs)
        assert full.shape == (100, 20)
        assert (full[40:50] == 42.0).all()
        assert np.isnan(full[0:40]).all()
        assert np.isnan(full[50:100]).all()


# ---------------------------------------------------------------------------
# _detect_segment_dimensions
# ---------------------------------------------------------------------------


class TestDetectSegmentDimensions:
    """Tests for the dimension-detection helper extracted from assemble_segments."""

    def test_infers_from_first_non_none(self):
        segs: list[np.ndarray | None] = [None, np.ones((10, 20)), None]
        width, lines = _detect_segment_dimensions(segs, None)
        assert width == 20
        assert lines == 10

    def test_uses_expected_columns_when_all_none(self):
        segs: list[np.ndarray | None] = [None, None]
        width, lines = _detect_segment_dimensions(segs, 100)
        assert width == 100
        assert lines is None

    def test_returns_none_when_no_info(self):
        segs: list[np.ndarray | None] = [None, None]
        width, lines = _detect_segment_dimensions(segs, None)
        assert width is None
        assert lines is None

    def test_raises_on_width_mismatch(self):
        segs: list[np.ndarray | None] = [np.ones((10, 20)), np.ones((10, 30))]
        with pytest.raises(ValueError, match="width mismatch"):
            _detect_segment_dimensions(segs, None)

    def test_expected_columns_validates_against_segments(self):
        segs: list[np.ndarray | None] = [np.ones((10, 20))]
        with pytest.raises(ValueError, match="width mismatch"):
            _detect_segment_dimensions(segs, 30)

    def test_consistent_widths_accepted(self):
        segs = [np.ones((10, 50)), np.ones((15, 50)), np.ones((10, 50))]
        width, lines = _detect_segment_dimensions(segs, None)
        assert width == 50
        assert lines == 10  # first non-None segment's rows


# ---------------------------------------------------------------------------
# _decompress_and_parse_segment
# ---------------------------------------------------------------------------


class TestDecompressAndParseSegment:
    """Tests for the segment decompression helper."""

    def test_empty_bytes_returns_none(self):
        arr, cols = _decompress_and_parse_segment(b"", 0)
        assert arr is None
        assert cols is None

    def test_corrupt_bz2_returns_none(self):
        arr, cols = _decompress_and_parse_segment(b"not_valid_bz2", 0)
        assert arr is None
        assert cols is None

    def test_valid_segment(self, sample_bz2_bytes: bytes):
        arr, cols = _decompress_and_parse_segment(sample_bz2_bytes, 4)
        assert arr is not None
        assert cols == 5500
        assert arr.shape == (550, 5500)


# ---------------------------------------------------------------------------
# Block parser helpers
# ---------------------------------------------------------------------------


class TestBlockParsers:
    """Tests for individual block parsing helpers."""

    def test_parse_block1_from_real_data(self, sample_raw: bytes):
        result = _parse_block1(sample_raw)
        assert result["satellite_name"] == "Himawari-9"
        assert result["observation_area"] == "FLDK"
        assert result["total_header_length"] > 0

    def test_parse_block2_from_real_data(self, sample_raw: bytes):
        b1 = _parse_block1(sample_raw)
        result = _parse_block2(sample_raw, b1["b1_len"])
        assert result["num_columns"] == 5500
        assert result["num_lines"] == 550
        assert result["bits_per_pixel"] == 16

    def test_parse_block3_from_real_data(self, sample_raw: bytes):
        b1 = _parse_block1(sample_raw)
        b2 = _parse_block2(sample_raw, b1["b1_len"])
        result = _parse_block3(sample_raw, b1["b1_len"] + b2["b2_len"])
        assert result["sub_satellite_longitude"] == pytest.approx(140.7, abs=0.1)
        assert result["cfac"] > 0

    def test_parse_block5_ir_band(self, sample_raw: bytes):
        b1 = _parse_block1(sample_raw)
        b2 = _parse_block2(sample_raw, b1["b1_len"])
        b3 = _parse_block3(sample_raw, b1["b1_len"] + b2["b2_len"])
        from app.services.himawari_reader import _read_block_header

        off4 = b1["b1_len"] + b2["b2_len"] + b3["b3_len"]
        _, b4_len = _read_block_header(sample_raw, off4)
        result = _parse_block5_calibration(sample_raw, off4 + b4_len)
        assert result["band_number"] == 13
        assert result["ir_c0"] != 0.0  # IR band has correction coefficients


# ---------------------------------------------------------------------------
# hsd_to_png edge cases
# ---------------------------------------------------------------------------


class TestHsdToPngEdgeCases:
    """Additional edge cases for the full pipeline."""

    def test_all_corrupt_segments_still_produces_image(self, sample_bz2_bytes: bytes, tmp_path: Path):
        """If all but one segment are corrupt, we still get a valid image."""
        segments: list[bytes] = [b"corrupt"] * 4 + [sample_bz2_bytes] + [b"corrupt"] * 5
        out = tmp_path / "test_mostly_corrupt.png"
        result = hsd_to_png(segments, out)
        assert result.exists()

    def test_fewer_than_10_segments_pads(self, sample_bz2_bytes: bytes, tmp_path: Path):
        """Providing fewer than 10 segments should pad with None."""
        segments: list[bytes] = [sample_bz2_bytes]
        out = tmp_path / "test_one_seg.png"
        result = hsd_to_png(segments, out)
        assert result.exists()
        from PIL import Image as PILImage

        img = PILImage.open(result)
        assert img.size == (5500, 5500)  # 10 segments x 550 lines
