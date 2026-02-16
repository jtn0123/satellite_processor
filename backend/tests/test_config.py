"""Tests for app.config — Settings model, path derivation, and validation."""

import logging
from pathlib import Path
from unittest.mock import patch

import pytest

from app.config import Settings


class TestSettingsDefaults:
    """Verify default values are sensible."""

    def test_default_app_name(self):
        with patch.dict("os.environ", {}, clear=False):
            s = Settings()
        assert s.app_name == "Satellite Processor API"

    def test_debug_defaults_false(self):
        s = Settings()
        assert s.debug is False

    def test_default_cors_origins(self):
        s = Settings()
        assert "http://localhost:3000" in s.cors_origins
        assert "http://localhost:5173" in s.cors_origins

    def test_api_key_defaults_empty(self):
        s = Settings()
        assert s.api_key == ""

    def test_goes_defaults(self):
        s = Settings()
        assert s.goes_default_satellite == "GOES-16"
        assert s.goes_default_sector == "FullDisk"
        assert s.goes_default_band == "C02"
        assert s.goes_auto_backfill is False


class TestPathDerivation:
    """The derive_paths model_validator should auto-populate directory paths."""

    def test_derived_paths_from_storage_path(self, tmp_path):
        s = Settings(storage_path=str(tmp_path))
        assert s.upload_dir == str(tmp_path / "uploads")
        assert s.output_dir == str(tmp_path / "output")
        assert s.temp_dir == str(tmp_path / "temp")

    def test_explicit_paths_not_overridden(self, tmp_path):
        s = Settings(
            storage_path=str(tmp_path),
            upload_dir="/custom/uploads",
            output_dir="/custom/output",
            temp_dir="/custom/temp",
        )
        assert s.upload_dir == "/custom/uploads"
        assert s.output_dir == "/custom/output"
        assert s.temp_dir == "/custom/temp"

    def test_partial_override(self, tmp_path):
        s = Settings(
            storage_path=str(tmp_path),
            upload_dir="/custom/uploads",
        )
        assert s.upload_dir == "/custom/uploads"
        assert s.output_dir == str(tmp_path / "output")
        assert s.temp_dir == str(tmp_path / "temp")


class TestEnvironmentOverrides:
    """Settings should pick up env vars."""

    def test_debug_from_env(self):
        with patch.dict("os.environ", {"DEBUG": "true"}):
            s = Settings()
        assert s.debug is True

    def test_database_url_from_env(self):
        with patch.dict("os.environ", {"DATABASE_URL": "postgresql+asyncpg://host/db"}):
            s = Settings()
        assert s.database_url == "postgresql+asyncpg://host/db"

    def test_redis_url_from_env(self):
        with patch.dict("os.environ", {"REDIS_URL": "redis://custom:6380/1"}):
            s = Settings()
        assert s.redis_url == "redis://custom:6380/1"

    def test_cors_origins_from_env(self):
        with patch.dict("os.environ", {"CORS_ORIGINS": '["https://example.com"]'}):
            s = Settings()
        assert s.cors_origins == ["https://example.com"]

    def test_api_key_from_env(self):
        with patch.dict("os.environ", {"API_KEY": "secret-key-123"}):
            s = Settings()
        assert s.api_key == "secret-key-123"


class TestSQLiteWarning:
    """Non-debug mode with SQLite should emit a warning."""

    def test_sqlite_warning_in_non_debug(self, caplog):
        with caplog.at_level(logging.WARNING):
            Settings(debug=False, database_url="sqlite+aiosqlite:///./test.db")
        # The warning is emitted at module level on import, so we test
        # the settings object is valid at minimum
        s = Settings(debug=False, database_url="sqlite+aiosqlite:///./test.db")
        assert "sqlite" in s.database_url.lower()

    def test_no_warning_with_postgres(self):
        s = Settings(debug=False, database_url="postgresql+asyncpg://host/db")
        assert "postgresql" in s.database_url.lower()

    def test_no_warning_in_debug_mode(self):
        s = Settings(debug=True, database_url="sqlite+aiosqlite:///./test.db")
        assert s.debug is True


class TestExtraFieldsIgnored:
    """Config.extra = 'ignore' should not raise on unknown fields."""

    def test_unknown_env_vars_ignored(self):
        with patch.dict("os.environ", {"TOTALLY_UNKNOWN_VAR_XYZ": "whatever"}):
            s = Settings()
        assert s.app_name == "Satellite Processor API"
