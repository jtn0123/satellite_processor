"""Lightweight Himawari Standard Data (HSD) binary format parser.

Parses AHI Level-1b segment files (.DAT / .DAT.bz2) without external
dependencies beyond numpy and Pillow.  Each segment contains 1/10th of a
full-disk scan (latitude strip).

HSD file layout (little-endian throughout):

    Block 1  (282 B)  – satellite name, obs time, band, segment info
    Block 2  ( 50 B)  – columns, lines, bits per pixel
    Block 3  (127 B)  – projection: sub-lon, CFAC/LFAC/COFF/LOFF
    Block 4  (139 B)  – navigation corrections
    Block 5  (var  )  – calibration: count→radiance, radiance→BT/reflectance
    Blocks 6–11       – inter-calibration, segment, spare, etc.
    Data block         – uint16 raw counts, row-major

References:
    JMA Himawari Standard Data User's Guide (v1.3, 2015)
"""

from __future__ import annotations

import bz2
import logging
import struct
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
from PIL import Image as PILImage

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Planck radiation constants (for wavenumber-based Planck function)
# ---------------------------------------------------------------------------
# c1 = 2·h·c² in mW·m⁻²·sr⁻¹·(cm⁻¹)⁻⁴
_C1_PLANCK = 1.19104282e-5
# c2 = h·c/k in cm·K
_C2_PLANCK = 1.43877736

# MJD epoch: 1858-11-17T00:00:00 UTC
_MJD_EPOCH = datetime(1858, 11, 17, tzinfo=UTC)

# VIS bands (B01–B04) where we compute reflectance; all others are IR → BT
_VIS_BANDS = frozenset(range(1, 5))  # bands 1, 2, 3, 4


# ---------------------------------------------------------------------------
# Header dataclass
# ---------------------------------------------------------------------------


@dataclass
class HSDHeader:
    """Parsed header fields from an HSD segment file."""

    # Block 1 – basic info
    satellite_name: str
    observation_area: str
    observation_start: datetime
    observation_end: datetime
    band_number: int
    total_segments: int  # should be 10 for full-disk
    segment_number: int  # 1-based (from segment/filename, not stored in block 1)
    total_header_length: int
    data_length: int

    # Block 2 – data dimensions
    num_columns: int
    num_lines: int
    bits_per_pixel: int

    # Block 3 – projection
    sub_satellite_longitude: float
    cfac: int
    lfac: int
    coff: float
    loff: float
    earth_equatorial_radius: float
    earth_polar_radius: float
    satellite_distance: float  # earth-center to satellite (km)

    # Block 5 – calibration
    central_wavelength: float  # µm
    gain: float  # count → radiance slope
    offset: float  # count → radiance intercept
    count_error: int  # count value representing error pixels
    count_outside: int  # count value representing outside-scan pixels

    # IR correction coefficients (for brightness temperature)
    # BT_corrected = c0 + c1·BT + c2·BT²
    ir_c0: float = 0.0
    ir_c1: float = 1.0
    ir_c2: float = 0.0

    # VIS calibration coefficient (for reflectance from radiance)
    vis_coeff: float = 0.0  # if non-zero, refl = vis_coeff * radiance

    @property
    def is_vis(self) -> bool:
        """True for visible bands (B01–B04)."""
        return self.band_number in _VIS_BANDS

    @property
    def central_wavenumber(self) -> float:
        """Central wavenumber in cm⁻¹."""
        return 10000.0 / self.central_wavelength


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------


def _mjd_to_datetime(mjd: float) -> datetime:
    """Convert Modified Julian Date to UTC datetime."""
    return _MJD_EPOCH + timedelta(days=mjd)


def _read_block_header(data: bytes, offset: int) -> tuple[int, int]:
    """Read block number and block length at *offset*. Returns (block_num, block_len)."""
    if offset + 3 > len(data):
        raise ValueError(f"Truncated data at offset {offset}: need 3 bytes for block header")
    block_num = data[offset]
    block_len = struct.unpack_from("<H", data, offset + 1)[0]
    return block_num, block_len


