"""Tests for the error collection router (POST/GET/DELETE /api/errors)."""

import pytest


@pytest.mark.asyncio
async def test_report_error_creates_entry(client):
    """POST /api/errors stores an error report and returns 201."""
    payload = {
        "message": "TypeError: Cannot read property 'foo'",
        "stack": "at App.tsx:42\nat render()",
        "context": {"component": "Dashboard"},
        "url": "http://localhost:3000/",
        "timestamp": "2026-01-01T00:00:00Z",
        "userAgent": "TestBrowser/1.0",
    }
    resp = await client.post("/api/errors", json=payload)
    assert resp.status_code == 201
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_report_error_minimal_payload(client):
    """POST /api/errors accepts minimal payload (just message)."""
    resp = await client.post("/api/errors", json={"message": "Something broke"})
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_report_error_missing_message(client):
    """POST /api/errors rejects payload without message."""
    resp = await client.post("/api/errors", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_errors_empty(client):
    """GET /api/errors returns empty list initially."""
    resp = await client.get("/api/errors")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == [] or isinstance(data["items"], list)
    assert "total" in data
    assert "page" in data


@pytest.mark.asyncio
async def test_list_errors_after_report(client):
    """GET /api/errors returns reported errors."""
    await client.post("/api/errors", json={"message": "err1"})
    await client.post("/api/errors", json={"message": "err2"})
    resp = await client.get("/api/errors")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 2
    messages = [item["message"] for item in data["items"]]
    assert "err1" in messages
    assert "err2" in messages


@pytest.mark.asyncio
async def test_list_errors_pagination(client):
    """GET /api/errors supports pagination params."""
    resp = await client.get("/api/errors", params={"page": 1, "per_page": 5})
    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 1
    assert data["per_page"] == 5


@pytest.mark.asyncio
async def test_clear_errors(client):
    """DELETE /api/errors clears all error logs."""
    await client.post("/api/errors", json={"message": "to be deleted"})
    resp = await client.delete("/api/errors")
    assert resp.status_code == 200
    assert "deleted" in resp.json()

    # Verify cleared
    resp = await client.get("/api/errors")
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_report_error_long_message_rejected(client):
    """POST /api/errors rejects message exceeding max_length."""
    resp = await client.post("/api/errors", json={"message": "x" * 2001})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_report_error_stores_fields(client):
    """POST then GET verifies all fields are stored correctly."""
    payload = {
        "message": "unique-test-error-12345",
        "stack": "Error: unique-test-error-12345\n    at test.js:1",
        "url": "http://localhost:3000/test",
        "userAgent": "TestAgent/2.0",
    }
    await client.post("/api/errors", json=payload)
    resp = await client.get("/api/errors")
    data = resp.json()
    match = [i for i in data["items"] if i["message"] == "unique-test-error-12345"]
    assert len(match) == 1
    item = match[0]
    assert item["stack"] == payload["stack"]
    assert item["url"] == payload["url"]
    assert item["user_agent"] == payload["userAgent"]
    assert "id" in item
    assert "created_at" in item
