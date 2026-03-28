"""Tests for shared file path validation utility."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from app.errors import APIError
from app.utils.path_validation import validate_file_path


class TestValidateFilePath:
    @patch("app.utils.path_validation.settings")
    def test_accepts_path_within_storage(self, mock_settings, tmp_path):
        storage = tmp_path / "data"
        storage.mkdir()
        test_file = storage / "image.png"
        test_file.touch()

        mock_settings.storage_path = str(storage)
        mock_settings.output_dir = str(tmp_path / "output")

        result = validate_file_path(str(test_file))
        assert result == test_file.resolve()

    @patch("app.utils.path_validation.settings")
    def test_accepts_path_within_output_dir(self, mock_settings, tmp_path):
        output = tmp_path / "output"
        output.mkdir()
        test_file = output / "video.mp4"
        test_file.touch()

        mock_settings.storage_path = str(tmp_path / "data")
        mock_settings.output_dir = str(output)

        result = validate_file_path(str(test_file))
        assert result == test_file.resolve()

    @patch("app.utils.path_validation.settings")
    def test_rejects_path_traversal(self, mock_settings, tmp_path):
        storage = tmp_path / "data"
        storage.mkdir()
        secret = tmp_path / "secret.txt"
        secret.touch()

        mock_settings.storage_path = str(storage)
        mock_settings.output_dir = str(tmp_path / "output")

        with pytest.raises(APIError) as exc_info:
            validate_file_path(str(storage / ".." / "secret.txt"))
        assert exc_info.value.status_code == 403

    @patch("app.utils.path_validation.settings")
    def test_rejects_absolute_outside_root(self, mock_settings, tmp_path):
        mock_settings.storage_path = str(tmp_path / "data")
        mock_settings.output_dir = str(tmp_path / "output")

        with pytest.raises(APIError) as exc_info:
            validate_file_path("/etc/passwd")
        assert exc_info.value.status_code == 403

    @patch("app.utils.path_validation.settings")
    def test_accepts_nested_path(self, mock_settings, tmp_path):
        storage = tmp_path / "data"
        nested = storage / "goes" / "2024" / "03"
        nested.mkdir(parents=True)
        test_file = nested / "frame.nc"
        test_file.touch()

        mock_settings.storage_path = str(storage)
        mock_settings.output_dir = str(tmp_path / "output")

        result = validate_file_path(str(test_file))
        assert result == test_file.resolve()
