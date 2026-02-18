"""Tests for system info endpoint — caching, disk/memory/CPU stats."""

import time
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

pytestmark = pytest.mark.anyio


async def test_system_status_has_cpu(client):
    """System status returns cpu_percent."""
    resp = await client.get("/api/system/status")
    assert resp.status_code == 200
    assert "cpu_percent" in resp.json()


async def test_system_status_has_memory_fields(client):
    """System status memory block has total, available, percent."""
    resp = await client.get("/api/system/status")
    mem = resp.json()["memory"]
    assert "total" in mem
    assert "available" in mem
    assert "percent" in mem


async def test_system_status_has_disk_fields(client):
    """System status disk block has total, free, percent."""
    resp = await client.get("/api/system/status")
    disk = resp.json()["disk"]
    assert "total" in disk
    assert "free" in disk
    assert "percent" in disk


async def test_system_info_endpoint(client):
    """System info returns python version, uptime, etc."""
    with patch("app.celery_app.celery_app", MagicMock()) as mock_celery:
        mock_inspector = MagicMock()
        mock_inspector.active.return_value = None
        mock_celery.control.inspect.return_value = mock_inspector
        resp = await client.get("/api/system/info")
    assert resp.status_code == 200
    data = resp.json()
    assert "python_version" in data
    assert "platform" in data
    assert "uptime_seconds" in data
    assert "memory" in data
    assert "disk" in data
    assert "worker_status" in data


async def test_system_info_caching(client):
    """System info should be cached for 30s."""
    import app.routers.system as sys_mod
    # Clear cache
    sys_mod._system_info_cache["data"] = None
    sys_mod._system_info_cache["expires"] = 0.0

    with patch("app.celery_app.celery_app", MagicMock()) as mock_celery:
        mock_inspector = MagicMock()
        mock_inspector.active.return_value = None
        mock_celery.control.inspect.return_value = mock_inspector
        r1 = await client.get("/api/system/info")
        r2 = await client.get("/api/system/info")

    # Both should return same cached data
    assert r1.json()["uptime_seconds"] == r2.json()["uptime_seconds"]
    # Cache should be populated
    assert sys_mod._system_info_cache["data"] is not None
    assert sys_mod._system_info_cache["expires"] > time.time()


async def test_system_info_cache_expiry(client):
    """Expired cache should be refreshed."""
    import app.routers.system as sys_mod
    sys_mod._system_info_cache["data"] = {"cached": True}
    sys_mod._system_info_cache["expires"] = time.time() - 1  # expired

    with patch("app.celery_app.celery_app", MagicMock()) as mock_celery:
        mock_inspector = MagicMock()
        mock_inspector.active.return_value = None
        mock_celery.control.inspect.return_value = mock_inspector
        resp = await client.get("/api/system/info")

    # Should NOT return the stale cached data
    assert "cached" not in resp.json()
    assert "python_version" in resp.json()


async def test_system_info_worker_online(client):
    """System info reports worker as online when celery responds."""
    import app.routers.system as sys_mod
    sys_mod._system_info_cache["data"] = None
    sys_mod._system_info_cache["expires"] = 0.0

    with patch("app.celery_app.celery_app", MagicMock()) as mock_celery:
        mock_inspector = MagicMock()
        mock_inspector.active.return_value = {"worker1": []}
        mock_celery.control.inspect.return_value = mock_inspector
        resp = await client.get("/api/system/info")

    assert resp.json()["worker_status"] == "online"


async def test_system_info_worker_offline(client):
    """System info reports worker as offline when celery returns None."""
    import app.routers.system as sys_mod
    sys_mod._system_info_cache["data"] = None
    sys_mod._system_info_cache["expires"] = 0.0

    with patch("app.celery_app.celery_app", MagicMock()) as mock_celery:
        mock_inspector = MagicMock()
        mock_inspector.active.return_value = None
        mock_celery.control.inspect.return_value = mock_inspector
        resp = await client.get("/api/system/info")

    assert resp.json()["worker_status"] == "offline"


async def test_system_info_disk_error(client):
    """System info handles disk usage error gracefully."""
    import app.routers.system as sys_mod
    sys_mod._system_info_cache["data"] = None
    sys_mod._system_info_cache["expires"] = 0.0

    with patch("app.celery_app.celery_app", MagicMock()) as mock_celery, \
         patch("psutil.disk_usage", side_effect=OSError("no such path")):
        mock_inspector = MagicMock()
        mock_inspector.active.return_value = None
        mock_celery.control.inspect.return_value = mock_inspector
        resp = await client.get("/api/system/info")

    assert "error" in resp.json()["disk"]
