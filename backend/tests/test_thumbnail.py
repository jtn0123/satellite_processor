"""Tests for thumbnail generation service."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from app.services.thumbnail import THUMB_SIZE, generate_thumbnail, get_image_dimensions


@pytest.fixture
def sample_image(tmp_path):
    """Create a small test PNG image."""
    from PIL import Image

    img = Image.new("RGB", (800, 600), color=(100, 150, 200))
    path = tmp_path / "test_image.png"
    img.save(str(path))
    return str(path)


@pytest.fixture
def sample_jpeg(tmp_path):
    """Create a small test JPEG image."""
    from PIL import Image

    img = Image.new("RGB", (1024, 768), color=(50, 100, 150))
    path = tmp_path / "test_image.jpg"
    img.save(str(path), "JPEG")
    return str(path)


class TestGenerateThumbnail:
    def test_generates_thumbnail(self, sample_image, tmp_path):
        result = generate_thumbnail(sample_image, str(tmp_path))
        assert result is not None
        thumb = Path(result)
        assert thumb.exists()
        assert thumb.name.startswith("thumb_")
        assert thumb.parent.name == "thumbnails"

    def test_thumbnail_size(self, sample_image, tmp_path):
        from PIL import Image

        result = generate_thumbnail(sample_image, str(tmp_path))
        with Image.open(result) as img:
            assert img.width <= THUMB_SIZE[0]
            assert img.height <= THUMB_SIZE[1]

    def test_thumbnail_is_jpeg(self, sample_image, tmp_path):
        result = generate_thumbnail(sample_image, str(tmp_path))
        assert result.endswith(".jpg")

    def test_output_in_thumbnails_subdir(self, sample_image, tmp_path):
        result = generate_thumbnail(sample_image, str(tmp_path))
        thumb = Path(result)
        assert thumb.parent.name == "thumbnails"
        assert thumb.parent.parent == tmp_path

    def test_default_output_dir(self, sample_image, tmp_path):
        result = generate_thumbnail(sample_image)
        assert result is not None
        assert Path(result).exists()
        # Cleanup: tmp_path owns sample_image's parent, so clean the sibling thumbnails dir
        shutil.rmtree(Path(result).parent, ignore_errors=True)

    def test_nonexistent_source(self):
        result = generate_thumbnail("/nonexistent/image.png")
        assert result is None

    def test_invalid_image(self, tmp_path):
        bad_file = tmp_path / "bad.png"
        bad_file.write_text("not an image")
        result = generate_thumbnail(str(bad_file), str(tmp_path))
        assert result is None


class TestGetImageDimensions:
    def test_returns_dimensions(self, sample_image):
        width, height = get_image_dimensions(sample_image)
        assert width == 800
        assert height == 600

    def test_jpeg_dimensions(self, sample_jpeg):
        width, height = get_image_dimensions(sample_jpeg)
        assert width == 1024
        assert height == 768

    def test_nonexistent_file(self):
        width, height = get_image_dimensions("/nonexistent/file.png")
        assert width is None
        assert height is None

    def test_invalid_file(self, tmp_path):
        bad = tmp_path / "bad.png"
        bad.write_text("not an image")
        width, height = get_image_dimensions(str(bad))
        assert width is None
        assert height is None
