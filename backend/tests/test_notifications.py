"""Tests for notification endpoints."""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from app.db.models import Notification
from app.utils import utcnow


@pytest_asyncio.fixture
async def db_with_notifications(db):
    """Populate DB with test notifications."""
    for i in range(5):
        db.add(
            Notification(
                id=str(uuid.uuid4()),
                type="fetch_complete",
                message=f"Fetch completed #{i}",
                read=False,
                created_at=utcnow(),
            )
        )
    db.add(
        Notification(
            id="read-notif",
            type="fetch_failed",
            message="Fetch failed",
            read=True,
            created_at=utcnow(),
        )
    )
    await db.commit()
    return db


class TestListNotifications:
    @pytest.mark.asyncio
    async def test_returns_notifications(self, client, db_with_notifications):
        resp = await client.get("/api/notifications")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 6

    @pytest.mark.asyncio
    async def test_empty_db(self, client):
        resp = await client.get("/api/notifications")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_notification_fields(self, client, db_with_notifications):
        resp = await client.get("/api/notifications")
        notif = resp.json()[0]
        assert "id" in notif
        assert "type" in notif
        assert "message" in notif
        assert "read" in notif
        assert "timestamp" in notif

    @pytest.mark.asyncio
    async def test_max_50_notifications(self, client, db):
        for i in range(60):
            db.add(
                Notification(
                    id=str(uuid.uuid4()),
                    type="fetch_complete",
                    message=f"Notification {i}",
                    read=False,
                    created_at=utcnow(),
                )
            )
        await db.commit()

        resp = await client.get("/api/notifications")
        assert resp.status_code == 200
        assert len(resp.json()) == 50


class TestMarkRead:
    @pytest.mark.asyncio
    async def test_marks_notification_read(self, client, db_with_notifications):
        # Get a notification
        resp = await client.get("/api/notifications")
        unread = [n for n in resp.json() if not n["read"]]
        notif_id = unread[0]["id"]

        # Mark it as read
        resp = await client.post(f"/api/notifications/{notif_id}/read")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == notif_id
        assert data["read"] is True

    @pytest.mark.asyncio
    async def test_404_for_nonexistent(self, client):
        resp = await client.post(f"/api/notifications/{uuid.uuid4()}/read")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_already_read_idempotent(self, client, db_with_notifications):
        resp = await client.post("/api/notifications/read-notif/read")
        assert resp.status_code == 200
        assert resp.json()["read"] is True
