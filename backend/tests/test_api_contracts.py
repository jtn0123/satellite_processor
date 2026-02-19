"""Integration tests: verify all documented endpoints return expected status codes."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# Endpoints that should return 200 on GET with no special setup
GET_200_ENDPOINTS = [
    "/api/health",
    "/api/health/detailed",
    "/api/settings",
    "/api/goes/products",
    "/api/stats",
    "/api/system/info",
    "/api/notifications",
]


@pytest.mark.anyio
@pytest.mark.parametrize("path", GET_200_ENDPOINTS)
async def test_get_endpoints_return_200(client: AsyncClient, path: str):
    resp = await client.get(path)
    assert resp.status_code == 200, f"{path} returned {resp.status_code}: {resp.text}"


@pytest.mark.anyio
async def test_settings_write_roundtrip(client: AsyncClient):
    """Bug #1 regression: PUT /api/settings must not 500."""
    # Write
    resp = await client.put(
        "/api/settings",
        json={"video_fps": 30},
    )
    assert resp.status_code == 200, f"PUT /api/settings returned {resp.status_code}: {resp.text}"

    # Read back
    resp = await client.get("/api/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("video_fps") == 30


@pytest.mark.anyio
async def test_jobs_accepts_goes_fetch_type(client: AsyncClient):
    """Bug #7 regression: goes_fetch should be an accepted job type."""
    resp = await client.post(
        "/api/jobs",
        json={"name": "test-fetch", "job_type": "goes_fetch", "params": {}},
    )
    # Should not be 422 (validation error)
    assert resp.status_code != 422, f"goes_fetch job type rejected: {resp.text}"


@pytest.mark.anyio
async def test_frames_alias_redirects(client: AsyncClient):
    """Bug #6 regression: /api/frames should redirect to /api/goes/frames."""
    resp = await client.get("/api/frames", follow_redirects=False)
    assert resp.status_code == 307
    assert "/api/goes/frames" in resp.headers.get("location", "")


@pytest.mark.anyio
async def test_openapi_spec_available(client: AsyncClient):
    """Ensure the OpenAPI spec is served."""
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    spec = resp.json()
    assert "paths" in spec
