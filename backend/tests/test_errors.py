"""Tests for standardized API error responses and input validation."""

import pytest


@pytest.mark.asyncio
async def test_error_format_not_found(client):
    """APIError returns consistent JSON format."""
    resp = await client.get("/api/jobs/nonexistent-id")
    assert resp.status_code == 404
    data = resp.json()
    assert "error" in data
    assert "detail" in data
    assert data["error"] == "not_found"


@pytest.mark.asyncio
async def test_error_format_image_not_found(client):
    resp = await client.delete("/api/images/nonexistent")
    assert resp.status_code == 404
    data = resp.json()
    assert data["error"] == "not_found"
    assert "detail" in data


@pytest.mark.asyncio
async def test_error_format_preset_not_found(client):
    resp = await client.delete("/api/presets/nonexistent")
    assert resp.status_code == 404
    data = resp.json()
    assert data["error"] == "not_found"


@pytest.mark.asyncio
async def test_upload_invalid_extension(client):
    """Reject files with disallowed extensions."""
    resp = await client.post(
        "/api/images/upload",
        files={"file": ("test.exe", b"fakecontent", "application/octet-stream")},
    )
    assert resp.status_code == 400
    data = resp.json()
    assert data["error"] == "invalid_file_type"


@pytest.mark.asyncio
async def test_upload_no_filename(client):
    resp = await client.post(
        "/api/images/upload",
        files={"file": ("", b"fakecontent", "image/png")},
    )
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_job_create_invalid_type(client):
    """Reject invalid job_type."""
    resp = await client.post("/api/jobs", json={"job_type": "evil_command"})
    assert resp.status_code == 422  # Pydantic validation error


@pytest.mark.asyncio
async def test_job_create_path_traversal(client):
    """Reject path traversal in input_path."""
    resp = await client.post(
        "/api/jobs",
        json={"job_type": "image_process", "input_path": "../../etc/passwd"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_job_create_unknown_params(client):
    """Reject unknown parameter keys."""
    resp = await client.post(
        "/api/jobs",
        json={"job_type": "image_process", "params": {"evil_key": "value"}},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_preset_create_empty_name(client):
    """Reject empty preset name."""
    resp = await client.post("/api/presets", json={"name": "", "params": {"a": 1}})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_preset_create_empty_params(client):
    """Reject empty params dict."""
    resp = await client.post("/api/presets", json={"name": "test", "params": {}})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_preset_create_name_strip(client):
    """Name should be stripped of whitespace."""
    resp = await client.post("/api/presets", json={"name": "  mypreset  ", "params": {"a": 1}})
    # Should succeed (or 409 if duplicate) — the name gets stripped
    if resp.status_code == 200:
        data = resp.json()
        assert data["name"] == "mypreset"


@pytest.mark.asyncio
async def test_duplicate_preset_error_format(client):
    """Duplicate preset returns consistent error format."""
    await client.post("/api/presets", json={"name": "dup", "params": {"a": 1}})
    resp = await client.post("/api/presets", json={"name": "dup", "params": {"b": 2}})
    assert resp.status_code == 409
    data = resp.json()
    assert data["error"] == "duplicate_preset"
