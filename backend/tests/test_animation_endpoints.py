"""Tests for animation studio endpoints (v1.8.0)."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from app.db.models import AnimationPreset, CropPreset, GoesFrame


@pytest.mark.asyncio
async def test_create_crop_preset(client, db):
    resp = await client.post("/api/goes/crop-presets", json={
        "name": "Test Crop",
        "x": 100,
        "y": 200,
        "width": 500,
        "height": 400,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Crop"
    assert data["x"] == 100
    assert data["width"] == 500


@pytest.mark.asyncio
async def test_list_crop_presets(client, db):
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as session:
        session.add(CropPreset(name="A", x=0, y=0, width=100, height=100))
        session.add(CropPreset(name="B", x=10, y=10, width=200, height=200))
        await session.commit()

    resp = await client.get("/api/goes/crop-presets")
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


@pytest.mark.asyncio
async def test_update_crop_preset(client, db):
    resp = await client.post("/api/goes/crop-presets", json={
        "name": "Old Name",
        "x": 0, "y": 0, "width": 100, "height": 100,
    })
    preset_id = resp.json()["id"]

    resp2 = await client.put(f"/api/goes/crop-presets/{preset_id}", json={"name": "New Name"})
    assert resp2.status_code == 200
    assert resp2.json()["name"] == "New Name"


@pytest.mark.asyncio
async def test_delete_crop_preset(client, db):
    resp = await client.post("/api/goes/crop-presets", json={
        "name": "Delete Me",
        "x": 0, "y": 0, "width": 100, "height": 100,
    })
    preset_id = resp.json()["id"]

    resp2 = await client.delete(f"/api/goes/crop-presets/{preset_id}")
    assert resp2.status_code == 200

    resp3 = await client.get("/api/goes/crop-presets")
    assert not any(p["id"] == preset_id for p in resp3.json())


@pytest.mark.asyncio
async def test_delete_crop_preset_not_found(client, db):
    resp = await client.delete("/api/goes/crop-presets/00000000-0000-0000-0000-000000000099")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_animation_preset(client, db):
    resp = await client.post("/api/goes/animation-presets", json={
        "name": "Sunset Loop",
        "config": {
            "satellite": "GOES-16",
            "sector": "CONUS",
            "band": "C02",
            "fps": 15,
            "format": "mp4",
            "quality": "high",
        },
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Sunset Loop"
    assert data["config"]["fps"] == 15


@pytest.mark.asyncio
async def test_list_animation_presets(client, db):
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as session:
        session.add(AnimationPreset(name="P1", config={"fps": 10}))
        session.add(AnimationPreset(name="P2", config={"fps": 20}))
        await session.commit()

    resp = await client.get("/api/goes/animation-presets")
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


@pytest.mark.asyncio
async def test_get_animation_preset(client, db):
    resp = await client.post("/api/goes/animation-presets", json={
        "name": "Get Me",
        "config": {"fps": 5},
    })
    pid = resp.json()["id"]

    resp2 = await client.get(f"/api/goes/animation-presets/{pid}")
    assert resp2.status_code == 200
    assert resp2.json()["name"] == "Get Me"


@pytest.mark.asyncio
async def test_get_animation_preset_not_found(client, db):
    resp = await client.get("/api/goes/animation-presets/00000000-0000-0000-0000-000000000099")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_animation_preset(client, db):
    resp = await client.post("/api/goes/animation-presets", json={
        "name": "Old",
        "config": {"fps": 5},
    })
    pid = resp.json()["id"]

    resp2 = await client.put(f"/api/goes/animation-presets/{pid}", json={"name": "New"})
    assert resp2.status_code == 200
    assert resp2.json()["name"] == "New"


@pytest.mark.asyncio
async def test_delete_animation_preset(client, db):
    resp = await client.post("/api/goes/animation-presets", json={
        "name": "Kill Me",
        "config": {"fps": 10},
    })
    pid = resp.json()["id"]

    resp2 = await client.delete(f"/api/goes/animation-presets/{pid}")
    assert resp2.status_code == 200


@pytest.mark.asyncio
async def test_create_animation_no_frames(client, db):
    """Creating animation with empty frame_ids should 400."""
    resp = await client.post("/api/goes/animations", json={
        "frame_ids": [],
        "fps": 10,
        "format": "mp4",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_animation_from_range_no_frames(client, db):
    """from-range with no matching frames → 400."""
    resp = await client.post("/api/goes/animations/from-range", json={
        "satellite": "GOES-16",
        "sector": "CONUS",
        "band": "C02",
        "start_time": "2024-01-01T00:00:00Z",
        "end_time": "2024-01-01T01:00:00Z",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_animation_recent_no_frames(client, db):
    """recent with no matching frames → 400."""
    resp = await client.post("/api/goes/animations/recent", json={
        "satellite": "GOES-16",
        "sector": "CONUS",
        "band": "C02",
        "hours": 1,
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_animations_empty(client, db):
    resp = await client.get("/api/goes/animations")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_get_animation_not_found(client, db):
    resp = await client.get("/api/goes/animations/00000000-0000-0000-0000-000000000099")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_animation_not_found(client, db):
    resp = await client.delete("/api/goes/animations/00000000-0000-0000-0000-000000000099")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_batch_animation_empty_configs(client, db):
    """Batch with empty configs list should 400 or 422."""
    resp = await client.post("/api/goes/animations/batch", json={"configs": []})
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_create_animation_with_frames(client, db):
    """Create frames then animation from them."""
    from tests.conftest import TestSessionLocal

    frame_ids = []
    async with TestSessionLocal() as session:
        for i in range(3):
            frame = GoesFrame(
                satellite="GOES-16",
                sector="CONUS",
                band="C02",
                capture_time=datetime.now(UTC) - timedelta(minutes=i * 10),
                file_path=f"/tmp/test_{i}.nc",
                file_size=1000,
            )
            session.add(frame)
            await session.flush()
            frame_ids.append(str(frame.id))
        await session.commit()

    with patch("app.routers.animations.celery_app", create=True) as mock_celery:
        mock_result = MagicMock()
        mock_result.id = "task-anim-test"
        mock_celery.send_task.return_value = mock_result

        resp = await client.post("/api/goes/animations", json={
            "frame_ids": frame_ids,
            "fps": 10,
            "format": "mp4",
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pending"
    assert data["frame_count"] == 3
