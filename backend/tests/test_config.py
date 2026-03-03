"""Tests for app.config — Settings model, path derivation, and validation."""

import importlib
import logging
from unittest.mock import patch

import pytest

from app.config import Settings


class TestSettingsDefaults:
    """Verify default values are sensible."""

    def test_default_app_name(self):
        with patch.dict("os.environ", {}, clear=True):
            s = Settings(_env_file=None)
        assert s.app_name == "Satellite Processor API"

    def test_debug_defaults_false(self):
        with patch.dict("os.environ", {}, clear=True):
            s = Settings(_env_file=None)
        assert s.debug is False

    def test_default_cors_origins(self):
        with patch.dict("os.environ", {}, clear=True):
            s = Settings(_env_file=None)
        assert "http://localhost:3000" in s.cors_origins
        assert "http://localhost:5173" in s.cors_origins

    def test_api_key_defaults_empty(self):
        with patch.dict("os.environ", {}, clear=True):
            s = Settings(_env_file=None)
        assert s.api_key == ""

    def test_goes_defaults(self):
        with patch.dict("os.environ", {}, clear=True):
            s = Settings(_env_file=None)
        assert s.goes_default_satellite == "GOES-19"
        assert s.goes_default_sector == "CONUS"
        assert s.goes_default_band == "C02"
        assert s.goes_auto_backfill is False


class TestPathDerivation:
    """The derive_paths model_validator should auto-populate directory paths."""

    def test_derived_paths_from_storage_path(self, tmp_path):
        with patch.dict("os.environ", {}, clear=True):
            s = Settings(_env_file=None, storage_path=str(tmp_path))
        assert s.upload_dir == str(tmp_path / "uploads")
        assert s.output_dir == str(tmp_path / "output")
        assert s.temp_dir == str(tmp_path / "temp")

    def test_explicit_paths_not_overridden(self, tmp_path):
        with patch.dict("os.environ", {}, clear=True):
            s = Settings(
                _env_file=None,
                storage_path=str(tmp_path),
                upload_dir="/custom/uploads",
                output_dir="/custom/output",
                temp_dir="/custom/temp",
            )
        assert s.upload_dir == "/custom/uploads"
        assert s.output_dir == "/custom/output"
        assert s.temp_dir == "/custom/temp"

    def test_partial_override(self, tmp_path):
        with patch.dict("os.environ", {}, clear=True):
            s = Settings(
                _env_file=None,
                storage_path=str(tmp_path),
                upload_dir="/custom/uploads",
            )
        assert s.upload_dir == "/custom/uploads"
        assert s.output_dir == str(tmp_path / "output")
        assert s.temp_dir == str(tmp_path / "temp")


class TestEnvironmentOverrides:
    """Settings should pick up env vars."""

    def test_debug_from_env(self):
        with patch.dict("os.environ", {"DEBUG": "true"}, clear=True):
            s = Settings(_env_file=None)
        assert s.debug is True

    def test_database_url_from_env(self):
        with patch.dict("os.environ", {"DATABASE_URL": "postgresql+asyncpg://host/db"}, clear=True):
            s = Settings(_env_file=None)
        assert s.database_url == "postgresql+asyncpg://host/db"

    def test_redis_url_from_env(self):
        with patch.dict("os.environ", {"REDIS_URL": "redis://custom:6380/1"}, clear=True):
            s = Settings(_env_file=None)
        assert s.redis_url == "redis://custom:6380/1"

    def test_cors_origins_from_env(self):
        with patch.dict("os.environ", {"CORS_ORIGINS": '["https://example.com"]'}, clear=True):
            s = Settings(_env_file=None)
        assert s.cors_origins == ["https://example.com"]

    def test_api_key_from_env(self):
        with patch.dict("os.environ", {"API_KEY": "secret-key-123"}, clear=True):
            s = Settings(_env_file=None)
        assert s.api_key == "secret-key-123"


