"""Tests for timezone-aware datetime handling and error surfacing in GOES fetcher."""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
from app.services.goes_fetcher import (
    _list_hour,
    _matches_sector_and_band,
    _parse_scan_time,
    list_available,
)
from botocore.exceptions import ClientError

# ---------------------------------------------------------------------------
# _parse_scan_time always returns UTC-aware datetimes
# ---------------------------------------------------------------------------


class TestParseScanTime:
    def test_returns_utc_aware(self) -> None:
        key = "ABI-L2-CMIPC/2026/060/17/OR_ABI-L2-CMIPC-M6C02_G19_s20260601700213_e20260601702586_c20260601703057.nc"
        result = _parse_scan_time(key)
        assert result is not None
        assert result.tzinfo is not None
        assert result.tzinfo == UTC

    def test_returns_none_for_bad_key(self) -> None:
        assert _parse_scan_time("no_timestamp_here.nc") is None

    def test_parses_correct_time(self) -> None:
        key = "OR_ABI-L2-CMIPM1-M6C02_G19_s20260601730213_e20260601730270_c20260601730309.nc"
        result = _parse_scan_time(key)
        assert result is not None
        assert result.year == 2026
        assert result.hour == 17
        assert result.minute == 30
        assert result.second == 21


# ---------------------------------------------------------------------------
# list_available: timezone coercion
# ---------------------------------------------------------------------------

MOCK_KEY_TEMPLATE = "ABI-L2-CMIPM/2026/060/{hour:02d}/OR_ABI-L2-CMIPM1-M6C02_G19_s2026060{hour:02d}{minute:02d}00{sec}_{rest}.nc"


def _make_s3_page(keys: list[str]) -> list[dict]:
    return [{"Contents": [{"Key": k, "Size": 1024} for k in keys]}]


def _mock_key(hour: int, minute: int) -> str:
    return (
        f"ABI-L2-CMIPM/2026/060/{hour:02d}/"
        f"OR_ABI-L2-CMIPM1-M6C02_G19_s2026060{hour:02d}{minute:02d}000_"
        f"e20260601701000_c20260601701100.nc"
    )


@pytest.fixture()
def _mock_s3():
    """Patch S3 client to return a known set of keys."""
    keys = [_mock_key(17, m) for m in (0, 1, 2, 3, 5)]
    pages = _make_s3_page(keys)

    mock_paginator = MagicMock()
    mock_paginator.paginate.return_value = pages

    mock_client = MagicMock()
    mock_client.get_paginator.return_value = mock_paginator

    with (
        patch("app.services.goes_fetcher._get_s3_client", return_value=mock_client),
        patch("app.services.goes_fetcher._retry_s3_operation", side_effect=lambda fn, *a, **kw: fn()),
    ):
        yield


@pytest.mark.parametrize(
    "start,end,description",
    [
        pytest.param(
            datetime(2026, 3, 1, 17, 0, 0),
            datetime(2026, 3, 1, 17, 5, 0),
            "naive start/end with UTC-aware scan times",
            id="naive",
        ),
        pytest.param(
            datetime(2026, 3, 1, 17, 0, 0, tzinfo=UTC),
            datetime(2026, 3, 1, 17, 5, 0, tzinfo=UTC),
            "UTC-aware start/end",
            id="aware",
        ),
        pytest.param(
            datetime(2026, 3, 1, 17, 0, 0),
            datetime(2026, 3, 1, 17, 5, 0, tzinfo=UTC),
            "mixed naive start + aware end",
            id="mixed",
        ),
    ],
)
@pytest.mark.usefixtures("_mock_s3")
def test_list_available_timezone_handling(start: datetime, end: datetime, description: str) -> None:
    """list_available should find frames regardless of start/end timezone awareness."""
    results = list_available("GOES-19", "Mesoscale1", "C02", start, end)
    assert len(results) > 0, f"Expected frames for: {description}"
    # Results should be sorted by scan_time
    for i in range(1, len(results)):
        assert results[i]["scan_time"] >= results[i - 1]["scan_time"]


