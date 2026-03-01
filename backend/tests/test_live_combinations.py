"""Combination tests: every satellite × sector × band the user can select."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from app.main import app
from app.models.goes import GoesFetchRequest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

SATELLITES = ["GOES-16", "GOES-18", "GOES-19"]
SECTORS = ["FullDisk", "CONUS", "Mesoscale1", "Mesoscale2"]
BANDS_C = [f"C{i:02d}" for i in range(1, 17)]
ALL_BANDS = ["GEOCOLOR"] + BANDS_C


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _payload(satellite: str, sector: str, band: str) -> dict:
    # GOES-16 decommissioned after 2025-04 — use a date within its availability window
    if satellite == "GOES-16":
        base = datetime(2024, 6, 1, 12, 0, 0, tzinfo=UTC)
    else:
        base = datetime.now(UTC)
    return {
        "satellite": satellite,
        "sector": sector,
        "band": band,
        "start_time": (base - timedelta(minutes=10)).isoformat(),
        "end_time": base.isoformat(),
    }


# ── Pydantic model validation ────────────────────────────────────


class TestValidateBandModel:
    """Test GoesFetchRequest.validate_band for all bands."""

    @pytest.mark.parametrize("band", BANDS_C)
    def test_accepts_valid_band(self, band: str):
        req = GoesFetchRequest(**_payload("GOES-19", "CONUS", band))
        assert req.band == band

    def test_rejects_geocolor_with_helpful_message(self):
        with pytest.raises(ValidationError) as exc_info:
            GoesFetchRequest(**_payload("GOES-19", "CONUS", "GEOCOLOR"))
        msg = str(exc_info.value)
        assert "GEOCOLOR" in msg
        assert "CDN" in msg or "pre-rendered" in msg

    @pytest.mark.parametrize("bad", ["C00", "C17", "C99", "INVALID", "", "geocolor"])
    def test_rejects_invalid_band(self, bad: str):
        with pytest.raises(ValidationError):
            GoesFetchRequest(**_payload("GOES-19", "CONUS", bad))


class TestValidateSatelliteModel:
    @pytest.mark.parametrize("sat", SATELLITES)
    def test_accepts_valid_satellite(self, sat: str):
        req = GoesFetchRequest(**_payload(sat, "CONUS", "C02"))
        assert req.satellite == sat

    @pytest.mark.parametrize("bad", ["GOES-15", "GOES-20", "goes-19", ""])
    def test_rejects_invalid_satellite(self, bad: str):
        with pytest.raises(ValidationError):
            GoesFetchRequest(**_payload(bad, "CONUS", "C02"))


class TestValidateSectorModel:
    @pytest.mark.parametrize("sector", SECTORS)
    def test_accepts_valid_sector(self, sector: str):
        req = GoesFetchRequest(**_payload("GOES-19", sector, "C02"))
        assert req.sector == sector

    @pytest.mark.parametrize("bad", ["Mesoscale3", "conus", "FULLDISK", ""])
    def test_rejects_invalid_sector(self, bad: str):
        with pytest.raises(ValidationError):
            GoesFetchRequest(**_payload("GOES-19", bad, "C02"))


# ── POST /goes/fetch endpoint combinations ───────────────────────


class TestFetchEndpointCombinations:
    """Test POST /goes/fetch for every valid satellite × sector × band combo."""

    @pytest.mark.anyio
    @pytest.mark.parametrize("satellite", SATELLITES)
    @pytest.mark.parametrize("sector", SECTORS)
    @pytest.mark.parametrize("band", ["C02", "C13"])  # representative bands
    async def test_valid_combo_accepted(
        self, client: AsyncClient, mock_redis, mock_celery, satellite, sector, band,
    ):
        """Valid combos should return 200 with a job_id."""
        mock_task = MagicMock()
        mock_task.id = "fake-task-id"
        with patch("app.tasks.goes_tasks.fetch_goes_data") as mock_fetch:
            mock_fetch.delay.return_value = mock_task
            resp = await client.post("/api/goes/fetch", json=_payload(satellite, sector, band))
        assert resp.status_code == 200, f"{satellite}/{sector}/{band}: {resp.text}"
        data = resp.json()
        assert "job_id" in data
        assert data["status"] == "pending"

    @pytest.mark.anyio
    @pytest.mark.parametrize("satellite", SATELLITES)
    @pytest.mark.parametrize("sector", SECTORS)
    async def test_geocolor_rejected_all_sectors(
        self, client: AsyncClient, mock_redis, satellite, sector,
    ):
        """GEOCOLOR must be rejected for every satellite × sector combo."""
        resp = await client.post("/api/goes/fetch", json=_payload(satellite, sector, "GEOCOLOR"))
        assert resp.status_code == 422, f"{satellite}/{sector}/GEOCOLOR should be 422: {resp.text}"
        body = resp.text.lower()
        assert "geocolor" in body

    @pytest.mark.anyio
    @pytest.mark.parametrize("satellite", SATELLITES)
    @pytest.mark.parametrize("band", BANDS_C)
    async def test_all_bands_accepted_conus(
        self, client: AsyncClient, mock_redis, mock_celery, satellite, band,
    ):
        """Every C01-C16 band should be accepted for CONUS."""
        mock_task = MagicMock()
        mock_task.id = "fake-task-id"
        with patch("app.tasks.goes_tasks.fetch_goes_data") as mock_fetch:
            mock_fetch.delay.return_value = mock_task
            resp = await client.post("/api/goes/fetch", json=_payload(satellite, "CONUS", band))
        assert resp.status_code == 200, f"{satellite}/CONUS/{band}: {resp.text}"

    @pytest.mark.anyio
    async def test_invalid_satellite_returns_422(self, client: AsyncClient, mock_redis):
        resp = await client.post("/api/goes/fetch", json=_payload("GOES-15", "CONUS", "C02"))
        assert resp.status_code == 422

    @pytest.mark.anyio
    async def test_invalid_sector_returns_422(self, client: AsyncClient, mock_redis):
        resp = await client.post("/api/goes/fetch", json=_payload("GOES-19", "Invalid", "C02"))
        assert resp.status_code == 422

    @pytest.mark.anyio
    async def test_invalid_band_returns_422(self, client: AsyncClient, mock_redis):
        resp = await client.post("/api/goes/fetch", json=_payload("GOES-19", "CONUS", "X99"))
        assert resp.status_code == 422
