"""Additional GOES router tests — edge cases, composites, latest, preview."""

from datetime import datetime

import pytest
from app.db.models import GoesFrame


@pytest.mark.asyncio
async def test_products_structure(client):
    resp = await client.get("/api/goes/products")
    assert resp.status_code == 200
    data = resp.json()
    assert "satellites" in data
    assert "sectors" in data
    assert "bands" in data
    assert len(data["satellites"]) > 0
    assert len(data["bands"]) == 16
    # Each band should have id and description
    for band in data["bands"]:
        assert "id" in band
        assert "description" in band


@pytest.mark.asyncio
async def test_latest_frame_not_found(client):
    resp = await client.get("/api/goes/latest?satellite=GOES-16&sector=CONUS&band=C02")
    assert resp.status_code == 404
    assert resp.json()["error"] == "not_found"


@pytest.mark.asyncio
async def test_latest_frame_found(client, db):
    frame = GoesFrame(
        id="f1",
        satellite="GOES-16",
        sector="CONUS",
        band="C02",
        capture_time=datetime(2024, 1, 1, 12, 0),
        file_path="/tmp/test.nc",
        file_size=1000,
    )
    db.add(frame)
    await db.commit()

    resp = await client.get("/api/goes/latest?satellite=GOES-16&sector=CONUS&band=C02")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "f1"
    assert data["satellite"] == "GOES-16"


@pytest.mark.asyncio
async def test_latest_returns_most_recent(client, db):
    for i, hour in enumerate([10, 12, 11]):
        db.add(GoesFrame(
            id=f"f{i}", satellite="GOES-16", sector="CONUS", band="C02",
            capture_time=datetime(2024, 1, 1, hour, 0),
            file_path=f"/tmp/t{i}.nc", file_size=100,
        ))
    await db.commit()

    resp = await client.get("/api/goes/latest?satellite=GOES-16&sector=CONUS&band=C02")
    assert resp.status_code == 200
    assert resp.json()["id"] == "f1"  # hour=12 is most recent


@pytest.mark.asyncio
async def test_composite_recipes_list(client):
    resp = await client.get("/api/goes/composite-recipes")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 6
    names = {r["id"] for r in data}
    assert "true_color" in names
    assert "fire_detection" in names


@pytest.mark.asyncio
async def test_create_composite_missing_recipe(client):
    resp = await client.post("/api/goes/composites", json={
        "satellite": "GOES-16", "sector": "CONUS",
        "capture_time": "2024-01-01T12:00:00",
    })
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_composites_list_empty(client):
    resp = await client.get("/api/goes/composites")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_composites_pagination(client):
    resp = await client.get("/api/goes/composites?page=1&limit=5")
    assert resp.status_code == 200
    assert resp.json()["limit"] == 5


@pytest.mark.asyncio
async def test_composite_detail_not_found(client):
    resp = await client.get("/api/goes/composites/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_gaps_endpoint(client):
    resp = await client.get("/api/goes/gaps")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_gaps_with_filters(client):
    resp = await client.get("/api/goes/gaps?satellite=GOES-16&band=C02&expected_interval=15.0")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_gaps_invalid_interval(client):
    resp = await client.get("/api/goes/gaps?expected_interval=0.1")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_health_version(client):
    resp = await client.get("/api/health/version")
    assert resp.status_code == 200
    data = resp.json()
    assert "version" in data
    assert "build" in data


@pytest.mark.asyncio
async def test_settings_update_crop(client):
    resp = await client.put("/api/settings", json={
        "default_crop": {"x": 10, "y": 20, "w": 800, "h": 600}
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["default_crop"]["x"] == 10


@pytest.mark.asyncio
async def test_settings_update_false_color(client):
    resp = await client.put("/api/settings", json={"default_false_color": "fire"})
    assert resp.status_code == 200
    assert resp.json()["default_false_color"] == "fire"


@pytest.mark.asyncio
async def test_settings_invalid_false_color(client):
    resp = await client.put("/api/settings", json={"default_false_color": "invalid"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_settings_update_codec(client):
    for codec in ["h264", "hevc", "av1"]:
        resp = await client.put("/api/settings", json={"video_codec": codec})
        assert resp.status_code == 200
        assert resp.json()["video_codec"] == codec


@pytest.mark.asyncio
async def test_settings_invalid_codec(client):
    resp = await client.put("/api/settings", json={"video_codec": "mpeg4"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_settings_quality_boundary(client):
    resp = await client.put("/api/settings", json={"video_quality": 0})
    assert resp.status_code == 200
    resp = await client.put("/api/settings", json={"video_quality": 51})
    assert resp.status_code == 200
    resp = await client.put("/api/settings", json={"video_quality": 52})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_settings_fps_boundary(client):
    resp = await client.put("/api/settings", json={"video_fps": 1})
    assert resp.status_code == 200
    resp = await client.put("/api/settings", json={"video_fps": 120})
    assert resp.status_code == 200
    resp = await client.put("/api/settings", json={"video_fps": 121})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_settings_timestamp_position(client):
    for pos in ["top-left", "top-right", "bottom-left", "bottom-right"]:
        resp = await client.put("/api/settings", json={"timestamp_position": pos})
        assert resp.status_code == 200
    resp = await client.put("/api/settings", json={"timestamp_position": "center"})
    assert resp.status_code == 422