@pytest.mark.usefixtures("_mock_s3")
def test_list_available_returns_sorted() -> None:
    results = list_available(
        "GOES-19", "Mesoscale1", "C02",
        datetime(2026, 3, 1, 17, 0, 0),
        datetime(2026, 3, 1, 17, 5, 0),
    )
    times = [r["scan_time"] for r in results]
    assert times == sorted(times)


# ---------------------------------------------------------------------------
# _list_hour: error handling
# ---------------------------------------------------------------------------


class TestListHourErrorHandling:
    def test_s3_client_error_returns_empty(self) -> None:
        """Expected S3 errors should be caught and return empty results."""
        mock_client = MagicMock()
        mock_paginator = MagicMock()
        mock_paginator.paginate.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "Access Denied"}}, "ListObjects"
        )
        mock_client.get_paginator.return_value = mock_paginator

        with patch("app.services.goes_fetcher._retry_s3_operation", side_effect=ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "Access Denied"}}, "ListObjects"
        )):
            results = _list_hour(
                mock_client, "noaa-goes19", "ABI-L2-CMIPM/2026/060/17/",
                "Mesoscale1", "C02",
                datetime(2026, 3, 1, 17, 0, tzinfo=UTC),
                datetime(2026, 3, 1, 17, 10, tzinfo=UTC),
            )
        assert results == []

    def test_programming_error_propagates(self) -> None:
        """TypeError and other programming bugs should NOT be caught."""
        mock_client = MagicMock()
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [{"Contents": [{"Key": "test", "Size": 1}]}]
        mock_client.get_paginator.return_value = mock_paginator

        with patch("app.services.goes_fetcher._retry_s3_operation", side_effect=TypeError("bad comparison")):
            with pytest.raises(TypeError, match="bad comparison"):
                _list_hour(
                    mock_client, "noaa-goes19", "ABI-L2-CMIPM/2026/060/17/",
                    "Mesoscale1", "C02",
                    datetime(2026, 3, 1, 17, 0, tzinfo=UTC),
                    datetime(2026, 3, 1, 17, 10, tzinfo=UTC),
                )


# ---------------------------------------------------------------------------
# _matches_sector_and_band for Mesoscale
# ---------------------------------------------------------------------------


class TestMatchesSectorAndBand:
    @pytest.mark.parametrize(
        "key,sector,band,expected",
        [
            ("OR_ABI-L2-CMIPM1-M6C02_G19_s2026_rest.nc", "Mesoscale1", "C02", True),
            ("OR_ABI-L2-CMIPM2-M6C02_G19_s2026_rest.nc", "Mesoscale2", "C02", True),
            ("OR_ABI-L2-CMIPM2-M6C02_G19_s2026_rest.nc", "Mesoscale1", "C02", False),
            ("OR_ABI-L2-CMIPM1-M6C02_G19_s2026_rest.nc", "Mesoscale2", "C02", False),
            ("OR_ABI-L2-CMIPC-M6C02_G19_s2026_rest.nc", "CONUS", "C02", True),
            ("OR_ABI-L2-CMIPF-M6C13_G19_s2026_rest.nc", "FullDisk", "C13", True),
            ("OR_ABI-L2-CMIPF-M6C13_G19_s2026_rest.nc", "FullDisk", "C02", False),
        ],
    )
    def test_matching(self, key: str, sector: str, band: str, expected: bool) -> None:
        assert _matches_sector_and_band(key, sector, band) == expected


# ---------------------------------------------------------------------------
# Regression: CONUS and FullDisk still work
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("sector,product", [("CONUS", "CMIPC"), ("FullDisk", "CMIPF")])
@pytest.mark.usefixtures("_mock_s3")
def test_list_available_non_meso_sectors(sector: str, product: str) -> None:
    """Non-mesoscale sectors should not crash with the timezone fix."""
    # The mock S3 returns mesoscale keys, so we won't get matches for CONUS/FullDisk,
    # but the important thing is it doesn't crash
    results = list_available(
        "GOES-19", sector, "C02",
        datetime(2026, 3, 1, 17, 0, 0),
        datetime(2026, 3, 1, 17, 10, 0),
    )
    assert isinstance(results, list)
