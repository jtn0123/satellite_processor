"""Test backward compatibility: /api/goes/* routes still work via rewrite middleware."""

import pytest
from app.main import app
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# These /api/goes/ URLs should be transparently rewritten to /api/satellite/
# and return the same status as the /api/satellite/ equivalents.
BACKWARD_COMPAT_ENDPOINTS = [
    ("/api/goes/products", "/api/satellite/products"),
    ("/api/goes/frames", "/api/satellite/frames"),
    ("/api/goes/collections", "/api/satellite/collections"),
    ("/api/goes/tags", "/api/satellite/tags"),
    ("/api/goes/frames/stats", "/api/satellite/frames/stats"),
]


@pytest.mark.anyio
@pytest.mark.parametrize("old_path,new_path", BACKWARD_COMPAT_ENDPOINTS)
async def test_goes_alias_returns_same_status(client, old_path, new_path):
    """Verify /api/goes/* backward-compat rewrite returns same status as /api/satellite/*."""
    new_resp = await client.get(new_path)
    old_resp = await client.get(old_path)
    assert old_resp.status_code == new_resp.status_code, (
        f"{old_path} returned {old_resp.status_code}, expected {new_resp.status_code} (same as {new_path})"
    )


@pytest.mark.anyio
async def test_goes_alias_products_returns_data(client):
    """/api/goes/products should return the same data as /api/satellite/products."""
    old_resp = await client.get("/api/goes/products")
    new_resp = await client.get("/api/satellite/products")
    assert old_resp.status_code == new_resp.status_code
    assert old_resp.json() == new_resp.json()
