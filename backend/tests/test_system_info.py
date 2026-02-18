"""Tests for system info endpoint — caching, disk/memory/CPU stats."""

import time

import app.routers.system as sys_mod
import pytest

pytestmark = pytest.mark.anyio


async def test_system_status_returns_cpu(client):
    resp = await client.get("/api/system/status")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["cpu_percent"], (int, float))


async def test_system_status_memory_fields(client):
    resp = await client.get("/api/system/status")
    data = resp.json()
    mem = data["memory"]
    assert "total" in mem
    assert "available" in mem
    assert "percent" in mem
    assert mem["total"] > 0


async def test_system_status_disk_fields(client):
    resp = await client.get("/api/system/status")
    data = resp.json()
    disk = data["disk"]
    assert "total" in disk
    assert "free" in disk
    assert "percent" in disk


async def test_system_info_returns_python_version(client):
    # Clear cache to force fresh fetch
    sys_mod._system_info_cache["data"] = None
    sys_mod._system_info_cache["expires"] = 0.0

    resp = await client.get("/api/system/info")
    assert resp.status_code == 200
    data = resp.json()
    assert "python_version" in data
    assert "3." in data["python_version"]


async def test_system_info_returns_platform(client):
    sys_mod._system_info_cache["data"] = None
    sys_mod._system_info_cache["expires"] = 0.0

    resp = await client.get("/api/system/info")
    data = resp.json()
    assert "platform" in data
    assert isinstance(data["platform"], str)


async def test_system_info_returns_uptime(client):
    sys_mod._system_info_cache["data"] = None
    sys_mod._system_info_cache["expires"] = 0.0

    resp = await client.get("/api/system/info")
    data = resp.json()
    assert "uptime_seconds" in data
    assert data["uptime_seconds"] >= 0


async def test_system_info_caching(client):
    """Second call within TTL should return cached data."""
    sys_mod._system_info_cache["data"] = None
    sys_mod._system_info_cache["expires"] = 0.0

    resp1 = await client.get("/api/system/info")
    data1 = resp1.json()

    # Cache should be populated now
    assert sys_mod._system_info_cache["data"] is not None
    assert sys_mod._system_info_cache["expires"] > time.time()

    resp2 = await client.get("/api/system/info")
    data2 = resp2.json()

    # Same cached data
    assert data1["python_version"] == data2["python_version"]
    assert data1["platform"] == data2["platform"]


async def test_system_info_cache_expires(client):
    """Expired cache should trigger fresh fetch."""
    sys_mod._system_info_cache["data"] = {"stale": True}
    sys_mod._system_info_cache["expires"] = time.time() - 10  # expired

    resp = await client.get("/api/system/info")
    data = resp.json()
    assert "stale" not in data
    assert "python_version" in data


async def test_system_info_memory_fields(client):
    sys_mod._system_info_cache["data"] = None
    sys_mod._system_info_cache["expires"] = 0.0

    resp = await client.get("/api/system/info")
    data = resp.json()
    assert "memory" in data
    assert data["memory"]["total"] > 0


async def test_system_info_disk_fields(client):
    sys_mod._system_info_cache["data"] = None
    sys_mod._system_info_cache["expires"] = 0.0

    resp = await client.get("/api/system/info")
    data = resp.json()
    assert "disk" in data
    # Could be dict with total/free or error
    assert isinstance(data["disk"], dict)


async def test_system_info_worker_status(client):
    sys_mod._system_info_cache["data"] = None
    sys_mod._system_info_cache["expires"] = 0.0

    resp = await client.get("/api/system/info")
    data = resp.json()
    assert "worker_status" in data
    assert data["worker_status"] in ("online", "offline", "unknown")
