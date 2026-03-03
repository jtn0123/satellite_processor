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
    gain: float   # count → radiance slope
    offset: float  # count → radiance intercept
    count_error: int       # count value representing error pixels
    count_outside: int     # count value representing outside-scan pixels

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

    # ── Block 1 (282 bytes) ──────────────────────────────────────────────
    b1_num, b1_len = _read_block_header(data, 0)
    if b1_num != 1:
        raise ValueError(f"Expected block 1, got block {b1_num}")

    total_header_blocks = struct.unpack_from("<H", data, 3)[0]
    satellite_name = data[6:22].rstrip(b"\x00").decode("ascii", errors="replace")
    observation_area = data[38:42].rstrip(b"\x00").decode("ascii", errors="replace")
    obs_start_mjd = struct.unpack_from("<d", data, 46)[0]
    obs_end_mjd = struct.unpack_from("<d", data, 54)[0]
    total_header_length = struct.unpack_from("<I", data, 70)[0]
    data_length = struct.unpack_from("<I", data, 74)[0]

    observation_start = _mjd_to_datetime(obs_start_mjd)
    observation_end = _mjd_to_datetime(obs_end_mjd)

    segment_number = _extract_segment_number(data)

    # ── Block 2 (50 bytes) ───────────────────────────────────────────────
    off2 = b1_len
    if len(data) < off2 + 50:
        raise ValueError(f"Data too short for Block 2 at offset {off2}")
    b2_num, b2_len = _read_block_header(data, off2)
    if b2_num != 2:
        raise ValueError(f"Expected block 2 at offset {off2}, got block {b2_num}")

    bits_per_pixel = struct.unpack_from("<H", data, off2 + 3)[0]
    num_columns = struct.unpack_from("<H", data, off2 + 5)[0]
    num_lines = struct.unpack_from("<H", data, off2 + 7)[0]

    # ── Block 3 (127 bytes) ──────────────────────────────────────────────
    off3 = off2 + b2_len
    if len(data) < off3 + 127:
        raise ValueError(f"Data too short for Block 3 at offset {off3}")
    b3_num, b3_len = _read_block_header(data, off3)
    if b3_num != 3:
        raise ValueError(f"Expected block 3 at offset {off3}, got block {b3_num}")

    sub_lon = struct.unpack_from("<d", data, off3 + 3)[0]
    cfac = struct.unpack_from("<I", data, off3 + 11)[0]
    lfac = struct.unpack_from("<I", data, off3 + 15)[0]
    coff = struct.unpack_from("<f", data, off3 + 19)[0]
    loff = struct.unpack_from("<f", data, off3 + 23)[0]
    satellite_distance = struct.unpack_from("<d", data, off3 + 27)[0]
    earth_eq_radius = struct.unpack_from("<d", data, off3 + 35)[0]
    earth_pol_radius = struct.unpack_from("<d", data, off3 + 43)[0]

    # ── Skip Block 4 (navigation) ────────────────────────────────────────
    off4 = off3 + b3_len
    _b4_num, b4_len = _read_block_header(data, off4)

    # ── Block 5 (calibration) ────────────────────────────────────────────
    off5 = off4 + b4_len
    if len(data) < off5 + 35:
        raise ValueError(f"Data too short for Block 5 at offset {off5}")
    b5_num, b5_len = _read_block_header(data, off5)
    if b5_num != 5:
        raise ValueError(f"Expected block 5 at offset {off5}, got block {b5_num}")

    band_number = struct.unpack_from("<H", data, off5 + 3)[0]
    central_wavelength = struct.unpack_from("<d", data, off5 + 5)[0]
    count_error = struct.unpack_from("<H", data, off5 + 15)[0]
    count_outside = struct.unpack_from("<H", data, off5 + 17)[0]
    gain = struct.unpack_from("<d", data, off5 + 19)[0]
    cal_offset = struct.unpack_from("<d", data, off5 + 27)[0]

    # IR correction coefficients (for bands ≥ 7)
    ir_c0 = ir_c1 = ir_c2 = 0.0
    vis_coeff = 0.0
    if band_number in _VIS_BANDS:
        # VIS bands: Block 5 stores a coefficient for count→reflectance
        # At offset +35 there's a speed-of-light factor for VIS conversion
        # The VIS pipeline: radiance * (π * d²) / (E_sun * cos_zenith)
        # For simplicity we use the radiance directly and skip reflectance
        # (normalisation to 8-bit handles display just fine).
        # If the file contains a VIS coefficient, capture it.
        if len(data) >= off5 + 43:
            vis_coeff = struct.unpack_from("<d", data, off5 + 35)[0]
        ir_c1 = 1.0  # identity
    else:
        # IR bands: c0, c1, c2 correction at offsets +35, +43, +51
        if len(data) >= off5 + 59:
            ir_c0 = struct.unpack_from("<d", data, off5 + 35)[0]
            ir_c1 = struct.unpack_from("<d", data, off5 + 43)[0]
            ir_c2 = struct.unpack_from("<d", data, off5 + 51)[0]

    # Walk remaining blocks to get total_segments from block 7 (segment info)
    total_segments = 10  # default
    off = off5 + b5_len
    for _ in range(total_header_blocks - 5):
        if off + 3 > len(data):
            break
        bn, bl = _read_block_header(data, off)
        if bn == 7 and bl >= 7:
            # Block 7 segment info: +3 = total_segments (uint8), +4 = segment_seq (uint8)
            total_segments = data[off + 3]
            if segment_number == 0:
                segment_number = data[off + 4]
        off += bl

    return HSDHeader(
        satellite_name=satellite_name,
        observation_area=observation_area,
        observation_start=observation_start,
        observation_end=observation_end,
        band_number=band_number,
        total_segments=total_segments,
        segment_number=segment_number,
        total_header_length=total_header_length,
        data_length=data_length,
        num_columns=num_columns,
        num_lines=num_lines,
        bits_per_pixel=bits_per_pixel,
        sub_satellite_longitude=sub_lon,
        cfac=cfac,
        lfac=lfac,
        coff=coff,
        loff=loff,
        earth_equatorial_radius=earth_eq_radius,
        earth_polar_radius=earth_pol_radius,
        satellite_distance=satellite_distance,
        central_wavelength=central_wavelength,
        gain=gain,
        offset=cal_offset,
        count_error=count_error,
        count_outside=count_outside,
        ir_c0=ir_c0,
        ir_c1=ir_c1,
        ir_c2=ir_c2,
        vis_coeff=vis_coeff,
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
        raise ValueError(
            f"Data too short: need {data_end} bytes, got {len(data)}"
        )

    counts = np.frombuffer(
        data[data_start:data_end], dtype="<u2"
    ).reshape(header.num_lines, header.num_columns)

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
    nu = header.central_wavenumber   # cm⁻¹

    # Step 1 – unit conversion (W/(m²·sr·µm) → mW/(m²·sr·cm⁻¹))
    l_nu = radiance * (lam ** 2 / 10.0)

    # Guard against non-positive radiance (space, limb)
    with np.errstate(invalid="ignore", divide="ignore"):
        # Step 2 – inverse Planck
        arg = _C1_PLANCK * nu ** 3 / l_nu + 1.0
        # Clamp to avoid log of non-positive
        arg = np.where(arg > 1.0, arg, np.nan)
        t_eff = _C2_PLANCK * nu / np.log(arg)

        # Step 3 – band-specific correction
        bt = header.ir_c0 + header.ir_c1 * t_eff + header.ir_c2 * t_eff ** 2

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
                raise ValueError(
                    f"Segment width mismatch: expected {width}, got {seg.shape[1]}"
                )
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
        if not seg_bytes:
            parsed.append(None)
            continue
        try:
            decompressed = bz2.decompress(seg_bytes)
        except (OSError, ValueError) as exc:
            logger.warning("Segment %d bz2 decompression failed: %s", i + 1, exc)
            parsed.append(None)
            continue

        header = parse_hsd_header(decompressed)
        arr = parse_hsd_data(decompressed, header)
        parsed.append(arr)
        if expected_cols is None:
            expected_cols = header.num_columns

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
