"""Tests for HTTP Idempotency-Key support (JTN-391) and Celery task idempotency (JTN-398)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from app.idempotency import (
    IDEMPOTENCY_TTL_SECONDS,
    _build_redis_key,
    _validate_key,
    get_cached_response,
    store_response,
)
from app.tasks.helpers import TASK_IDEMPOTENCY_TTL_SECONDS, with_idempotency
from fakeredis import FakeAsyncRedis, FakeRedis

# ── Unit tests for idempotency helpers ────────────────────────────────────


class TestValidateKey:
    def test_accepts_uuid(self):
        assert _validate_key("3f9d9a8d-7bb9-4f8c-b7b6-6e7d5b2a6a7c") == "3f9d9a8d-7bb9-4f8c-b7b6-6e7d5b2a6a7c"

    def test_accepts_ulid(self):
        assert _validate_key("01HZKX1YQXZABCDEFGHJKMNPQR") == "01HZKX1YQXZABCDEFGHJKMNPQR"

    def test_strips_whitespace(self):
        assert _validate_key("  abc123  ") == "abc123"

    def test_rejects_empty(self):
        from app.errors import APIError

        with pytest.raises(APIError) as exc_info:
            _validate_key("")
        assert exc_info.value.status_code == 400
        assert exc_info.value.error == "invalid_idempotency_key"

    def test_rejects_whitespace_only(self):
        from app.errors import APIError

        with pytest.raises(APIError) as exc_info:
            _validate_key("   ")
        assert exc_info.value.status_code == 400

    def test_rejects_too_long(self):
        from app.errors import APIError

        with pytest.raises(APIError) as exc_info:
            _validate_key("a" * 300)
        assert exc_info.value.status_code == 400

    def test_rejects_invalid_characters(self):
        from app.errors import APIError

        with pytest.raises(APIError):
            _validate_key("key with spaces")
        with pytest.raises(APIError):
            _validate_key("key/with/slash")

    def test_build_redis_key_namespaces_method_and_path(self):
        key = _build_redis_key("POST", "/api/jobs", "abc")
        assert key.startswith("idem:POST:/api/jobs:")
        assert key.endswith(":abc")


class TestCacheStore:
    @pytest.mark.asyncio
    async def test_miss_returns_none(self, mock_redis):
        result = await get_cached_response("POST", "/api/jobs", "key-that-does-not-exist")
        assert result is None

    @pytest.mark.asyncio
    async def test_store_then_get_roundtrip(self, mock_redis):
        body = {"id": "job-1", "status": "pending"}
        await store_response("POST", "/api/jobs", "roundtrip-key", 200, body)
        cached = await get_cached_response("POST", "/api/jobs", "roundtrip-key")
        assert cached == {"status_code": 200, "body": body}

    @pytest.mark.asyncio
    async def test_store_uses_nx_and_ttl(self, mock_redis):
        await store_response("POST", "/api/jobs", "ttl-key", 200, {"id": "job-2"})
        redis_key = _build_redis_key("POST", "/api/jobs", "ttl-key")
        ttl = await mock_redis.ttl(redis_key)
        assert 0 < ttl <= IDEMPOTENCY_TTL_SECONDS

    @pytest.mark.asyncio
    async def test_corrupt_payload_returns_none(self, mock_redis):
        redis_key = _build_redis_key("POST", "/api/jobs", "bad-json")
        await mock_redis.set(redis_key, "not-json-at-all")
        result = await get_cached_response("POST", "/api/jobs", "bad-json")
        assert result is None

    @pytest.mark.asyncio
    async def test_redis_unavailable_returns_none(self):
        fake = MagicMock()

        async def _raise(*_a, **_k):
            raise ConnectionError("boom")

        fake.get = _raise
        with patch("app.idempotency.get_redis_client", return_value=fake):
            result = await get_cached_response("POST", "/api/jobs", "err-key")
        assert result is None

    @pytest.mark.asyncio
    async def test_store_swallows_redis_errors(self):
        fake = MagicMock()

        async def _raise(*_a, **_k):
            raise ConnectionError("boom")

        fake.set = _raise
        with patch("app.idempotency.get_redis_client", return_value=fake):
            # Should not raise
            await store_response("POST", "/api/jobs", "err-key", 200, {"id": "x"})


# ── End-to-end duplicate-key behavior ─────────────────────────────────────


@pytest.mark.asyncio
class TestCreateJobIdempotency:
    async def test_duplicate_key_returns_cached_response(self, client, mock_redis):
        mock_result = MagicMock()
        mock_result.id = "celery-task-abc"

        with patch("app.routers.jobs.celery_app") as mock_celery:
            mock_celery.send_task.return_value = mock_result
            first = await client.post(
                "/api/jobs",
                json={"job_type": "image_process", "params": {}, "input_path": "/tmp/a"},
                headers={"Idempotency-Key": "dup-key-1"},
            )
            assert first.status_code == 200
            first_body = first.json()

            # Second call with same key — should NOT create a new job
            second = await client.post(
                "/api/jobs",
                json={"job_type": "image_process", "params": {}, "input_path": "/tmp/different"},
                headers={"Idempotency-Key": "dup-key-1"},
            )
            assert second.status_code == 200
            assert second.json()["id"] == first_body["id"]
            # Second call should not have invoked send_task again
            assert mock_celery.send_task.call_count == 1

    async def test_different_keys_create_different_jobs(self, client, mock_redis):
        mock_result = MagicMock()
        mock_result.id = "celery-task-xyz"

        with patch("app.routers.jobs.celery_app") as mock_celery:
            mock_celery.send_task.return_value = mock_result
            r1 = await client.post(
                "/api/jobs",
                json={"job_type": "image_process", "params": {}, "input_path": "/tmp/a"},
                headers={"Idempotency-Key": "unique-key-1"},
            )
            r2 = await client.post(
                "/api/jobs",
                json={"job_type": "image_process", "params": {}, "input_path": "/tmp/b"},
                headers={"Idempotency-Key": "unique-key-2"},
            )
            assert r1.status_code == 200
            assert r2.status_code == 200
            assert r1.json()["id"] != r2.json()["id"]
            assert mock_celery.send_task.call_count == 2

    async def test_no_key_still_works(self, client, mock_redis):
        mock_result = MagicMock()
        mock_result.id = "celery-task-no-key"

        with patch("app.routers.jobs.celery_app") as mock_celery:
            mock_celery.send_task.return_value = mock_result
            resp = await client.post(
                "/api/jobs",
                json={"job_type": "image_process", "params": {}, "input_path": "/tmp/a"},
            )
            assert resp.status_code == 200

    async def test_invalid_key_format_rejected(self, client, mock_redis):
        resp = await client.post(
            "/api/jobs",
            json={"job_type": "image_process", "params": {}, "input_path": "/tmp/a"},
            headers={"Idempotency-Key": "has spaces"},
        )
        assert resp.status_code == 400
        assert resp.json()["error"] == "invalid_idempotency_key"


@pytest.mark.asyncio
class TestFetchGoesIdempotency:
    async def test_duplicate_key_on_fetch_returns_cached(self, client, mock_redis):
        now = datetime.now(UTC)
        payload = {
            "satellite": "GOES-19",
            "sector": "CONUS",
            "band": "C02",
            "start_time": (now - timedelta(hours=1)).isoformat(),
            "end_time": now.isoformat(),
        }
        with patch("app.tasks.goes_tasks.fetch_goes_data.delay") as mock_delay:
            mock_delay.return_value = MagicMock(id="task-1")

            first = await client.post(
                "/api/satellite/fetch",
                json=payload,
                headers={"Idempotency-Key": "fetch-key-1"},
            )
            assert first.status_code == 200
            first_body = first.json()

            second = await client.post(
                "/api/satellite/fetch",
                json=payload,
                headers={"Idempotency-Key": "fetch-key-1"},
            )
            assert second.status_code == 200
            assert second.json()["job_id"] == first_body["job_id"]
            # Celery task should only be enqueued once
            assert mock_delay.call_count == 1

    async def test_fetch_without_key_dispatches_twice(self, client, mock_redis):
        now = datetime.now(UTC)
        payload = {
            "satellite": "GOES-19",
            "sector": "CONUS",
            "band": "C02",
            "start_time": (now - timedelta(hours=1)).isoformat(),
            "end_time": now.isoformat(),
        }
        with patch("app.tasks.goes_tasks.fetch_goes_data.delay") as mock_delay:
            mock_delay.return_value = MagicMock(id="task-x")
            await client.post("/api/satellite/fetch", json=payload)
            await client.post("/api/satellite/fetch", json=payload)
            assert mock_delay.call_count == 2


# ── Celery task idempotency (JTN-398) ─────────────────────────────────────


class TestWithIdempotency:
    def test_first_acquire_succeeds(self):
        fake = FakeRedis()
        with patch("app.tasks.helpers._get_redis", return_value=fake), with_idempotency("test-key-1") as acquired:
            assert acquired is True

    def test_duplicate_acquire_returns_false(self):
        fake = FakeRedis()
        # Pre-seed the lock so the attempt looks like a duplicate.
        fake.set("task_idem:dup-key", "1", nx=True, ex=TASK_IDEMPOTENCY_TTL_SECONDS)
        with patch("app.tasks.helpers._get_redis", return_value=fake), with_idempotency("dup-key") as acquired:
            assert acquired is False

    def test_successful_exit_releases_lock(self):
        fake = FakeRedis()
        with patch("app.tasks.helpers._get_redis", return_value=fake):
            with with_idempotency("release-key"):
                pass
            # Lock should be gone after successful exit
            assert fake.get("task_idem:release-key") is None

    def test_exception_keeps_lock(self):
        fake = FakeRedis()
        with patch("app.tasks.helpers._get_redis", return_value=fake):
            with pytest.raises(RuntimeError), with_idempotency("err-key"):
                raise RuntimeError("boom")
            # Lock persists — prevents re-running a flaky task immediately
            assert fake.get("task_idem:err-key") is not None

    def test_redis_unavailable_fails_open(self):
        broken = MagicMock()
        broken.set.side_effect = ConnectionError("down")
        with patch("app.tasks.helpers._get_redis", return_value=broken), with_idempotency("fail-open-key") as acquired:
            # Failing open: task runs, dedup disabled for this call.
            assert acquired is True

    def test_ttl_applied(self):
        fake = FakeRedis()
        with patch("app.tasks.helpers._get_redis", return_value=fake), with_idempotency("ttl-key", ttl_seconds=120):
            ttl = fake.ttl("task_idem:ttl-key")
            assert 0 < ttl <= 120


class TestBuildFetchIdempotencyKey:
    def test_key_includes_all_fields(self):
        from app.tasks.fetch_task import _build_fetch_idempotency_key

        params = {
            "satellite": "GOES-19",
            "sector": "CONUS",
            "band": "C02",
            "start_time": "2025-01-01T00:00:00",
            "end_time": "2025-01-01T01:00:00",
        }
        key = _build_fetch_idempotency_key(params)
        assert "GOES-19" in key
        assert "CONUS" in key
        assert "C02" in key
        assert key.startswith("fetch:")

    def test_key_handles_missing_fields(self):
        from app.tasks.fetch_task import _build_fetch_idempotency_key

        key = _build_fetch_idempotency_key({})
        assert key.startswith("fetch:")


# Ensure fakeredis imports still work as expected; keeps the test
# module honest about the fixture contract rather than silently passing
# a stale import.
def test_fakeredis_available():
    assert FakeAsyncRedis is not None
    assert FakeRedis is not None
