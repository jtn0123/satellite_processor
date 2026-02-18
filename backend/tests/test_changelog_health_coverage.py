"""Tests for changelog parsing and health helper functions."""

import pytest
from unittest.mock import patch
from app.routers.health import _parse_changelog, _strip_links, _derive_overall, _try_append_release, _collect_change

pytestmark = pytest.mark.anyio


def test_strip_links_removes_pr_links():
    """_strip_links removes markdown PR links."""
    assert _strip_links("fix bug ([#42](http://example.com))") == "fix bug"


def test_strip_links_removes_closes():
    """_strip_links removes 'closes' references."""
    assert _strip_links("fix bug, closes #42") == "fix bug"


def test_strip_links_no_links():
    """_strip_links passes through plain text."""
    assert _strip_links("just a message") == "just a message"


def test_try_append_release_appends():
    """_try_append_release adds release to list."""
    releases = []
    result = _try_append_release({"version": "1.0.0"}, releases, 5)
    assert len(releases) == 1
    assert result is False


def test_try_append_release_limit():
    """_try_append_release returns True when limit reached."""
    releases = [{"version": f"{i}.0.0"} for i in range(4)]
    result = _try_append_release({"version": "5.0.0"}, releases, 5)
    assert result is True


def test_try_append_release_none():
    """_try_append_release skips None."""
    releases = []
    result = _try_append_release(None, releases, 5)
    assert len(releases) == 0
    assert result is False


def test_collect_change_bullet():
    """_collect_change extracts bullet items."""
    current = {"changes": []}
    _collect_change(current, "* fixed a bug")
    assert current["changes"] == ["fixed a bug"]


def test_collect_change_not_bullet():
    """_collect_change ignores non-bullet lines."""
    current = {"changes": []}
    _collect_change(current, "not a bullet")
    assert current["changes"] == []


def test_collect_change_none_current():
    """_collect_change handles None current."""
    _collect_change(None, "* something")  # should not raise


async def test_changelog_endpoint(client):
    """GET /api/health/changelog returns list."""
    import app.routers.health as hmod
    hmod._changelog_cache = None  # clear cache
    resp = await client.get("/api/health/changelog")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
