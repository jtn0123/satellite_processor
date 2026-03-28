"""Tests for file download endpoint."""

from __future__ import annotations

from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


@pytest_asyncio.fixture
async def client_with_storage(tmp_path):
    """Client with storage_path pointed at tmp_path."""
    from app.main import app

    storage = tmp_path / "data"
    storage.mkdir()

    with patch("app.routers.file_download.settings") as mock_settings:
        mock_settings.storage_path = str(storage)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac, storage


class TestDownloadFile:
    @pytest.mark.asyncio
    async def test_download_existing_file(self, client_with_storage):
        client, storage = client_with_storage
        test_file = storage / "test.png"
        test_file.write_bytes(b"\x89PNG\r\n\x1a\nfakedata")

        resp = await client.get("/api/download", params={"path": str(test_file)})
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/png"
        assert b"fakedata" in resp.content

    @pytest.mark.asyncio
    async def test_download_relative_path(self, client_with_storage):
        client, storage = client_with_storage
        test_file = storage / "image.jpg"
        test_file.write_bytes(b"\xff\xd8\xff\xe0fakedata")

        resp = await client.get("/api/download", params={"path": "image.jpg"})
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/jpeg"

    @pytest.mark.asyncio
    async def test_404_missing_file(self, client_with_storage):
        client, storage = client_with_storage
        resp = await client.get("/api/download", params={"path": str(storage / "nonexistent.png")})
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_path_traversal_blocked(self, client_with_storage):
        client, storage = client_with_storage
        resp = await client.get("/api/download", params={"path": str(storage / ".." / ".." / "etc" / "passwd")})
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_empty_path_rejected(self, client_with_storage):
        client, _ = client_with_storage
        resp = await client.get("/api/download", params={"path": ""})
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_directory_rejected(self, client_with_storage):
        client, storage = client_with_storage
        subdir = storage / "subdir"
        subdir.mkdir()

        resp = await client.get("/api/download", params={"path": str(subdir)})
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_correct_media_types(self, client_with_storage):
        client, storage = client_with_storage

        cases = {
            "video.mp4": "video/mp4",
            "data.json": "application/json",
            "data.csv": "text/csv; charset=utf-8",
            "image.webp": "image/webp",
            "image.gif": "image/gif",
        }
        for filename, expected_type in cases.items():
            f = storage / filename
            f.write_bytes(b"testdata")
            resp = await client.get("/api/download", params={"path": str(f)})
            assert resp.status_code == 200
            assert resp.headers["content-type"] == expected_type, f"Wrong type for {filename}"

    @pytest.mark.asyncio
    async def test_unknown_extension_returns_octet_stream(self, client_with_storage):
        client, storage = client_with_storage
        f = storage / "file.xyz"
        f.write_bytes(b"data")
        resp = await client.get("/api/download", params={"path": str(f)})
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/octet-stream"

    @pytest.mark.asyncio
    async def test_cache_control_header(self, client_with_storage):
        client, storage = client_with_storage
        f = storage / "cached.png"
        f.write_bytes(b"\x89PNGdata")
        resp = await client.get("/api/download", params={"path": str(f)})
        assert "max-age=86400" in resp.headers.get("cache-control", "")
