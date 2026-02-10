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

    upper = filename.upper()
    if "GOES-16" in upper:
        satellite = "GOES-16"
    elif "GOES-18" in upper:
        satellite = "GOES-18"

    return {"satellite": satellite, "captured_at": captured_at}