def _extract_segment_number(data: bytes) -> int:
    """Try to extract the segment number from the filename embedded in Block 1.

    The filename field (offsets 104–135) looks like:
        HS_H09_20260303_0000_B13_FLDK_R20_S0510.DAT
    The segment is encoded as S{ss}{total} (e.g. S0510 → segment 5 of 10).
    Returns 0 if extraction fails.
    """
    try:
        fname = data[104:136].rstrip(b"\x00").decode("ascii", errors="replace")
        idx = fname.index("_S")
        seg_str = fname[idx + 2 : idx + 4]
        return int(seg_str)
    except (ValueError, IndexError):
        return 0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def _parse_block1(data: bytes) -> dict:
    """Parse Block 1 (282 bytes) — satellite name, obs time, area."""
    b1_num, b1_len = _read_block_header(data, 0)
    if b1_num != 1:
        raise ValueError(f"Expected block 1, got block {b1_num}")

    return {
        "b1_len": b1_len,
        "total_header_blocks": struct.unpack_from("<H", data, 3)[0],
        "satellite_name": data[6:22].rstrip(b"\x00").decode("ascii", errors="replace"),
        "observation_area": data[38:42].rstrip(b"\x00").decode("ascii", errors="replace"),
        "observation_start": _mjd_to_datetime(struct.unpack_from("<d", data, 46)[0]),
        "observation_end": _mjd_to_datetime(struct.unpack_from("<d", data, 54)[0]),
        "total_header_length": struct.unpack_from("<I", data, 70)[0],
        "data_length": struct.unpack_from("<I", data, 74)[0],
        "segment_number": _extract_segment_number(data),
    }


def _parse_block2(data: bytes, offset: int) -> dict:
    """Parse Block 2 (50 bytes) — data dimensions."""
    if len(data) < offset + 50:
        raise ValueError(f"Data too short for Block 2 at offset {offset}")
    b2_num, b2_len = _read_block_header(data, offset)
    if b2_num != 2:
        raise ValueError(f"Expected block 2 at offset {offset}, got block {b2_num}")

    return {
        "b2_len": b2_len,
        "bits_per_pixel": struct.unpack_from("<H", data, offset + 3)[0],
        "num_columns": struct.unpack_from("<H", data, offset + 5)[0],
        "num_lines": struct.unpack_from("<H", data, offset + 7)[0],
    }


def _parse_block3(data: bytes, offset: int) -> dict:
    """Parse Block 3 (127 bytes) — projection parameters."""
    if len(data) < offset + 127:
        raise ValueError(f"Data too short for Block 3 at offset {offset}")
    b3_num, b3_len = _read_block_header(data, offset)
    if b3_num != 3:
        raise ValueError(f"Expected block 3 at offset {offset}, got block {b3_num}")

    return {
        "b3_len": b3_len,
        "sub_satellite_longitude": struct.unpack_from("<d", data, offset + 3)[0],
        "cfac": struct.unpack_from("<I", data, offset + 11)[0],
        "lfac": struct.unpack_from("<I", data, offset + 15)[0],
        "coff": struct.unpack_from("<f", data, offset + 19)[0],
        "loff": struct.unpack_from("<f", data, offset + 23)[0],
        "satellite_distance": struct.unpack_from("<d", data, offset + 27)[0],
        "earth_equatorial_radius": struct.unpack_from("<d", data, offset + 35)[0],
        "earth_polar_radius": struct.unpack_from("<d", data, offset + 43)[0],
    }


