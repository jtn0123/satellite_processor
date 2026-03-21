"""Concurrency and race condition tests for async operations.

Note: SQLite has limited write concurrency, so concurrent write tests
use sequential patterns that still verify data integrity. Concurrent
read tests use asyncio.gather for true parallelism.
"""

import asyncio
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from app.db.database import Base, get_db
from app.db.models import GoesFrame, Job, gen_uuid
from app.main import app
from app.rate_limit import limiter
from app.utils import utcnow
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db
limiter.enabled = False


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db():
    async with TestSessionLocal() as session:
        yield session


class TestConcurrentReads:
    """Test that concurrent read operations don't interfere with each other."""

    async def test_concurrent_job_list(self, client, db):
        """Multiple concurrent list requests should all succeed."""
        for i in range(5):
            db.add(Job(id=gen_uuid(), name=f"job-{i}", status="completed"))
        await db.commit()

        results = await asyncio.gather(
            *[client.get("/api/jobs") for _ in range(10)]
        )

        for resp in results:
            assert resp.status_code == 200
            data = resp.json()
            assert data["total"] == 5

    async def test_concurrent_frame_queries(self, client, db):
        """Concurrent frame queries with different filters should all succeed."""
        for i in range(10):
            db.add(GoesFrame(
                id=gen_uuid(),
                satellite="GOES-19",
                sector="CONUS",
                band=f"C{(i % 3) + 1:02d}",
                capture_time=utcnow(),
                file_path=f"/data/frame_{i}.nc",
            ))
        await db.commit()

        results = await asyncio.gather(
            client.get("/api/satellite/frames?band=C01"),
            client.get("/api/satellite/frames?band=C02"),
            client.get("/api/satellite/frames?band=C03"),
            client.get("/api/satellite/frames?satellite=GOES-19"),
            client.get("/api/satellite/frames"),
        )

        for resp in results:
            assert resp.status_code == 200


class TestWriteIntegrity:
    """Test that sequential write operations maintain data integrity."""

    async def test_job_ids_are_unique(self, client):
        """Rapidly created jobs should all get unique IDs."""
        mock_result = MagicMock()
        mock_result.id = "fake-task-id"

        with patch("app.routers.jobs.celery_app") as mock_celery:
            mock_celery.send_task.return_value = mock_result

            created_ids = set()
            for i in range(10):
                resp = await client.post("/api/jobs", json={
                    "job_type": "image_process",
                    "params": {"input_path": f"/data/input_{i}"},
                })
                assert resp.status_code in (200, 201)
                job_id = resp.json()["id"]
                assert job_id not in created_ids, f"Duplicate job ID: {job_id}"
                created_ids.add(job_id)

            assert len(created_ids) == 10

    async def test_double_delete_returns_404(self, client, db):
        """Deleting the same job twice — second should get 404."""
        job = Job(id=gen_uuid(), name="delete-me", status="completed")
        db.add(job)
        await db.commit()

        resp1 = await client.delete(f"/api/jobs/{job.id}")
        assert resp1.status_code == 200

        resp2 = await client.delete(f"/api/jobs/{job.id}")
        assert resp2.status_code == 404


class TestCircuitBreakerConcurrency:
    """Test async circuit breaker under concurrent access."""

    async def test_concurrent_failures_trip_breaker(self):
        """Multiple concurrent failures should correctly trip the breaker."""
        from app.circuit_breaker import AsyncCircuitBreaker, CircuitState

        breaker = AsyncCircuitBreaker(
            name="test-trip", failure_threshold=3, recovery_timeout=1.0
        )

        await asyncio.gather(
            *[breaker.record_failure() for _ in range(5)]
        )

        assert breaker.state == CircuitState.OPEN

    async def test_concurrent_allow_checks(self):
        """Concurrent allow_request calls should be safe under closed state."""
        from app.circuit_breaker import AsyncCircuitBreaker

        breaker = AsyncCircuitBreaker(
            name="test-allow", failure_threshold=10, recovery_timeout=60.0
        )

        results = await asyncio.gather(
            *[breaker.allow_request() for _ in range(20)]
        )

        assert all(results)

    async def test_half_open_limits_concurrent_calls(self):
        """In half-open state, only one call should be allowed through."""
        from app.circuit_breaker import AsyncCircuitBreaker, CircuitState

        breaker = AsyncCircuitBreaker(
            name="test-halfopen", failure_threshold=1, recovery_timeout=0.01,
            half_open_max_calls=1,
        )

        await breaker.record_failure()
        assert breaker.state == CircuitState.OPEN

        await asyncio.sleep(0.02)  # Wait for recovery timeout

        results = await asyncio.gather(
            *[breaker.allow_request() for _ in range(5)]
        )

        allowed = sum(1 for r in results if r)
        assert allowed == 1, f"Expected 1 allowed, got {allowed}"
