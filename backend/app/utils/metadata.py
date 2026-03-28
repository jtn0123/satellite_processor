"""Shared satellite metadata parsing from filenames (DRY utility)."""

import re
from datetime import datetime


def parse_satellite_metadata(filename: str) -> dict:
    """Extract satellite name and captured_at timestamp from a filename.

    Returns dict with 'satellite' (str | None) and 'captured_at' (datetime | None).
    """
    satellite = None
    captured_at = None

    match = re.search(r"(\d{8}T\d{6}Z)", filename)
    if match:
        captured_at = datetime.strptime(match.group(1), "%Y%m%dT%H%M%SZ")

    sat_match = re.search(r"(GOES-\d+)", filename, re.IGNORECASE)
    if sat_match:
        satellite = sat_match.group(1).upper()

    return {"satellite": satellite, "captured_at": captured_at}
