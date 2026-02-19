"""Shared test fixtures for backend API tests."""

from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from app.db.database import Base, get_db
from app.main import app
from app.rate_limit import limiter
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


def pytest_collection_modifyitems(config, items):
    """Skip integration tests unless explicitly requested with -m integration."""
    if "integration" in (config.getoption("-m") or ""):
        return
    skip_integration = pytest.mark.skip(reason="integration test — run with -m integration")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip_integration)

# In-memory SQLite for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db

# Disable rate limiting in tests
limiter.enabled = False


@pytest.fixture
def mock_redis():
    """Mock Redis to avoid connection errors (opt-in per test/class)."""
    from fakeredis import FakeAsyncRedis

    fake = FakeAsyncRedis(decode_responses=True)
    with patch("app.redis_pool.get_redis_client", return_value=fake), \
         patch("app.redis_pool.get_redis_pool", return_value=MagicMock()), \
         patch("app.services.cache.get_redis_client", return_value=fake), \
         patch("app.routers.health.get_redis_client", return_value=fake), \
         patch("app.main.get_redis_client", return_value=fake):
        yield fake


@pytest.fixture
def mock_celery():
    """Mock Celery to avoid broker connection errors (opt-in per test/class)."""
    mock_result = MagicMock()
    mock_result.id = "fake-task-id"

    with patch("app.routers.jobs.celery_app") as mock_app:
        mock_app.send_task.return_value = mock_result
        mock_app.control.revoke = MagicMock()
        mock_app.control.inspect.return_value = MagicMock()
        mock_app.conf = MagicMock()
        yield mock_app


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Create tables before each test, drop after."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db():
    """Direct DB session for test setup."""
    async with TestSessionLocal() as session:
        yield session
