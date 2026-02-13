"""Additional GOES data tests — frames, collections, tags edge cases."""

from datetime import datetime

import pytest
from app.db.models import GoesFrame


@pytest.mark.asyncio
async def test_frames_empty(client):
    resp = await client.get("/api/goes/frames")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_frames_pagination(client, db):
    for i in range(5):
        db.add(GoesFrame(
            id=f"f{i}", satellite="GOES-16", sector="CONUS", band="C02",
            capture_time=datetime(2024, 1, 1, i), file_path=f"/t/{i}.nc", file_size=100,
        ))
    await db.commit()

    resp = await client.get("/api/goes/frames?page=1&limit=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["total"] == 5


@pytest.mark.asyncio
async def test_frames_filter_satellite(client, db):
    db.add(GoesFrame(id="f1", satellite="GOES-16", sector="CONUS", band="C02",
                     capture_time=datetime(2024, 1, 1), file_path="/t/1.nc", file_size=100))
    db.add(GoesFrame(id="f2", satellite="GOES-18", sector="CONUS", band="C02",
                     capture_time=datetime(2024, 1, 1), file_path="/t/2.nc", file_size=100))
    await db.commit()

    resp = await client.get("/api/goes/frames?satellite=GOES-16")
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["satellite"] == "GOES-16"


@pytest.mark.asyncio
async def test_frames_sort_asc(client, db):
    for i in [3, 1, 2]:
        db.add(GoesFrame(id=f"f{i}", satellite="GOES-16", sector="CONUS", band="C02",
                         capture_time=datetime(2024, 1, 1, i), file_path=f"/t/{i}.nc", file_size=i*100))
    await db.commit()

    resp = await client.get("/api/goes/frames?sort=file_size&order=asc")
    items = resp.json()["items"]
    sizes = [it["file_size"] for it in items]
    assert sizes == sorted(sizes)


@pytest.mark.asyncio
async def test_frame_detail_not_found(client):
    resp = await client.get("/api/goes/frames/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_frame_detail(client, db):
    db.add(GoesFrame(id="f1", satellite="GOES-16", sector="CONUS", band="C02",
                     capture_time=datetime(2024, 1, 1), file_path="/t/1.nc", file_size=100))
    await db.commit()

    resp = await client.get("/api/goes/frames/f1")
    assert resp.status_code == 200
    assert resp.json()["id"] == "f1"


@pytest.mark.asyncio
async def test_frame_stats_empty(client):
    resp = await client.get("/api/goes/frames/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_frames"] == 0
    assert data["total_size_bytes"] == 0


@pytest.mark.asyncio
async def test_frame_stats_with_data(client, db):
    db.add(GoesFrame(id="f1", satellite="GOES-16", sector="CONUS", band="C02",
                     capture_time=datetime(2024, 1, 1), file_path="/t/1.nc", file_size=500))
    db.add(GoesFrame(id="f2", satellite="GOES-18", sector="CONUS", band="C13",
                     capture_time=datetime(2024, 1, 1), file_path="/t/2.nc", file_size=300))
    await db.commit()

    resp = await client.get("/api/goes/frames/stats")
    data = resp.json()
    assert data["total_frames"] == 2
    assert data["total_size_bytes"] == 800
    assert "GOES-16" in data["by_satellite"]
    assert "C02" in data["by_band"]


@pytest.mark.asyncio
async def test_bulk_delete_empty_ids(client):
    resp = await client.request("DELETE", "/api/goes/frames", json={"ids": []})
    assert resp.status_code in (200, 422)


@pytest.mark.asyncio
async def test_collection_crud(client):
    # Create
    resp = await client.post("/api/goes/collections", json={"name": "Test Col", "description": "desc"})
    assert resp.status_code == 200
    coll_id = resp.json()["id"]
    assert resp.json()["name"] == "Test Col"

    # List
    resp = await client.get("/api/goes/collections")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # Update
    resp = await client.put(f"/api/goes/collections/{coll_id}", json={"name": "Renamed"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"

    # Delete
    resp = await client.delete(f"/api/goes/collections/{coll_id}")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_update_nonexistent_collection(client):
    resp = await client.put("/api/goes/collections/fake", json={"name": "x"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_collection(client):
    resp = await client.delete("/api/goes/collections/fake")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_add_frames_to_nonexistent_collection(client):
    resp = await client.post("/api/goes/collections/fake/frames", json={"frame_ids": ["f1"]})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tag_crud(client):
    # Create
    resp = await client.post("/api/goes/tags", json={"name": "urgent", "color": "#ff0000"})
    assert resp.status_code == 200
    tag_id = resp.json()["id"]
    assert resp.json()["name"] == "urgent"

    # List
    resp = await client.get("/api/goes/tags")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # Delete
    resp = await client.delete(f"/api/goes/tags/{tag_id}")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_duplicate_tag(client):
    await client.post("/api/goes/tags", json={"name": "dup", "color": "#000"})
    resp = await client.post("/api/goes/tags", json={"name": "dup", "color": "#111"})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_nonexistent_tag(client):
    resp = await client.delete("/api/goes/tags/fake")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_process_frames_no_match(client):
    resp = await client.post("/api/goes/frames/process", json={
        "frame_ids": ["nonexistent"],
        "params": {},
    })
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_frames_date_filter(client, db):
    db.add(GoesFrame(id="f1", satellite="GOES-16", sector="CONUS", band="C02",
                     capture_time=datetime(2024, 1, 1), file_path="/t/1.nc", file_size=100))
    db.add(GoesFrame(id="f2", satellite="GOES-16", sector="CONUS", band="C02",
                     capture_time=datetime(2024, 6, 1), file_path="/t/2.nc", file_size=100))
    await db.commit()

    resp = await client.get("/api/goes/frames?start_date=2024-03-01T00:00:00")
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["id"] == "f2"
