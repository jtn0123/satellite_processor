"""Tests for pagination on collections, tags, and collection export endpoints."""

import uuid

import pytest
from app.db.models import Collection, Tag


@pytest.mark.asyncio
async def test_collections_pagination(client, db):
    """Verify limit/offset (page) work on GET /api/goes/collections."""
    for i in range(5):
        db.add(Collection(id=str(uuid.uuid4()), name=f"coll-{i}"))
    await db.commit()

    resp = await client.get("/api/goes/collections", params={"page": 1, "limit": 2})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 2
    assert data["page"] == 1
    assert data["limit"] == 2

    resp2 = await client.get("/api/goes/collections", params={"page": 3, "limit": 2})
    assert resp2.status_code == 200
    assert len(resp2.json()["items"]) == 1


@pytest.mark.asyncio
async def test_tags_pagination(client, db):
    """Verify limit/offset (page) work on GET /api/goes/tags."""
    for i in range(5):
        db.add(Tag(id=str(uuid.uuid4()), name=f"tag-{i}", color="#000"))
    await db.commit()

    resp = await client.get("/api/goes/tags", params={"page": 1, "limit": 3})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 3

    resp2 = await client.get("/api/goes/tags", params={"page": 2, "limit": 3})
    assert len(resp2.json()["items"]) == 2


@pytest.mark.asyncio
async def test_collection_export_pagination(client, db):
    """Verify limit/offset work on GET /api/goes/collections/{id}/export."""
    coll_id = str(uuid.uuid4())
    db.add(Collection(id=coll_id, name="export-test"))
    await db.commit()

    resp = await client.get(
        f"/api/goes/collections/{coll_id}/export",
        params={"limit": 10, "offset": 0},
    )
    assert resp.status_code == 200