def _parse_block5_calibration(data: bytes, offset: int) -> dict:
    """Parse Block 5 (calibration) — band, wavelength, gain/offset, correction coefficients."""
    if len(data) < offset + 35:
        raise ValueError(f"Data too short for Block 5 at offset {offset}")
    b5_num, b5_len = _read_block_header(data, offset)
    if b5_num != 5:
        raise ValueError(f"Expected block 5 at offset {offset}, got block {b5_num}")

    band_number = struct.unpack_from("<H", data, offset + 3)[0]
    result = {
        "b5_len": b5_len,
        "band_number": band_number,
        "central_wavelength": struct.unpack_from("<d", data, offset + 5)[0],
        "count_error": struct.unpack_from("<H", data, offset + 15)[0],
        "count_outside": struct.unpack_from("<H", data, offset + 17)[0],
        "gain": struct.unpack_from("<d", data, offset + 19)[0],
        "offset": struct.unpack_from("<d", data, offset + 27)[0],
        "ir_c0": 0.0,
        "ir_c1": 0.0,
        "ir_c2": 0.0,
        "vis_coeff": 0.0,
    }

    if band_number in _VIS_BANDS:
        if len(data) >= offset + 43:
            result["vis_coeff"] = struct.unpack_from("<d", data, offset + 35)[0]
        result["ir_c1"] = 1.0  # identity
    elif len(data) >= offset + 59:
        result["ir_c0"] = struct.unpack_from("<d", data, offset + 35)[0]
        result["ir_c1"] = struct.unpack_from("<d", data, offset + 43)[0]
        result["ir_c2"] = struct.unpack_from("<d", data, offset + 51)[0]

    return result


def _find_segment_info(data: bytes, offset: int, num_remaining_blocks: int, segment_number: int) -> tuple[int, int]:
    """Walk remaining header blocks to find segment info (block 7).

    Returns (total_segments, segment_number).
    """
    total_segments = 10  # default
    off = offset
    for _ in range(num_remaining_blocks):
        if off + 3 > len(data):
            break
        bn, bl = _read_block_header(data, off)
        if bn == 7 and bl >= 7:
            total_segments = data[off + 3]
            if segment_number == 0:
                segment_number = data[off + 4]
        off += bl
    return total_segments, segment_number


def parse_hsd_header(data: bytes) -> HSDHeader:
    """Parse the header blocks of an HSD segment file.

    Parameters
    ----------
    data : bytes
        The full decompressed HSD file contents (or at least the header portion).

    Returns
    -------
    HSDHeader
        Populated dataclass with all relevant header fields.

    Raises
    ------
    ValueError
        If the data is too short or block structure is invalid.
    """
    if len(data) < 282:
        raise ValueError(f"Data too short for Block 1: {len(data)} bytes (need ≥282)")

    b1 = _parse_block1(data)
    b2 = _parse_block2(data, b1["b1_len"])
    b3 = _parse_block3(data, b1["b1_len"] + b2["b2_len"])

    # Skip Block 4 (navigation)
    off4 = b1["b1_len"] + b2["b2_len"] + b3["b3_len"]
    _b4_num, b4_len = _read_block_header(data, off4)

    b5 = _parse_block5_calibration(data, off4 + b4_len)

    off_after_b5 = off4 + b4_len + b5["b5_len"]
    total_segments, segment_number = _find_segment_info(
        data,
        off_after_b5,
        b1["total_header_blocks"] - 5,
        b1["segment_number"],
    )

    return HSDHeader(
        satellite_name=b1["satellite_name"],
        observation_area=b1["observation_area"],
        observation_start=b1["observation_start"],
        observation_end=b1["observation_end"],
        band_number=b5["band_number"],
        total_segments=total_segments,
        segment_number=segment_number,
        total_header_length=b1["total_header_length"],
        data_length=b1["data_length"],
        num_columns=b2["num_columns"],
        num_lines=b2["num_lines"],
        bits_per_pixel=b2["bits_per_pixel"],
        sub_satellite_longitude=b3["sub_satellite_longitude"],
        cfac=b3["cfac"],
        lfac=b3["lfac"],
        coff=b3["coff"],
        loff=b3["loff"],
        earth_equatorial_radius=b3["earth_equatorial_radius"],
        earth_polar_radius=b3["earth_polar_radius"],
        satellite_distance=b3["satellite_distance"],
        central_wavelength=b5["central_wavelength"],
        gain=b5["gain"],
        offset=b5["offset"],
        count_error=b5["count_error"],
        count_outside=b5["count_outside"],
        ir_c0=b5["ir_c0"],
        ir_c1=b5["ir_c1"],
        ir_c2=b5["ir_c2"],
        vis_coeff=b5["vis_coeff"],
    )