class TestSQLiteWarning:
    """Non-debug mode with SQLite should emit a warning."""

    def test_sqlite_warning_in_non_debug(self, caplog):
        with patch.dict(
            "os.environ",
            {"DEBUG": "false", "DATABASE_URL": "sqlite+aiosqlite:///./test.db"},
            clear=True,
        ):
            with caplog.at_level(logging.WARNING):
                import app.config as config_module
                importlib.reload(config_module)
            assert any("sqlite" in r.message.lower() for r in caplog.records)

    def test_no_warning_with_postgres(self, caplog):
        with patch.dict(
            "os.environ",
            {"DATABASE_URL": "postgresql+asyncpg://host/db"},
            clear=True,
        ):
            with caplog.at_level(logging.WARNING):
                import app.config as config_module
                importlib.reload(config_module)
            assert not any("sqlite" in r.message.lower() for r in caplog.records)

    def test_no_warning_in_debug_mode(self, caplog):
        with patch.dict(
            "os.environ",
            {"DEBUG": "true", "DATABASE_URL": "sqlite+aiosqlite:///./test.db"},
            clear=True,
        ):
            with caplog.at_level(logging.WARNING):
                import app.config as config_module
                importlib.reload(config_module)
            assert not any("sqlite" in r.message.lower() for r in caplog.records)


class TestProductionApiKeyRequired:
    """In production mode (DEBUG=false), missing API_KEY should prevent startup."""

    @pytest.mark.asyncio
    async def test_lifespan_exits_without_api_key_in_production(self):
        """Lifespan should raise SystemExit when DEBUG=false and API_KEY is empty."""
        from unittest.mock import AsyncMock, patch as sync_patch

        from app.main import lifespan, app

        with sync_patch("app.main.app_settings") as mock_settings, \
             sync_patch("app.main.init_db", new_callable=AsyncMock), \
             sync_patch("app.main.setup_logging"):
            mock_settings.debug = False
            mock_settings.api_key = ""
            mock_settings.storage_path = "/tmp"

            with pytest.raises(SystemExit):
                async with lifespan(app):
                    pass

    @pytest.mark.asyncio
    async def test_lifespan_ok_with_api_key_in_production(self):
        """Lifespan should succeed when API_KEY is set in production."""
        from unittest.mock import AsyncMock, patch as sync_patch

        from app.main import lifespan, app

        with sync_patch("app.main.app_settings") as mock_settings, \
             sync_patch("app.main.init_db", new_callable=AsyncMock), \
             sync_patch("app.main.setup_logging"), \
             sync_patch("app.services.stale_jobs.cleanup_all_stale", new_callable=AsyncMock, return_value={"total": 0}), \
             sync_patch("app.main.asyncio.create_task") as mock_task:
            mock_settings.debug = False
            mock_settings.api_key = "my-secret-key"
            mock_settings.storage_path = "/tmp"
            mock_task.return_value = AsyncMock()
            mock_task.return_value.cancel = lambda: None

            # Should not raise
            async with lifespan(app):
                pass

    @pytest.mark.asyncio
    async def test_lifespan_ok_without_api_key_in_debug(self):
        """Lifespan should succeed without API_KEY when DEBUG=true."""
        from unittest.mock import AsyncMock, patch as sync_patch

        from app.main import lifespan, app

        with sync_patch("app.main.app_settings") as mock_settings, \
             sync_patch("app.main.init_db", new_callable=AsyncMock), \
             sync_patch("app.main.setup_logging"), \
             sync_patch("app.services.stale_jobs.cleanup_all_stale", new_callable=AsyncMock, return_value={"total": 0}), \
             sync_patch("app.main.asyncio.create_task") as mock_task:
            mock_settings.debug = True
            mock_settings.api_key = ""
            mock_settings.storage_path = "/tmp"
            mock_task.return_value = AsyncMock()
            mock_task.return_value.cancel = lambda: None

            # Should not raise
            async with lifespan(app):
                pass


class TestExtraFieldsIgnored:
    """Config.extra = 'ignore' should not raise on unknown fields."""

    def test_unknown_env_vars_ignored(self):
        with patch.dict("os.environ", {"TOTALLY_UNKNOWN_VAR_XYZ": "whatever"}, clear=True):
            s = Settings(_env_file=None)
        assert s.app_name == "Satellite Processor API"
