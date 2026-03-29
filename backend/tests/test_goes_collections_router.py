"""Tests for GOES collections router endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime

import pytest
from app.db.models import Collection, CollectionFrame, GoesFrame


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


class TestCreateCollection:
    @pytest.mark.asyncio
    async def test_creates_collection(self, client, db):
        resp = await client.post(
            "/api/satellite/collections",
            json={"name": "Test Collection", "description": "A test"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test Collection"
        assert data["description"] == "A test"
        assert data["frame_count"] == 0

    @pytest.mark.asyncio
    async def test_duplicate_name_returns_409(self, client, db):
        db.add(Collection(id=str(uuid.uuid4()), name="Existing"))
        await db.commit()

        resp = await client.post(
            "/api/satellite/collections",
            json={"name": "Existing"},
        )
        assert resp.status_code == 409


class TestListCollections:
    @pytest.mark.asyncio
    async def test_returns_paginated(self, client, db):
        for i in range(3):
            db.add(Collection(id=str(uuid.uuid4()), name=f"Coll {i}"))
        await db.commit()

        resp = await client.get("/api/satellite/collections")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert len(data["items"]) == 3

    @pytest.mark.asyncio
    async def test_empty(self, client, db):
        resp = await client.get("/api/satellite/collections")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


class TestUpdateCollection:
    @pytest.mark.asyncio
    async def test_updates_name(self, client, db):
        cid = str(uuid.uuid4())
        db.add(Collection(id=cid, name="Old Name"))
        await db.commit()

        resp = await client.put(
            f"/api/satellite/collections/{cid}",
            json={"name": "New Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    @pytest.mark.asyncio
    async def test_not_found(self, client, db):
        cid = str(uuid.uuid4())
        resp = await client.put(
            f"/api/satellite/collections/{cid}",
            json={"name": "X"},
        )
        assert resp.status_code == 404


class TestDeleteCollection:
    @pytest.mark.asyncio
    async def test_deletes_collection(self, client, db):
        cid = str(uuid.uuid4())
        db.add(Collection(id=cid, name="To Delete"))
        await db.commit()

        resp = await client.delete(f"/api/satellite/collections/{cid}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] == cid

    @pytest.mark.asyncio
    async def test_not_found(self, client, db):
        resp = await client.delete(f"/api/satellite/collections/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestAddFramesToCollection:
    @pytest.mark.asyncio
    async def test_adds_frames(self, client, db):
        cid = str(uuid.uuid4())
        db.add(Collection(id=cid, name="Test"))
        f1 = _frame()
        f2 = _frame()
        db.add(f1)
        db.add(f2)
        await db.commit()

        resp = await client.post(
            f"/api/satellite/collections/{cid}/frames",
            json={"frame_ids": [f1.id, f2.id]},
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_collection_not_found(self, client, db):
        resp = await client.post(
            f"/api/satellite/collections/{uuid.uuid4()}/frames",
            json={"frame_ids": [str(uuid.uuid4())]},
        )
        assert resp.status_code == 404


class TestListCollectionFrames:
    @pytest.mark.asyncio
    async def test_returns_frames(self, client, db):
        cid = str(uuid.uuid4())
        db.add(Collection(id=cid, name="Test"))
        f1 = _frame()
        db.add(f1)
        await db.flush()
        db.add(CollectionFrame(collection_id=cid, frame_id=f1.id))
        await db.commit()

        resp = await client.get(f"/api/satellite/collections/{cid}/frames")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1

    @pytest.mark.asyncio
    async def test_collection_not_found(self, client, db):
        resp = await client.get(f"/api/satellite/collections/{uuid.uuid4()}/frames")
        assert resp.status_code == 404


class TestRemoveFramesFromCollection:
    @pytest.mark.asyncio
    async def test_removes_frames(self, client, db):
        cid = str(uuid.uuid4())
        db.add(Collection(id=cid, name="Test"))
        f1 = _frame()
        db.add(f1)
        await db.flush()
        db.add(CollectionFrame(collection_id=cid, frame_id=f1.id))
        await db.commit()

        resp = await client.request(
            "DELETE",
            f"/api/satellite/collections/{cid}/frames",
            json={"frame_ids": [f1.id]},
        )
        assert resp.status_code == 200


class TestExportCollection:
    @pytest.mark.asyncio
    async def test_export_json(self, client, db):
        cid = str(uuid.uuid4())
        db.add(Collection(id=cid, name="Export Test"))
        await db.commit()

        resp = await client.get(f"/api/satellite/collections/{cid}/export?format=json")
        assert resp.status_code == 200
