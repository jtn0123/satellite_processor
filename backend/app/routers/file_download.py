"""Generic file download endpoint for serving data files (images, thumbnails, etc.)."""

import logging
from pathlib import Path

from fastapi import APIRouter, Query, Request
from fastapi.responses import FileResponse

from ..config import settings
from ..errors import APIError, validate_safe_path
from ..rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["files"])


@router.get("/download")
@limiter.limit("120/minute")
async def download_file(
    request: Request,
    path: str = Query(..., description="Absolute path to the file inside the data directory"),
) -> FileResponse:
    """Serve a file from the data directory.

    The path must resolve to a location within the configured storage path.
    Path traversal attempts are rejected.
    """
    logger.info("File download requested: path=%s", path)
    if not path:
        raise APIError(400, "bad_request", "path parameter is required")

    # Validate path stays within storage root
    storage_root = settings.storage_path
    # If path is not absolute, resolve it relative to storage root
    if not path.startswith("/"):
        path = str(Path(storage_root) / path)
    resolved = validate_safe_path(path, storage_root)

    if not resolved.exists():
        raise APIError(404, "not_found", "File not found")

    if not resolved.is_file():
        raise APIError(400, "bad_request", "Path is not a file")

    # Determine media type from extension
    suffix = resolved.suffix.lower()
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".mp4": "video/mp4",
        ".json": "application/json",
        ".csv": "text/csv",
    }
    media_type = media_types.get(suffix, "application/octet-stream")

    return FileResponse(
        path=str(resolved),
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
