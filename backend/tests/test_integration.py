"""Integration tests — test real DB + API flow (not mocked)."""

import pytest


@pytest.mark.asyncio
async def test_create_job_and_retrieve(client, db):
    """Create a job via API, then verify it's in the DB."""
    resp = await client.post("/api/jobs", json={
        "job_type": "image_process",
        "params": {},
    })
    assert resp.status_code == 200
    data = resp.json()
    job_id = data["id"]
    assert data["status"] == "pending"

    # Retrieve it
    resp2 = await client.get(f"/api/jobs/{job_id}")
    assert resp2.status_code == 200
    assert resp2.json()["id"] == job_id


@pytest.mark.asyncio
async def test_job_list_pagination(client, db):
    """Create multiple jobs, verify pagination returns correct page size."""
    # Create jobs directly via DB to avoid rate limiting
    from app.db.models import Job

    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as session:
        for _i in range(5):
            session.add(Job(job_type="image_process", params={}))
        await session.commit()

    resp = await client.get("/api/jobs?page=1&limit=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["total"] >= 5


@pytest.mark.asyncio
async def test_create_and_delete_tag(client, db):
    """Full lifecycle: create tag, list, delete."""
    resp = await client.post("/api/goes/tags", json={"name": "test-tag", "color": "#ff0000"})
    assert resp.status_code == 200
    tag_id = resp.json()["id"]

    resp2 = await client.get("/api/goes/tags")
    assert resp2.status_code == 200
    assert any(t["id"] == tag_id for t in resp2.json())

    resp3 = await client.delete(f"/api/goes/tags/{tag_id}")
    assert resp3.status_code == 200


@pytest.mark.asyncio
async def test_create_collection_lifecycle(client, db):
    """Create, update, delete a collection."""
    resp = await client.post("/api/goes/collections", json={"name": "Test Collection", "description": "desc"})
    assert resp.status_code == 200
    coll_id = resp.json()["id"]

    resp2 = await client.put(f"/api/goes/collections/{coll_id}", json={"name": "Updated"})
    assert resp2.status_code == 200
    assert resp2.json()["name"] == "Updated"

    resp3 = await client.delete(f"/api/goes/collections/{coll_id}")
    assert resp3.status_code == 200


@pytest.mark.asyncio
async def test_error_response_format(client):
    """Error responses should have consistent envelope."""
    resp = await client.get("/api/jobs/not-a-valid-uuid")
    assert resp.status_code == 404
    data = resp.json()
    assert "error" in data
    assert "detail" in data
    assert "status_code" in data


@pytest.mark.asyncio
async def test_openapi_json_returns_json(client):
    """/openapi.json should return valid JSON."""
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    data = resp.json()
    assert "openapi" in data
    assert "paths" in data


@pytest.mark.asyncio
async def test_health_detailed_endpoint(client):
    """/api/health/detailed should return component health."""
    resp = await client.get("/api/health/detailed")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "checks" in data
    assert "database" in data["checks"]


@pytest.mark.asyncio
async def test_stats_endpoint(client):
    """/api/stats should return counts."""
    resp = await client.get("/api/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_images" in data
    assert "total_jobs" in data


@pytest.mark.asyncio
async def test_system_status(client):
    """System status should return CPU/memory/disk info."""
    resp = await client.get("/api/system/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "cpu_percent" in data
    assert "memory" in data
