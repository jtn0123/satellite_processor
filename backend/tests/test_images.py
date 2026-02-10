"""Image endpoint tests."""


import cv2
import numpy as np
import pytest


def _make_png(width=100, height=100) -> bytes:
    img = np.ones((height, width, 3), dtype=np.uint8) * 128
    _, buf = cv2.imencode(".png", img)
    return buf.tobytes()


@pytest.mark.asyncio
async def test_upload_image(client):
    png = _make_png()
    resp = await client.post(
        "/api/images/upload",
        files={"file": ("test.png", png, "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert data["filename"] == "test.png"


@pytest.mark.asyncio
async def test_list_images_empty(client):
    resp = await client.get("/api/images")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1


@pytest.mark.asyncio
async def test_list_images_after_upload(client):
    png = _make_png()
    await client.post(
        "/api/images/upload",
        files={"file": ("test.png", png, "image/png")},
    )
    resp = await client.get("/api/images")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["total"] == 1


@pytest.mark.asyncio
async def test_delete_image(client):
    png = _make_png()
    upload = await client.post(
        "/api/images/upload",
        files={"file": ("test.png", png, "image/png")},
    )
    image_id = upload.json()["id"]
    resp = await client.delete(f"/api/images/{image_id}")
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True


@pytest.mark.asyncio
async def test_delete_nonexistent_image(client):
    resp = await client.delete("/api/images/nonexistent-id")
    assert resp.status_code == 404