def parse_hsd_data(data: bytes, header: HSDHeader) -> np.ndarray:
    """Read the data block and apply calibration.

    For **IR bands** (B05–B16): count → radiance → brightness temperature (K).
    For **VIS bands** (B01–B04): count → radiance (W·m⁻²·sr⁻¹·µm⁻¹).

    Returns a float32 2-D array of shape (num_lines, num_columns).
    Invalid pixels (error / outside-scan) are set to NaN.
    """
    expected_pixels = header.num_columns * header.num_lines
    data_start = header.total_header_length
    data_end = data_start + expected_pixels * 2  # uint16
    if len(data) < data_end:
        raise ValueError(f"Data too short: need {data_end} bytes, got {len(data)}")

    counts = np.frombuffer(data[data_start:data_end], dtype="<u2").reshape(header.num_lines, header.num_columns)

    # Build valid-pixel mask
    invalid = (counts == header.count_error) | (counts == header.count_outside)
    result = header.gain * counts.astype(np.float32) + header.offset
    result[invalid] = np.nan

    if not header.is_vis:
        # IR: convert radiance [W/(m²·sr·µm)] → brightness temperature [K]
        result = _radiance_to_bt(result, header)

    return result


def _radiance_to_bt(radiance: np.ndarray, header: HSDHeader) -> np.ndarray:
    """Convert spectral radiance to brightness temperature for IR bands.

    Pipeline:
      1. Convert L_λ [W/(m²·sr·µm)] to L_ν [mW/(m²·sr·cm⁻¹)]
      2. Inverse Planck: T_eff = c2·ν / ln(c1·ν³/L_ν + 1)
      3. Correction: T = c0 + c1_corr·T_eff + c2_corr·T_eff²
    """
    lam = header.central_wavelength  # µm
    nu = header.central_wavenumber  # cm⁻¹

    # Step 1 – unit conversion (W/(m²·sr·µm) → mW/(m²·sr·cm⁻¹))
    l_nu = radiance * (lam**2 / 10.0)

    # Guard against non-positive radiance (space, limb)
    with np.errstate(invalid="ignore", divide="ignore"):
        # Step 2 – inverse Planck
        arg = _C1_PLANCK * nu**3 / l_nu + 1.0
        # Clamp to avoid log of non-positive
        arg = np.where(arg > 1.0, arg, np.nan)
        t_eff = _C2_PLANCK * nu / np.log(arg)

        # Step 3 – band-specific correction
        bt = header.ir_c0 + header.ir_c1 * t_eff + header.ir_c2 * t_eff**2

    # Anything that went through NaN stays NaN
    bt = np.where(np.isfinite(bt) & (bt > 0), bt, np.nan)
    return bt.astype(np.float32)


