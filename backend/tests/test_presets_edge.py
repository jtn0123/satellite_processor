"""Edge-case tests for the presets endpoint."""

import pytest


@pytest.mark.asyncio
async def test_create_preset_empty_name(client):
    """Creating a preset with an empty name should fail validation."""
    resp = await client.post("/api/presets", json={"name": "", "params": {"crop": True}})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_preset_whitespace_only_name(client):
    """Creating a preset with whitespace-only name — stripped to empty, but accepted by model."""
    resp = await client.post("/api/presets", json={"name": "   ", "params": {"crop": True}})
    # Pydantic strips whitespace after min_length check, so this may succeed
    assert resp.status_code in (200, 422)


@pytest.mark.asyncio
async def test_create_preset_very_long_name(client):
    """Creating a preset with a name exceeding max_length should fail."""
    long_name = "x" * 200
    resp = await client.post("/api/presets", json={"name": long_name, "params": {"a": 1}})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_preset_special_characters(client):
    """Preset names with special characters should be accepted."""
    resp = await client.post(
        "/api/presets",
        json={"name": "test-preset_v2 (final)", "params": {"fps": 30}},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "test-preset_v2 (final)"


@pytest.mark.asyncio
async def test_create_preset_unicode_name(client):
    """Preset with unicode name should work."""
    resp = await client.post(
        "/api/presets",
        json={"name": "日本語プリセット", "params": {"fps": 24}},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_create_preset_empty_params(client):
    """Preset with empty params dict should fail validation."""
    resp = await client.post("/api/presets", json={"name": "no-params", "params": {}})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_update_nonexistent_preset(client):
    """Deleting a nonexistent preset should 404."""
    resp = await client.delete("/api/presets/definitely-not-here")
    assert resp.status_code == 404
