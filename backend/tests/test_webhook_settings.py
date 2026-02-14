"""Tests for webhook.py AppSetting key-value migration."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services.webhook import send_webhook_notification


@pytest.mark.asyncio
async def test_webhook_reads_from_appsetting(db):
    """Webhook reads URL from AppSetting key-value table."""
    from app.db.models import AppSetting

    # Insert a webhook_url setting
    setting = AppSetting(key="webhook_url", value="https://discord.com/api/webhooks/test")
    db.add(setting)
    await db.commit()

    with patch("app.services.webhook.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_client.post.return_value = mock_resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        await send_webhook_notification(db, "test message")

        mock_client.post.assert_called_once_with(
            "https://discord.com/api/webhooks/test",
            json={"content": "test message"},
        )


@pytest.mark.asyncio
async def test_webhook_no_url_configured(db):
    """Webhook does nothing when no webhook_url setting exists."""
    with patch("app.services.webhook.httpx.AsyncClient") as mock_client_cls:
        await send_webhook_notification(db, "test message")
        mock_client_cls.assert_not_called()
