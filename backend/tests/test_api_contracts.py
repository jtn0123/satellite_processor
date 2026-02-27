"""Integration tests: verify all documented endpoints return expected status codes."""

from unittest.mock import MagicMock, patch

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
    mock_send = MagicMock(return_value=MagicMock(id="fake-task-id"))

    with patch("app.routers.jobs.celery_app") as mock_celery:
        mock_celery.send_task = mock_send
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


# ---------------------------------------------------------------------------
# GEOCOLOR / band validation regression tests
# ---------------------------------------------------------------------------


def test_validate_params_geocolor_does_not_raise():
    """GEOCOLOR must be accepted by validate_params (regression for 500 bug)."""
    from app.services.goes_fetcher import validate_params

    # Should not raise
    validate_params("GOES-19", "CONUS", "GEOCOLOR")
    validate_params("GOES-18", "FullDisk", "GEOCOLOR")


def test_valid_bands_includes_geocolor():
    """VALID_BANDS must include GEOCOLOR alongside C01-C16."""
    from app.services.goes_fetcher import VALID_BANDS

    assert "GEOCOLOR" in VALID_BANDS
    # Ensure the 16 ABI bands are still present
    for i in range(1, 17):
        assert f"C{i:02d}" in VALID_BANDS


@pytest.mark.anyio
async def test_catalog_latest_geocolor_no_500(client: AsyncClient):
    """GET /api/goes/catalog/latest?band=GEOCOLOR must not return 500."""
    resp = await client.get(
        "/api/goes/catalog/latest",
        params={"satellite": "GOES-19", "sector": "CONUS", "band": "GEOCOLOR"},
    )
    # 404 is fine (no S3 data for GEOCOLOR), 500 is not
    assert resp.status_code != 500, f"catalog/latest returned 500 for GEOCOLOR: {resp.text}"


@pytest.mark.anyio
async def test_products_includes_geocolor(client: AsyncClient):
    """GET /api/goes/products must list GEOCOLOR in bands."""
    resp = await client.get("/api/goes/products")
    assert resp.status_code == 200
    data = resp.json()
    band_ids = [b["id"] if isinstance(b, dict) else b for b in data.get("bands", [])]
    assert "GEOCOLOR" in band_ids, f"GEOCOLOR missing from /goes/products bands: {band_ids}"


@pytest.mark.anyio
async def test_all_product_bands_accepted_by_catalog_latest(client: AsyncClient):
    """Contract: every band from /goes/products must not 500 on /catalog/latest.

    This is the test that would have caught the GEOCOLOR bug.
    """
    resp = await client.get("/api/goes/products")
    assert resp.status_code == 200
    raw_bands = resp.json().get("bands", [])
    bands = [b["id"] if isinstance(b, dict) else b for b in raw_bands]
    assert len(bands) > 0, "No bands returned from /goes/products"

    failures = []
    for band in bands:
        r = await client.get(
            "/api/goes/catalog/latest",
            params={"satellite": "GOES-19", "sector": "CONUS", "band": band},
        )
        if r.status_code == 500:
            failures.append(f"{band}: 500 - {r.text[:200]}")

    assert not failures, f"Bands returned 500 on /catalog/latest:\n" + "\n".join(failures)
