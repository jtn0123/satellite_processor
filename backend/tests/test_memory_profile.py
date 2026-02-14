"""Memory profiling tests to validate container memory limits.

These tests measure actual memory usage of key operations to ensure
Docker memory limits are safe. Run with:
    pytest backend/tests/test_memory_profile.py -v -s --tb=short

Marked as integration tests since they hit real S3 / do real processing.
"""
from __future__ import annotations

import gc
import resource
import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest


def get_rss_mb() -> float:
    """Get current process RSS (Resident Set Size) in MB."""
    # resource.getrusage returns max RSS in KB on Linux
    usage = resource.getrusage(resource.RUSAGE_SELF)
    return usage.ru_maxrss / 1024  # KB → MB


def get_current_rss_mb() -> float:
    """Get current (not peak) RSS from /proc/self/status."""
    try:
        with open("/proc/self/status") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) / 1024  # KB → MB
    except FileNotFoundError:
        pass
    # Fallback to peak RSS
    return get_rss_mb()


@pytest.mark.integration
class TestWorkerMemory:
    """Validate memory usage stays within container limits."""

    def test_netcdf_to_png_memory(self):
        """Test that NetCDF→PNG conversion doesn't exceed expected memory.
        
        FullDisk CMI files are the largest (~50-200MB NetCDF).
        After streaming fix, we open from disk, so memory should only
        spike for the numpy array (~50MB for 5424x5424 float32).
        """
        from app.services.goes_fetcher import (
            _get_s3_client,
            _netcdf_to_png_from_file,
            _retry_s3_operation,
            list_available,
        )

        # Find one recent FullDisk frame
        end = datetime.now(UTC)
        start = end - timedelta(hours=2)
        available = list_available("GOES-19", "FullDisk", "C02", start, end)
        if not available:
            pytest.skip("No GOES-19 FullDisk frames available in last 2 hours")

        item = available[0]
        s3 = _get_s3_client()

        gc.collect()
        rss_before = get_current_rss_mb()

        # Stream download to temp file (simulates new fetch_frames behavior)
        with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
            tmp_path = Path(tmp.name)
            response = _retry_s3_operation(
                s3.get_object, Bucket="noaa-goes19", Key=item["key"], operation="get"
            )
            for chunk in response["Body"].iter_chunks(chunk_size=1024 * 1024):
                tmp.write(chunk)

        rss_after_download = get_current_rss_mb()
        download_delta = rss_after_download - rss_before
        nc_size_mb = tmp_path.stat().st_size / (1024 * 1024)

        print(f"\n  NetCDF file size: {nc_size_mb:.1f} MB")
        print(f"  RSS before download: {rss_before:.1f} MB")
        print(f"  RSS after download (streamed to disk): {rss_after_download:.1f} MB")
        print(f"  Download memory delta: {download_delta:.1f} MB")

        # Convert to PNG
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as out:
            out_path = Path(out.name)

        _netcdf_to_png_from_file(tmp_path, out_path)

        rss_after_convert = get_current_rss_mb()
        convert_delta = rss_after_convert - rss_after_download
        total_delta = rss_after_convert - rss_before

        print(f"  RSS after PNG conversion: {rss_after_convert:.1f} MB")
        print(f"  Conversion memory delta: {convert_delta:.1f} MB")
        print(f"  Total memory delta: {total_delta:.1f} MB")

        # Cleanup
        tmp_path.unlink(missing_ok=True)
        out_path.unlink(missing_ok=True)

        # Assert: streaming download should use <50MB (just chunk buffer)
        assert download_delta < 50, (
            f"Streaming download used {download_delta:.0f}MB — should be <50MB"
        )

        # Assert: total operation should use <600MB
        # FullDisk = 5424x5424 float32 = ~112MB numpy array + processing overhead
        assert total_delta < 600, (
            f"Total operation used {total_delta:.0f}MB — should be <600MB for safe 2G worker"
        )

    def test_conus_memory(self):
        """CONUS frames are smaller — should use much less memory."""
        from app.services.goes_fetcher import (
            _get_s3_client,
            _netcdf_to_png_from_file,
            _retry_s3_operation,
            list_available,
        )

        end = datetime.now(UTC)
        start = end - timedelta(hours=1)
        available = list_available("GOES-19", "CONUS", "C02", start, end)
        if not available:
            pytest.skip("No GOES-19 CONUS frames available")

        item = available[0]
        s3 = _get_s3_client()

        gc.collect()
        rss_before = get_current_rss_mb()

        with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
            tmp_path = Path(tmp.name)
            response = _retry_s3_operation(
                s3.get_object, Bucket="noaa-goes19", Key=item["key"], operation="get"
            )
            for chunk in response["Body"].iter_chunks(chunk_size=1024 * 1024):
                tmp.write(chunk)

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as out:
            out_path = Path(out.name)

        _netcdf_to_png_from_file(tmp_path, out_path)

        rss_after = get_current_rss_mb()
        total_delta = rss_after - rss_before
        nc_size_mb = tmp_path.stat().st_size / (1024 * 1024)

        print(f"\n  CONUS NetCDF size: {nc_size_mb:.1f} MB")
        print(f"  Total memory delta: {total_delta:.1f} MB")

        tmp_path.unlink(missing_ok=True)
        out_path.unlink(missing_ok=True)

        # CONUS is ~3000x5000 — much smaller than FullDisk
        assert total_delta < 300, (
            f"CONUS processing used {total_delta:.0f}MB — should be <300MB"
        )

    def test_sequential_frames_no_leak(self):
        """Process multiple frames sequentially and verify no memory leak."""
        from app.services.goes_fetcher import (
            _get_s3_client,
            _netcdf_to_png_from_file,
            _retry_s3_operation,
            list_available,
        )

        end = datetime.now(UTC)
        start = end - timedelta(hours=2)
        available = list_available("GOES-19", "CONUS", "C02", start, end)
        if len(available) < 3:
            pytest.skip("Need at least 3 CONUS frames for leak test")

        s3 = _get_s3_client()
        gc.collect()
        rss_baseline = get_current_rss_mb()
        deltas = []

        for i, item in enumerate(available[:5]):  # Test up to 5 frames
            with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
                tmp_path = Path(tmp.name)
                response = _retry_s3_operation(
                    s3.get_object, Bucket="noaa-goes19", Key=item["key"], operation="get"
                )
                for chunk in response["Body"].iter_chunks(chunk_size=1024 * 1024):
                    tmp.write(chunk)

            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as out:
                out_path = Path(out.name)

            _netcdf_to_png_from_file(tmp_path, out_path)

            gc.collect()
            rss_now = get_current_rss_mb()
            delta = rss_now - rss_baseline
            deltas.append(delta)
            print(f"\n  Frame {i+1}: RSS delta = {delta:.1f} MB")

            tmp_path.unlink(missing_ok=True)
            out_path.unlink(missing_ok=True)

        # Memory should stabilize — last frame shouldn't use dramatically more
        # than second frame (first frame has import/init overhead)
        if len(deltas) >= 3:
            growth = deltas[-1] - deltas[1]
            print(f"\n  Memory growth (frame 2 → last): {growth:.1f} MB")
            assert growth < 100, (
                f"Memory grew {growth:.0f}MB over {len(deltas)-1} frames — possible leak"
            )


@pytest.mark.integration
class TestAPIMemory:
    """Validate API server memory stays within limits."""

    def test_api_import_baseline(self):
        """Measure memory cost of importing the full API app."""
        gc.collect()
        rss_before = get_current_rss_mb()

        # Import the full FastAPI app (simulates startup)
        from app.main import app  # noqa: F401

        gc.collect()
        rss_after = get_current_rss_mb()
        delta = rss_after - rss_before

        print(f"\n  API app import memory: {delta:.1f} MB")
        print(f"  Total RSS after import: {rss_after:.1f} MB")

        # FastAPI + SQLAlchemy + all routers — allow up to 600MB (CI runners
        # have higher baseline due to shared process with pytest + all test deps)
        assert rss_after < 600, (
            f"API app uses {rss_after:.0f}MB at startup — should be <600MB for 1G limit"
        )
