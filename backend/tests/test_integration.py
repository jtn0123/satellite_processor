"""Integration tests — test real DB + API flow (not mocked)."""

from unittest.mock import MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_create_job_and_retrieve(client, db):
    """Create a job via API, then verify it's in the DB."""
    mock_result = MagicMock()
    mock_result.id = "celery-task-integration"

    with patch("app.routers.jobs.celery_app") as mock_celery:
        mock_celery.send_task.return_value = mock_result
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
    assert any(t["id"] == tag_id for t in resp2.json()["items"])

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


@pytest.mark.asyncio
@pytest.mark.integration
async def test_settings_persistence(client, db):
    """Update settings, read back, verify persistence."""
    resp = await client.put("/api/settings", json={"video_fps": 30, "video_codec": "hevc", "max_frames_per_fetch": 500})
    assert resp.status_code == 200

    resp2 = await client.get("/api/settings")
    assert resp2.status_code == 200
    data = resp2.json()
    assert data["video_fps"] == 30
    assert data["video_codec"] == "hevc"
    assert data["max_frames_per_fetch"] == 500

    # Update again
    resp3 = await client.put("/api/settings", json={"video_fps": 60})
    assert resp3.status_code == 200
    resp4 = await client.get("/api/settings")
    assert resp4.json()["video_fps"] == 60


@pytest.mark.asyncio
@pytest.mark.integration
async def test_goes_fetch_creates_job(client, db):
    """GOES fetch endpoint should create a job record."""
    with patch("app.tasks.goes_tasks.fetch_goes_data") as mock_task:
        mock_result = MagicMock()
        mock_result.id = "celery-goes-fetch"
        mock_task.delay.return_value = mock_result

        from datetime import UTC, datetime, timedelta
        now = datetime(2024, 6, 1, 12, 0, 0, tzinfo=UTC)
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-16",
            "sector": "CONUS",
            "band": "C02",
            "start_time": (now - timedelta(hours=3)).isoformat(),
            "end_time": now.isoformat(),
        })
    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data or "id" in data
    job_id = data.get("job_id") or data.get("id")

    # Verify job exists
    resp2 = await client.get(f"/api/jobs/{job_id}")
    assert resp2.status_code == 200


@pytest.mark.asyncio
@pytest.mark.integration
async def test_collection_full_lifecycle(client, db):
    """Create collection → add frames → list frames → remove → delete."""
    from app.db.models import GoesFrame

    from tests.conftest import TestSessionLocal

    # Seed frames
    frame_ids = []
    async with TestSessionLocal() as session:
        for i in range(3):
            from datetime import UTC, datetime, timedelta

            f = GoesFrame(
                satellite="GOES-16",
                sector="CONUS",
                band="C02",
                capture_time=datetime.now(UTC) - timedelta(minutes=i * 10),
                file_path=f"/tmp/coll_{i}.nc",
                file_size=500,
            )
            session.add(f)
            await session.flush()
            frame_ids.append(str(f.id))
        await session.commit()

    # Create collection
    resp = await client.post("/api/goes/collections", json={
        "name": "Integration Collection",
        "description": "Testing",
    })
    assert resp.status_code == 200
    coll_id = resp.json()["id"]

    # Add frames
    resp2 = await client.post(
        f"/api/goes/collections/{coll_id}/frames",
        json={"frame_ids": frame_ids},
    )
    assert resp2.status_code == 200

    # List frames
    resp3 = await client.get(f"/api/goes/collections/{coll_id}/frames")
    assert resp3.status_code == 200
    assert resp3.json()["total"] >= 3

    # Delete collection
    resp4 = await client.delete(f"/api/goes/collections/{coll_id}")
    assert resp4.status_code == 200

    # Verify gone
    resp5 = await client.get(f"/api/goes/collections/{coll_id}/frames")
    assert resp5.status_code == 404


@pytest.mark.asyncio
@pytest.mark.integration
async def test_animation_workflow(client, db):
    """Full animation workflow: seed frames → create animation → verify."""
    from app.db.models import GoesFrame

    from tests.conftest import TestSessionLocal

    frame_ids = []
    async with TestSessionLocal() as session:
        for i in range(4):
            from datetime import UTC, datetime, timedelta

            f = GoesFrame(
                satellite="GOES-16",
                sector="CONUS",
                band="C02",
                capture_time=datetime.now(UTC) - timedelta(minutes=i * 10),
                file_path=f"/tmp/anim_{i}.nc",
                file_size=1000,
            )
            session.add(f)
            await session.flush()
            frame_ids.append(str(f.id))
        await session.commit()

    with patch("app.tasks.animation_tasks.generate_animation") as mock_task:
        mock_task.delay.return_value = MagicMock(id="task-anim-integration")

        resp = await client.post("/api/goes/animations", json={
            "frame_ids": frame_ids,
            "fps": 10,
            "format": "mp4",
        })
    assert resp.status_code == 200
    anim_id = resp.json()["id"]

    # Verify in list
    resp2 = await client.get("/api/goes/animations")
    assert resp2.status_code == 200
    assert any(a["id"] == anim_id for a in resp2.json()["items"])

    # Verify by ID
    resp3 = await client.get(f"/api/goes/animations/{anim_id}")
    assert resp3.status_code == 200
    assert resp3.json()["frame_count"] == 4