def assemble_segments(
    segments: list[np.ndarray | None],
    expected_columns: int | None = None,
) -> np.ndarray:
    """Vertically stack segment arrays (S01=north … S10=south).

    Parameters
    ----------
    segments : list[np.ndarray | None]
        Exactly 10 entries.  ``None`` entries are treated as missing and
        filled with NaN rows (width inferred from non-None siblings).
    expected_columns : int, optional
        If provided, used as the fallback width when all segments are None.

    Returns
    -------
    np.ndarray
        Full-disk float32 array of shape (total_lines, columns).

    Raises
    ------
    ValueError
        If no width can be determined (all segments None and no
        ``expected_columns``), or segment widths are inconsistent.
    """
    if len(segments) != 10:
        raise ValueError(f"Expected 10 segments, got {len(segments)}")

    # Determine width from first non-None segment
    width: int | None = expected_columns
    lines_per_seg: int | None = None
    for seg in segments:
        if seg is not None:
            if width is None:
                width = seg.shape[1]
            elif seg.shape[1] != width:
                raise ValueError(f"Segment width mismatch: expected {width}, got {seg.shape[1]}")
            if lines_per_seg is None:
                lines_per_seg = seg.shape[0]

    if width is None:
        raise ValueError("Cannot determine image width: all segments are None and no expected_columns given")
    if lines_per_seg is None:
        lines_per_seg = 550  # IR default

    strips: list[np.ndarray] = []
    for seg in segments:
        if seg is None:
            strips.append(np.full((lines_per_seg, width), np.nan, dtype=np.float32))
        else:
            strips.append(seg.astype(np.float32))

    return np.vstack(strips)


def _decompress_and_parse_segment(seg_bytes: bytes, index: int) -> tuple[np.ndarray | None, int | None]:
    """Decompress and parse a single HSD segment.

    Returns (parsed_array, num_columns) or (None, None) on failure.
    """
    if not seg_bytes:
        return None, None
    try:
        decompressed = bz2.decompress(seg_bytes)
    except (OSError, ValueError) as exc:
        logger.warning("Segment %d bz2 decompression failed: %s", index + 1, exc)
        return None, None

    header = parse_hsd_header(decompressed)
    arr = parse_hsd_data(decompressed, header)
    return arr, header.num_columns


def hsd_to_png(
    segments: list[bytes],
    output_path: Path,
    *,
    percentile_low: float = 2.0,
    percentile_high: float = 98.0,
) -> Path:
    """Full pipeline: bz2-compressed HSD segments → single PNG image.

    Parameters
    ----------
    segments : list[bytes]
        Up to 10 bz2-compressed HSD segment files (raw file bytes).
        Must be ordered S01 (north) → S10 (south).  Pass ``b""`` for
        missing segments.
    output_path : Path
        Where to write the PNG.
    percentile_low, percentile_high : float
        Percentile stretch for 8-bit normalisation (same approach as
        ``_normalize_cmi_to_image`` in ``goes_fetcher.py``).

    Returns
    -------
    Path
        The *output_path* that was written.
    """
    if not segments:
        raise ValueError("No segments provided")

    parsed: list[np.ndarray | None] = []
    expected_cols: int | None = None

    for i, seg_bytes in enumerate(segments):
        arr, cols = _decompress_and_parse_segment(seg_bytes, i)
        parsed.append(arr)
        if cols is not None and expected_cols is None:
            expected_cols = cols

    # Pad to 10 segments if fewer supplied
    while len(parsed) < 10:
        parsed.append(None)

    full_disk = assemble_segments(parsed, expected_columns=expected_cols)
    img = _normalize_to_image(full_disk, percentile_low, percentile_high)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(output_path))
    return output_path


def _normalize_to_image(
    data: np.ndarray,
    pct_low: float = 2.0,
    pct_high: float = 98.0,
) -> PILImage.Image:
    """Normalise a float32 array to an 8-bit grayscale PIL Image.

    Uses the same 2nd–98th percentile stretch as
    ``goes_fetcher._normalize_cmi_to_image``.
    """
    valid = data[np.isfinite(data)]
    if len(valid) == 0:
        h = data.shape[0] if data.ndim >= 1 else 100
        w = data.shape[1] if data.ndim >= 2 else 100
        return PILImage.new("L", (w, h), 0)

    vmin, vmax = np.nanpercentile(valid, [pct_low, pct_high])
    if vmax - vmin < 1e-6:
        vmax = vmin + 1.0

    stretched = np.clip(data, vmin, vmax)
    stretched = (stretched - vmin) * (255.0 / (vmax - vmin))
    np.nan_to_num(stretched, nan=0.0, copy=False)
    return PILImage.fromarray(stretched.astype(np.uint8))
