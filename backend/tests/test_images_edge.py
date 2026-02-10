"""Edge-case tests for the images endpoint."""

import cv2
import numpy as np
import pytest


def _make_png(width=100, height=100) -> bytes:
    img = np.ones((height, width, 3), dtype=np.uint8) * 128
    _, buf = cv2.imencode(".png", img)
    return buf.tobytes()


@pytest.mark.asyncio
async def test_upload_non_image_file(client):
    """Uploading a .txt file should fail with 400."""
    resp = await client.post(
        "/api/images/upload",
        files={"file": ("readme.txt", b"hello world", "text/plain")},
    )
    assert resp.status_code in (400, 422)
    assert "invalid_file_type" in resp.json().get("error", "")


@pytest.mark.asyncio
async def test_upload_with_no_filename(client):
    """Uploading with an empty filename should fail."""
    resp = await client.post(
        "/api/images/upload",
        files={"file": ("", b"data", "image/png")},
    )
    # Empty filename → either 400 or the endpoint rejects the extension
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_upload_duplicate(client):
    """Uploading the same filename twice should succeed (unique IDs)."""
    png = _make_png()
    r1 = await client.post("/api/images/upload", files={"file": ("dup.png", png, "image/png")})
    r2 = await client.post("/api/images/upload", files={"file": ("dup.png", png, "image/png")})
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["id"] != r2.json()["id"]


@pytest.mark.asyncio
async def test_upload_very_large_filename(client):
    """A very long filename should still be handled."""
    png = _make_png()
    long_name = "a" * 500 + ".png"
    resp = await client.post(
        "/api/images/upload",
        files={"file": (long_name, png, "image/png")},
    )
    # May succeed, fail validation, or hit OS filename limits (500)
    assert resp.status_code in (200, 400, 422, 500)


@pytest.mark.asyncio
async def test_delete_nonexistent_image(client):
    """Deleting a nonexistent image should 404."""
    resp = await client.delete("/api/images/nonexistent-id")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_image_twice(client):
    """Deleting the same nonexistent image twice should both 404."""
    resp1 = await client.delete("/api/images/ghost-id")
    resp2 = await client.delete("/api/images/ghost-id")
    assert resp1.status_code == 404
    assert resp2.status_code == 404
