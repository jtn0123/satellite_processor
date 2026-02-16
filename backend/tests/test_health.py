"""Health endpoint tests."""

from unittest.mock import patch

import pytest

from app.routers.health import _parse_changelog, _strip_links


@pytest.mark.asyncio
async def test_health_basic(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_health_detailed(client):
    resp = await client.get("/api/health/detailed")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("healthy", "degraded", "unhealthy")
    assert "checks" in data
    assert "version" in data
    # Should have all check categories
    for key in ("database", "redis", "disk", "storage"):
        assert key in data["checks"]
        assert "status" in data["checks"][key]


@pytest.mark.asyncio
async def test_changelog_endpoint(client):
    resp = await client.get("/api/health/changelog")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


def test_parse_changelog_missing_file():
    """Returns empty list when CHANGELOG.md doesn't exist."""
    import app.routers.health as h
    original = h._changelog_cache
    h._changelog_cache = None  # reset cache
    try:
        with patch.object(h, '_find_changelog', return_value=None):
            result = _parse_changelog()
            assert result == []
    finally:
        h._changelog_cache = original


def test_strip_links():
    assert _strip_links('fix something ([#42](url)) ([abc123](url))') == 'fix something'
    assert _strip_links('simple message') == 'simple message'
