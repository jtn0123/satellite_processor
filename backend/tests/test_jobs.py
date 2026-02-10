"""Job endpoint tests."""

from unittest.mock import MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_list_jobs_empty(client):
    resp = await client.get("/api/jobs")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_job(client):
    mock_result = MagicMock()
    mock_result.id = "celery-task-123"

    with patch("app.routers.jobs.celery_app") as mock_celery:
        mock_celery.send_task.return_value = mock_result
        resp = await client.post(
            "/api/jobs",
            json={"job_type": "image_process", "params": {}, "input_path": "/tmp/test"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pending"
    assert data["job_type"] == "image_process"


@pytest.mark.asyncio
async def test_get_job(client):
    mock_result = MagicMock()
    mock_result.id = "celery-task-123"

    with patch("app.routers.jobs.celery_app") as mock_celery:
        mock_celery.send_task.return_value = mock_result
        create_resp = await client.post(
            "/api/jobs",
            json={"job_type": "image_process", "params": {}, "input_path": "/tmp"},
        )
    job_id = create_resp.json()["id"]
    resp = await client.get(f"/api/jobs/{job_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == job_id


@pytest.mark.asyncio
async def test_get_nonexistent_job(client):
    resp = await client.get("/api/jobs/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_job(client):
    mock_result = MagicMock()
    mock_result.id = "celery-task-123"

    with patch("app.routers.jobs.celery_app") as mock_celery:
        mock_celery.send_task.return_value = mock_result
        create_resp = await client.post(
            "/api/jobs",
            json={"job_type": "image_process", "params": {}, "input_path": "/tmp"},
        )
    job_id = create_resp.json()["id"]

    async def _mock_publish(*a, **k):
        return 0

    async def _mock_close():
        return None

    with patch("app.routers.jobs.celery_app") as mock_celery, \
         patch("redis.asyncio.Redis.from_url") as mock_redis_cls:
        mock_r = MagicMock()
        mock_r.publish = _mock_publish
        mock_r.close = _mock_close
        mock_redis_cls.return_value = mock_r

        resp = await client.delete(f"/api/jobs/{job_id}")
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True
