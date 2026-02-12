"""Thumbnail generation for GOES frames."""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

THUMB_SIZE = (256, 256)


def generate_thumbnail(source_path: str, output_dir: str | None = None) -> str | None:
    """Generate a thumbnail for an image file. Returns thumbnail path or None."""
    try:
        from PIL import Image
    except ImportError:
        logger.debug("Pillow not available, skipping thumbnail generation")
        return None

    src = Path(source_path)
    if not src.exists():
        return None

    if output_dir:
        thumb_dir = Path(output_dir) / "thumbnails"
    else:
        thumb_dir = src.parent / "thumbnails"
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_path = thumb_dir / f"thumb_{src.stem}.jpg"

    try:
        with Image.open(src) as img:
            img.thumbnail(THUMB_SIZE)
            img = img.convert("RGB")
            img.save(str(thumb_path), "JPEG", quality=80)
        return str(thumb_path)
    except Exception:
        logger.exception("Failed to generate thumbnail for %s", source_path)
        return None


def get_image_dimensions(path: str) -> tuple[int | None, int | None]:
    """Get image width and height."""
    try:
        from PIL import Image

        with Image.open(path) as img:
            return img.size
    except Exception:
        return None, None
