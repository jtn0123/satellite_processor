"""Edge-case tests for the jobs endpoint."""

from unittest.mock import MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_create_job_invalid_job_type(client):
    """Creating a job with an invalid job_type should fail validation."""
    resp = await client.post(
        "/api/jobs",
        json={"job_type": "invalid_type", "params": {}, "input_path": "/tmp/test"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_job_with_unknown_params(client):
    """Creating a job with unknown param keys should fail validation."""
    mock_result = MagicMock()
    mock_result.id = "celery-task-123"

    with patch("app.routers.jobs.celery_app") as mock_celery:
        mock_celery.send_task.return_value = mock_result
        resp = await client.post(
            "/api/jobs",
            json={
                "job_type": "image_process",
                "params": {"unknown_key": "value"},
                "input_path": "/tmp/test",
            },
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_delete_already_cancelled_job(client):
    """Deleting (cancelling) an already-cancelled job should still succeed."""
    mock_result = MagicMock()
    mock_result.id = "celery-task-456"

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

    # Cancel once
    with patch("app.routers.jobs.celery_app") as mock_celery, \
         patch("redis.asyncio.Redis.from_url") as mock_redis_cls:
        mock_r = MagicMock()
        mock_r.publish = _mock_publish
        mock_r.close = _mock_close
        mock_redis_cls.return_value = mock_r
        resp1 = await client.delete(f"/api/jobs/{job_id}")

    assert resp1.status_code == 200

    # Delete again — should return 404 since the job was actually deleted
    with patch("app.routers.jobs.celery_app") as mock_celery:
        resp2 = await client.delete(f"/api/jobs/{job_id}")

    assert resp2.status_code == 404


@pytest.mark.asyncio
async def test_get_output_of_non_completed_job(client):
    """Getting output of a pending job should return 400."""
    mock_result = MagicMock()
    mock_result.id = "celery-task-789"

    with patch("app.routers.jobs.celery_app") as mock_celery:
        mock_celery.send_task.return_value = mock_result
        create_resp = await client.post(
            "/api/jobs",
            json={"job_type": "image_process", "params": {}, "input_path": "/tmp"},
        )
    job_id = create_resp.json()["id"]

    resp = await client.get(f"/api/jobs/{job_id}/output")
    assert resp.status_code == 400
    assert "not completed" in resp.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_get_output_nonexistent_job(client):
    """Getting output of a nonexistent job should 404."""
    resp = await client.get("/api/jobs/does-not-exist/output")
    assert resp.status_code == 404
