"""Health endpoint tests."""

from pathlib import Path
from unittest.mock import patch

import pytest
from app.routers.health import _parse_changelog, _read_version, _strip_links


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
        with patch.object(h, "_find_changelog", return_value=None):
            result = _parse_changelog()
            assert result == []
    finally:
        h._changelog_cache = original


def test_strip_links():
    assert _strip_links("fix something ([#42](url)) ([abc123](url))") == "fix something"
    assert _strip_links("simple message") == "simple message"


def test_read_version_prefers_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BUILD_VERSION", "9.9.9")
    assert _read_version() == "9.9.9"


def test_read_version_falls_back_to_file_when_env_is_placeholder(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """JTN-418: an unset BUILD_VERSION (or the 0.0.0 placeholder) must
    fall through to the bundled VERSION file rather than reporting 0.0.0."""
    monkeypatch.setenv("BUILD_VERSION", "0.0.0")
    fake_version_file = tmp_path / "VERSION"
    fake_version_file.write_text("1.42.15\n")
    with patch("app.routers.health._find_upward", return_value=fake_version_file):
        assert _read_version() == "1.42.15"


def test_read_version_falls_back_to_file_when_env_unset(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("BUILD_VERSION", raising=False)
    fake_version_file = tmp_path / "VERSION"
    fake_version_file.write_text("1.42.15\n")
    with patch("app.routers.health._find_upward", return_value=fake_version_file):
        assert _read_version() == "1.42.15"


def test_read_version_returns_placeholder_when_nothing_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("BUILD_VERSION", raising=False)
    with patch("app.routers.health._find_upward", return_value=None):
        assert _read_version() == "0.0.0"
