"""Tests for GOES frames router endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime

import pytest
from app.db.models import GoesFrame


def _frame(**overrides) -> GoesFrame:
    defaults = dict(
        id=str(uuid.uuid4()),
        satellite="GOES-16",
        sector="CONUS",
        band="C02",
        capture_time=datetime(2025, 1, 15, 12, 0, 0),
        file_path="/data/frames/test.png",
        file_size=1024,
    )
    defaults.update(overrides)
    return GoesFrame(**defaults)


class TestDashboardStats:
    @pytest.mark.asyncio
    async def test_returns_stats(self, client, db):
        db.add(_frame(satellite="GOES-16"))
        db.add(_frame(satellite="GOES-18"))
        await db.commit()

        resp = await client.get("/api/satellite/dashboard-stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_frames"] == 2
        assert data["frames_by_satellite"]["GOES-16"] == 1
        assert data["frames_by_satellite"]["GOES-18"] == 1

    @pytest.mark.asyncio
    async def test_empty_db(self, client, db):
        resp = await client.get("/api/satellite/dashboard-stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_frames"] == 0


class TestListFrames:
    @pytest.mark.asyncio
    async def test_returns_paginated(self, client, db):
        for i in range(5):
            db.add(_frame(capture_time=datetime(2025, 1, 15, i, 0, 0)))
        await db.commit()

        resp = await client.get("/api/satellite/frames?limit=3")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 3
        assert data["page"] == 1
        assert data["limit"] == 3

    @pytest.mark.asyncio
    async def test_filter_by_satellite(self, client, db):
        db.add(_frame(satellite="GOES-16"))
        db.add(_frame(satellite="GOES-18"))
        await db.commit()

        resp = await client.get("/api/satellite/frames?satellite=GOES-16")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["satellite"] == "GOES-16"

    @pytest.mark.asyncio
    async def test_filter_by_band(self, client, db):
        db.add(_frame(band="C02"))
        db.add(_frame(band="C13"))
        await db.commit()

        resp = await client.get("/api/satellite/frames?band=C13")
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    @pytest.mark.asyncio
    async def test_filter_by_sector(self, client, db):
        db.add(_frame(sector="CONUS"))
        db.add(_frame(sector="FDISK"))
        await db.commit()

        resp = await client.get("/api/satellite/frames?sector=CONUS")
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    @pytest.mark.asyncio
    async def test_sort_ascending(self, client, db):
        db.add(_frame(capture_time=datetime(2025, 1, 15, 12, 0, 0)))
        db.add(_frame(capture_time=datetime(2025, 1, 15, 6, 0, 0)))
        await db.commit()

        resp = await client.get("/api/satellite/frames?sort=capture_time&order=asc")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert items[0]["capture_time"] < items[1]["capture_time"]

    @pytest.mark.asyncio
    async def test_empty_result(self, client, db):
        resp = await client.get("/api/satellite/frames")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    @pytest.mark.asyncio
    async def test_page_2(self, client, db):
        for i in range(5):
            db.add(_frame(capture_time=datetime(2025, 1, 15, i, 0, 0)))
        await db.commit()

        resp = await client.get("/api/satellite/frames?page=2&limit=3")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2  # 5 total, page 2 of 3 = 2 items


class TestFrameStats:
    @pytest.mark.asyncio
    async def test_returns_stats_per_band(self, client, db):
        db.add(_frame(satellite="GOES-16", band="C02", file_size=1000))
        db.add(_frame(satellite="GOES-16", band="C02", file_size=2000))
        db.add(_frame(satellite="GOES-16", band="C13", file_size=500))
        await db.commit()

        resp = await client.get("/api/satellite/frames/stats")
        assert resp.status_code == 200


class TestGetFrame:
    @pytest.mark.asyncio
    async def test_returns_frame(self, client, db):
        fid = str(uuid.uuid4())
        db.add(_frame(id=fid))
        await db.commit()

        resp = await client.get(f"/api/satellite/frames/{fid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == fid

    @pytest.mark.asyncio
    async def test_not_found(self, client, db):
        fid = str(uuid.uuid4())
        resp = await client.get(f"/api/satellite/frames/{fid}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_invalid_uuid(self, client, db):
        resp = await client.get("/api/satellite/frames/not-a-uuid")
        assert resp.status_code == 404


class TestBulkDeleteFrames:
    @pytest.mark.asyncio
    async def test_deletes_frames(self, client, db):
        f1 = _frame()
        f2 = _frame()
        db.add(f1)
        db.add(f2)
        await db.commit()

        resp = await client.request(
            "DELETE",
            "/api/satellite/frames",
            json={"ids": [f1.id, f2.id]},
        )
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 2

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self, client, db):
        resp = await client.request(
            "DELETE",
            "/api/satellite/frames",
            json={"ids": [str(uuid.uuid4())]},
        )
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 0


class TestExportFrames:
    @pytest.mark.asyncio
    async def test_export_json(self, client, db):
        db.add(_frame())
        await db.commit()

        resp = await client.get("/api/satellite/frames/export?format=json")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_export_empty(self, client, db):
        resp = await client.get("/api/satellite/frames/export?format=json")
        assert resp.status_code == 200
