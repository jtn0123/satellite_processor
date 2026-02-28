"""Tests for storage service path traversal protection."""
import os
import tempfile

import pytest


@pytest.fixture
def storage_service():
    """Create a StorageService with temporary directories."""
    from unittest.mock import patch

    with tempfile.TemporaryDirectory() as tmpdir:
        upload_dir = os.path.join(tmpdir, "uploads")
        output_dir = os.path.join(tmpdir, "output")
        temp_dir = os.path.join(tmpdir, "temp")
        os.makedirs(upload_dir)
        os.makedirs(output_dir)
        os.makedirs(temp_dir)

        with patch("app.services.storage.settings") as mock_settings:
            mock_settings.upload_dir = upload_dir
            mock_settings.output_dir = output_dir
            mock_settings.temp_dir = temp_dir

            from app.services.storage import StorageService

            svc = StorageService()
            yield svc, tmpdir


def test_get_upload_path_normal(storage_service):
    svc, _ = storage_service
    path = svc.get_upload_path("image.png")
    assert path.name == "image.png"
    assert "uploads" in str(path)


def test_get_upload_path_traversal_blocked(storage_service):
    svc, _ = storage_service
    with pytest.raises(ValueError, match="Path traversal"):
        svc.get_upload_path("../../etc/passwd")


def test_delete_file_outside_allowed_dirs_blocked(storage_service):
    svc, tmpdir = storage_service
    # Create a file outside allowed dirs
    outside_file = os.path.join(tmpdir, "secret.txt")
    with open(outside_file, "w") as f:
        f.write("secret")

    result = svc.delete_file(outside_file)
    assert result is False
    assert os.path.exists(outside_file)  # File should still exist


def test_delete_file_in_upload_dir_allowed(storage_service):
    svc, _ = storage_service
    # Create a file inside upload dir
    target = svc.upload_dir / "test.png"
    target.write_text("data")

    result = svc.delete_file(str(target))
    assert result is True
    assert not target.exists()


def test_delete_file_in_output_dir_allowed(storage_service):
    svc, _ = storage_service
    target = svc.output_dir / "result.png"
    target.write_text("data")

    result = svc.delete_file(str(target))
    assert result is True
    assert not target.exists()


def test_delete_nonexistent_file_returns_false(storage_service):
    svc, _ = storage_service
    result = svc.delete_file(str(svc.upload_dir / "nonexistent.png"))
    assert result is False


def test_get_job_output_dir_creates_directory(storage_service):
    svc, _ = storage_service
    job_dir = svc.get_job_output_dir("test-job-123")
    assert job_dir.exists()
    assert job_dir.is_dir()
    assert job_dir.name == "test-job-123"
    assert str(svc.output_dir) in str(job_dir)


def test_get_job_output_dir_idempotent(storage_service):
    svc, _ = storage_service
    dir1 = svc.get_job_output_dir("same-job")
    dir2 = svc.get_job_output_dir("same-job")
    assert dir1 == dir2
    assert dir1.exists()


def test_delete_file_in_temp_dir_allowed(storage_service):
    svc, _ = storage_service
    target = svc.temp_dir / "temp_file.dat"
    target.write_text("temp data")

    result = svc.delete_file(str(target))
    assert result is True
    assert not target.exists()


def test_validate_path_blocks_symlink_traversal(storage_service):
    """Ensure symlink-based traversal is blocked."""
    svc, tmpdir = storage_service
    # Create a symlink inside upload_dir pointing outside
    secret = os.path.join(tmpdir, "secret.txt")
    with open(secret, "w") as f:
        f.write("secret")
    link = svc.upload_dir / "link.txt"
    os.symlink(secret, str(link))

    with pytest.raises(ValueError, match="Path traversal"):
        svc._validate_path(link, svc.upload_dir)


def test_delete_file_sibling_prefix_dir_blocked(storage_service):
    """Sibling directory with similar prefix should not pass containment check."""
    svc, tmpdir = storage_service
    sibling_dir = os.path.join(tmpdir, "uploads_evil")
    os.makedirs(sibling_dir)
    evil_file = os.path.join(sibling_dir, "file.txt")
    with open(evil_file, "w") as f:
        f.write("should not be deletable")

    result = svc.delete_file(evil_file)
    assert result is False
    assert os.path.exists(evil_file)


def test_get_upload_path_returns_resolved(storage_service):
    """get_upload_path should return the resolved canonical path."""
    svc, _ = storage_service
    path = svc.get_upload_path("image.png")
    assert path.is_absolute()
    assert path == path.resolve()
