"""Tests for download router (#185)."""
from __future__ import annotations

import pytest
from app.main import app
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_download_job_not_found():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/api/jobs/nonexistent/download")
        assert r.status_code in (401, 404)


@pytest.mark.asyncio
async def test_bulk_download_no_ids():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.post("/api/jobs/bulk-download", json={"ids": []})
        # Pydantic validation: min_length=1
        assert r.status_code == 422


@pytest.mark.asyncio
async def test_bulk_download_no_completed_jobs():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.post("/api/jobs/bulk-download", json={"ids": ["fake-id"]})
        assert r.status_code in (401, 404, 422)
