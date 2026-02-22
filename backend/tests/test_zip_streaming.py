"""Tests for streaming ZIP generation (#185 fix)."""
from __future__ import annotations

import io
import os
import zipfile

import pytest
from app.errors import APIError
from app.routers.download import MAX_ZIP_FILES, _zip_stream


def _make_files(tmpdir: str, count: int, size: int = 1024) -> list[tuple[str, str]]:
    """Create temp files and return (abs_path, arc_name) pairs."""
    pairs = []
    for i in range(count):
        path = os.path.join(tmpdir, f"file_{i:04d}.dat")
        with open(path, "wb") as f:
            f.write(os.urandom(size))
        pairs.append((path, f"file_{i:04d}.dat"))
    return pairs


class TestZipStreaming:
    """Verify _zip_stream produces valid ZIP archives via streaming."""

    def test_yields_multiple_chunks(self, tmp_path):
        """Response is streamed in multiple chunks, not one big blob."""
        pairs = _make_files(str(tmp_path), 10, size=8192)
        chunks = list(_zip_stream(pairs))
        # With 10 files of 8KB each, we expect multiple chunks
        assert len(chunks) > 1, "Expected multiple chunks for streaming"

    def test_valid_zip_contents(self, tmp_path):
        """Reassembled chunks form a valid ZIP with correct file contents."""
        pairs = _make_files(str(tmp_path), 5, size=256)
        data = b"".join(_zip_stream(pairs))
        buf = io.BytesIO(data)
        with zipfile.ZipFile(buf, "r") as zf:
            names = sorted(zf.namelist())
            assert names == sorted(arc for _, arc in pairs)
            for abs_path, arc_name in pairs:
                with open(abs_path, "rb") as f:
                    expected = f.read()
                assert zf.read(arc_name) == expected

    def test_exceeds_max_files_raises(self, tmp_path):
        """Requesting more than MAX_ZIP_FILES raises APIError."""
        pairs = [(str(tmp_path / "x.dat"), f"f{i}.dat") for i in range(MAX_ZIP_FILES + 1)]
        with pytest.raises(APIError, match="export_too_large|exceeds maximum"):
            # Must consume the generator to trigger the check
            list(_zip_stream(pairs))

    def test_large_file_count_streams_without_full_buffer(self, tmp_path):
        """Many files stream incrementally — first chunk arrives immediately."""
        pairs = _make_files(str(tmp_path), 200, size=512)
        gen = _zip_stream(pairs)
        first_chunk = next(gen)
        assert len(first_chunk) > 0, "First chunk should contain data"
        # Consume the rest
        remaining = b"".join(gen)
        full = first_chunk + remaining
        buf = io.BytesIO(full)
        with zipfile.ZipFile(buf, "r") as zf:
            assert len(zf.namelist()) == 200

    def test_file_missing_at_add_time_skipped(self, tmp_path):
        """Files that don't exist at add time are skipped gracefully."""
        pairs = _make_files(str(tmp_path), 3, size=100)
        # Remove the second file before calling _zip_stream
        os.unlink(pairs[1][0])
        data = b"".join(_zip_stream(pairs))
        buf = io.BytesIO(data)
        with zipfile.ZipFile(buf, "r") as zf:
            names = zf.namelist()
            assert len(names) == 2
            assert pairs[1][1] not in names

    def test_file_disappears_during_streaming(self, tmp_path):
        """File deleted after add but before iteration doesn't crash the generator."""
        pairs = _make_files(str(tmp_path), 3, size=100)
        # Add files normally, then delete one before consuming the stream
        gen = _zip_stream(pairs)
        # Delete the last file after generator is created (files already added)
        os.unlink(pairs[2][0])
        # Should not raise — the generator catches OSError during iteration
        data = b"".join(gen)
        # Archive may be truncated but should not crash
        assert len(data) > 0

    def test_single_file_zip(self, tmp_path):
        """Single file produces valid ZIP."""
        pairs = _make_files(str(tmp_path), 1, size=100)
        data = b"".join(_zip_stream(pairs))
        buf = io.BytesIO(data)
        with zipfile.ZipFile(buf, "r") as zf:
            assert len(zf.namelist()) == 1
