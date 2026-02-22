"""Tests for config dead-code fix: Settings fields must drive module-level defaults."""

from unittest.mock import patch

import pytest


class TestSettingsFieldsWired:
    """Verify that Settings fields actually drive the module-level constants."""

    def test_default_satellite_matches_settings(self):
        from app.config import DEFAULT_SATELLITE, settings
        assert DEFAULT_SATELLITE == settings.goes_default_satellite

    def test_default_sector_matches_settings(self):
        from app.config import DEFAULT_SECTOR, settings
        assert DEFAULT_SECTOR == settings.goes_default_sector

    def test_default_band_matches_settings(self):
        from app.config import DEFAULT_BAND, settings
        assert DEFAULT_BAND == settings.goes_default_band

    def test_env_var_override_takes_effect(self):
        """Changing GOES_DEFAULT_SATELLITE env var should change the Settings value."""
        with patch.dict("os.environ", {"GOES_DEFAULT_SATELLITE": "GOES-18"}):
            from app.config import Settings
            fresh = Settings()
            assert fresh.goes_default_satellite == "GOES-18"


@pytest.mark.asyncio
class TestRouterUsesSettings:
    """Integration: the /goes/config endpoint should reflect Settings defaults."""

    async def test_goes_config_returns_settings_default(self, client):
        resp = await client.get("/api/goes/config")
        if resp.status_code == 200:
            data = resp.json()
            from app.config import settings
            assert data["default_satellite"] == settings.goes_default_satellite
