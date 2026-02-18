"""Tests for worker health check endpoint — Celery inspect, healthy/unhealthy states, timeout."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

pytestmark = pytest.mark.anyio


async def test_health_basic_ok(client):
    """Basic health returns ok status."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] in ("ok", "degraded")


async def test_health_version_endpoint(client):
    """Version endpoint returns version info."""
    resp = await client.get("/api/health/version")
    assert resp.status_code == 200
    data = resp.json()
    assert "version" in data
    assert "commit" in data


async def test_health_detailed_returns_checks(client):
    """Detailed health returns structured checks."""
    with patch("app.routers.health._check_database", new_callable=AsyncMock, return_value={"status": "ok", "latency_ms": 1.0}), \
         patch("app.routers.health._check_redis", new_callable=AsyncMock, return_value={"status": "ok", "latency_ms": 1.0}), \
         patch("app.routers.health._check_worker", new_callable=AsyncMock, return_value={"status": "ok", "workers": 1}), \
         patch("app.routers.health._check_disk", return_value={"status": "ok", "free_gb": 50.0}), \
         patch("app.routers.health._check_storage_dirs", return_value={"status": "ok"}):
        resp = await client.get("/api/health/detailed")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert "checks" in data
    assert "version" in data


async def test_health_detailed_unhealthy_on_db_error(client):
    """Detailed health returns unhealthy when DB is down."""
    with patch("app.routers.health._check_database", new_callable=AsyncMock, return_value={"status": "error", "error": "conn refused"}), \
         patch("app.routers.health._check_redis", new_callable=AsyncMock, return_value={"status": "ok", "latency_ms": 1.0}), \
         patch("app.routers.health._check_worker", new_callable=AsyncMock, return_value={"status": "ok", "workers": 1}), \
         patch("app.routers.health._check_disk", return_value={"status": "ok", "free_gb": 50.0}), \
         patch("app.routers.health._check_storage_dirs", return_value={"status": "ok"}):
        resp = await client.get("/api/health/detailed")
    assert resp.json()["status"] == "unhealthy"


async def test_health_detailed_degraded_on_disk_warning(client):
    """Detailed health returns degraded when disk space is low."""
    with patch("app.routers.health._check_database", new_callable=AsyncMock, return_value={"status": "ok", "latency_ms": 1.0}), \
         patch("app.routers.health._check_redis", new_callable=AsyncMock, return_value={"status": "ok", "latency_ms": 1.0}), \
         patch("app.routers.health._check_worker", new_callable=AsyncMock, return_value={"status": "ok", "workers": 1}), \
         patch("app.routers.health._check_disk", return_value={"status": "warning", "free_gb": 0.5}), \
         patch("app.routers.health._check_storage_dirs", return_value={"status": "ok"}):
        resp = await client.get("/api/health/detailed")
    assert resp.json()["status"] == "degraded"


async def test_worker_check_healthy():
    """_check_worker returns ok with worker count when celery responds."""
    from app.routers.health import _check_worker
    mock_celery = MagicMock()
    mock_inspector = MagicMock()
    mock_inspector.active.return_value = {"worker1": [], "worker2": []}
    mock_celery.control.inspect.return_value = mock_inspector

    with patch("app.celery_app.celery_app", mock_celery):
        result = await _check_worker()
    assert result["status"] == "ok"
    assert result["workers"] == 2


async def test_worker_check_down():
    """_check_worker returns down when no workers respond."""
    from app.routers.health import _check_worker
    mock_celery = MagicMock()
    mock_inspector = MagicMock()
    mock_inspector.active.return_value = None
    mock_celery.control.inspect.return_value = mock_inspector

    with patch("app.celery_app.celery_app", mock_celery):
        result = await _check_worker()
    assert result["status"] == "down"
    assert result["workers"] == 0


async def test_worker_check_exception():
    """_check_worker returns unknown on exception."""
    from app.routers.health import _check_worker
    mock_celery = MagicMock()
    mock_celery.control.inspect.side_effect = Exception("timeout")

    with patch("app.celery_app.celery_app", mock_celery):
        result = await _check_worker()
    assert result["status"] == "unknown"
    assert "error" in result


# ── derive_overall helper ───────────────────────────────────────────

def test_derive_overall_healthy():
    from app.routers.health import _derive_overall
    assert _derive_overall({"a": {"status": "ok"}, "b": {"status": "ok"}}) == "healthy"


def test_derive_overall_degraded():
    from app.routers.health import _derive_overall
    assert _derive_overall({"a": {"status": "ok"}, "b": {"status": "warning"}}) == "degraded"


def test_derive_overall_unhealthy():
    from app.routers.health import _derive_overall
    assert _derive_overall({"a": {"status": "error"}, "b": {"status": "ok"}}) == "unhealthy"


# ── Basic health degraded states ────────────────────────────────────

async def test_health_basic_degraded_db(client):
    """Basic health returns degraded when DB is down."""
    with patch("app.routers.health._check_database", new_callable=AsyncMock, return_value={"status": "error", "error": "down"}), \
         patch("app.routers.health._check_redis", new_callable=AsyncMock, return_value={"status": "ok"}):
        resp = await client.get("/api/health")
    data = resp.json()
    assert data["status"] == "degraded"
    assert data["database"] == "error"


async def test_health_basic_redis_unavailable(client):
    """Basic health returns ok with redis unavailable note when Redis is down."""
    with patch("app.routers.health._check_database", new_callable=AsyncMock, return_value={"status": "ok"}), \
         patch("app.routers.health._check_redis", new_callable=AsyncMock, return_value={"status": "error"}):
        resp = await client.get("/api/health")
    data = resp.json()
    assert data["status"] == "ok"
    assert data["redis"] == "unavailable"
