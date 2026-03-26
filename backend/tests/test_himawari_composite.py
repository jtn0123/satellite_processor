"""Tests for Himawari True Color composite (PR 5).

Covers:
- True Color composite task (3 bands → RGB PNG)
- TrueColor dispatch from fetch-composite endpoint
- Composite recipe registration
- Scheduling dispatch for Himawari presets (TrueColor + single-band)
- Percentile normalization per channel
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def himawari_tc_params():
    return {
        "satellite": "Himawari-9",
        "sector": "FLDK",
        "start_time": "2026-03-03T00:00:00+00:00",
        "end_time": "2026-03-03T01:00:00+00:00",
    }


# ---------------------------------------------------------------------------
# Composite recipe registration
# ---------------------------------------------------------------------------


class TestCompositeRecipeRegistration:
    def test_himawari_true_color_recipe_exists(self):
        from app.routers._goes_shared import COMPOSITE_RECIPES

        assert "himawari_true_color" in COMPOSITE_RECIPES

    def test_himawari_true_color_recipe_bands(self):
        from app.routers._goes_shared import COMPOSITE_RECIPES

        recipe = COMPOSITE_RECIPES["himawari_true_color"]
        assert recipe["bands"] == ["B03", "B02", "B01"]

    def test_himawari_true_color_recipe_name(self):
        from app.routers._goes_shared import COMPOSITE_RECIPES

        recipe = COMPOSITE_RECIPES["himawari_true_color"]
        assert recipe["name"] == "Himawari True Color"

    def test_all_original_recipes_still_exist(self):
        from app.routers._goes_shared import COMPOSITE_RECIPES

        expected = ["true_color", "natural_color", "fire_detection", "dust_ash", "day_cloud_phase", "airmass"]
        for name in expected:
            assert name in COMPOSITE_RECIPES, f"Missing original recipe: {name}"


# ---------------------------------------------------------------------------
# _normalize_channel_percentile
# ---------------------------------------------------------------------------


class TestNormalizeChannelPercentile:
    def test_normal_data(self):
        from app.tasks.himawari_fetch_task import _normalize_channel_percentile

        data = np.random.uniform(0, 100, (100, 100)).astype(np.float32)
        result = _normalize_channel_percentile(data)
        assert result.dtype == np.uint8
        assert result.shape == (100, 100)
        assert result.min() >= 0
        assert result.max() <= 255

    def test_all_nan_returns_zeros(self):
        from app.tasks.himawari_fetch_task import _normalize_channel_percentile

        data = np.full((50, 50), np.nan, dtype=np.float32)
        result = _normalize_channel_percentile(data)
        assert result.dtype == np.uint8
        assert np.all(result == 0)

    def test_constant_data(self):
        from app.tasks.himawari_fetch_task import _normalize_channel_percentile

        data = np.full((50, 50), 42.0, dtype=np.float32)
        result = _normalize_channel_percentile(data)
        assert result.dtype == np.uint8
        # All same value — should stretch to some valid value
        assert result.shape == (50, 50)

    def test_nan_pixels_become_zero(self):
        from app.tasks.himawari_fetch_task import _normalize_channel_percentile

        data = np.array([[1.0, np.nan], [3.0, 4.0]], dtype=np.float32)
        result = _normalize_channel_percentile(data)
        assert result[0, 1] == 0  # NaN → 0


# ---------------------------------------------------------------------------
# _composite_true_color
# ---------------------------------------------------------------------------


class TestCompositeTrueColor:
    def test_creates_rgb_png(self, tmp_path):
        from app.tasks.himawari_fetch_task import _composite_true_color

        bands = [
            np.random.uniform(0, 100, (100, 200)).astype(np.float32),
            np.random.uniform(0, 100, (100, 200)).astype(np.float32),
            np.random.uniform(0, 100, (100, 200)).astype(np.float32),
        ]
        output = tmp_path / "tc.png"
        result = _composite_true_color(bands, output)

        assert result == output
        assert output.exists()
        assert output.stat().st_size > 0

        # Verify it's a valid RGB image
        from PIL import Image as PILImage

        img = PILImage.open(output)
        assert img.mode == "RGB"
        assert img.size == (200, 100)

    def test_handles_different_resolutions(self, tmp_path):
        """Bands with different resolutions should be resized to the largest."""
        from app.tasks.himawari_fetch_task import _composite_true_color

        bands = [
            np.random.uniform(0, 100, (200, 400)).astype(np.float32),  # larger
            np.random.uniform(0, 100, (100, 200)).astype(np.float32),  # smaller
            np.random.uniform(0, 100, (100, 200)).astype(np.float32),  # smaller
        ]
        output = tmp_path / "tc_resize.png"
        _composite_true_color(bands, output)

        from PIL import Image as PILImage

        img = PILImage.open(output)
        assert img.size == (400, 200)  # Should match largest

    def test_creates_parent_directories(self, tmp_path):
        from app.tasks.himawari_fetch_task import _composite_true_color

        bands = [np.random.uniform(0, 100, (50, 50)).astype(np.float32) for _ in range(3)]
        output = tmp_path / "nested" / "dir" / "tc.png"
        _composite_true_color(bands, output)
        assert output.exists()

    def test_with_nan_pixels(self, tmp_path):
        """NaN pixels should not crash the composite."""
        from app.tasks.himawari_fetch_task import _composite_true_color

        bands = []
        for _ in range(3):
            arr = np.random.uniform(0, 100, (100, 100)).astype(np.float32)
            arr[0:10, 0:10] = np.nan  # Some NaN pixels
            bands.append(arr)

        output = tmp_path / "tc_nan.png"
        _composite_true_color(bands, output)
        assert output.exists()


# ---------------------------------------------------------------------------
# _fetch_and_assemble_band
# ---------------------------------------------------------------------------


class TestFetchAndAssembleBand:
    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    def test_returns_none_on_no_segments(self, mock_list, mock_download):
        from app.tasks.himawari_fetch_task import _fetch_and_assemble_band

        mock_list.return_value = []
        result = _fetch_and_assemble_band("bucket", "FLDK", "B03", datetime(2026, 3, 3, tzinfo=UTC))
        assert result is None

    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    def test_returns_none_on_all_empty(self, mock_list, mock_download):
        from app.tasks.himawari_fetch_task import _fetch_and_assemble_band

        mock_list.return_value = [f"seg_{i}" for i in range(10)]
        mock_download.return_value = [b""] * 10  # All empty
        result = _fetch_and_assemble_band("bucket", "FLDK", "B03", datetime(2026, 3, 3, tzinfo=UTC))
        assert result is None


# ---------------------------------------------------------------------------
# _execute_himawari_true_color
# ---------------------------------------------------------------------------


class TestExecuteHimawariTrueColor:
    @patch("app.tasks.himawari_fetch_task._create_himawari_fetch_records")
    @patch("app.tasks.himawari_fetch_task._composite_true_color")
    @patch("app.tasks.himawari_fetch_task._fetch_and_assemble_band")
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_full_true_color_success(
        self,
        mock_progress,
        mock_update,
        mock_timestamps,
        mock_fetch_band,
        mock_composite,
        mock_records,
        himawari_tc_params,
        tmp_path,
    ):
        """Happy path: fetches 3 bands, composites, creates records."""
        from app.tasks.himawari_fetch_task import _execute_himawari_true_color

        mock_timestamps.return_value = [
            {"scan_time": "2026-03-03T00:00:00+00:00", "key": "k1", "size": 1000},
        ]
        # Return valid arrays for all 3 bands
        mock_fetch_band.return_value = np.random.uniform(0, 100, (100, 100)).astype(np.float32)
        mock_composite.return_value = Path("/tmp/test.png")

        _log = MagicMock()

        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            with patch("app.tasks.himawari_fetch_task._read_max_frames_setting", return_value=200):
                _execute_himawari_true_color("job-1", himawari_tc_params, _log)

        # Should fetch 3 bands (B03, B02, B01)
        assert mock_fetch_band.call_count == 3
        mock_composite.assert_called_once()
        mock_records.assert_called_once()

        # Verify record has band="TrueColor"
        records_call = mock_records.call_args
        results = records_call[0][3]  # 4th positional arg
        assert results[0]["band"] == "TrueColor"

        final_update = mock_update.call_args_list[-1]
        assert final_update[1]["status"] == "completed"

    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_no_timestamps_fails(
        self,
        mock_progress,
        mock_update,
        mock_timestamps,
        himawari_tc_params,
        tmp_path,
    ):
        from app.tasks.himawari_fetch_task import _execute_himawari_true_color

        mock_timestamps.return_value = []
        _log = MagicMock()

        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            _execute_himawari_true_color("job-1", himawari_tc_params, _log)

        final_update = mock_update.call_args_list[-1]
        assert final_update[1]["status"] == "failed"

    @patch("app.tasks.himawari_fetch_task._create_himawari_fetch_records")
    @patch("app.tasks.himawari_fetch_task._composite_true_color")
    @patch("app.tasks.himawari_fetch_task._fetch_and_assemble_band")
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_missing_band_counts_as_failure(
        self,
        mock_progress,
        mock_update,
        mock_timestamps,
        mock_fetch_band,
        mock_composite,
        mock_records,
        himawari_tc_params,
        tmp_path,
    ):
        """If one of the 3 bands fails, that timestamp should be skipped."""
        from app.tasks.himawari_fetch_task import _execute_himawari_true_color

        mock_timestamps.return_value = [
            {"scan_time": "2026-03-03T00:00:00+00:00", "key": "k1", "size": 1000},
        ]
        # B03 succeeds, B02 fails (None), B01 succeeds
        mock_fetch_band.side_effect = [
            np.random.uniform(0, 100, (100, 100)).astype(np.float32),
            None,  # B02 failed
            np.random.uniform(0, 100, (100, 100)).astype(np.float32),
        ]

        _log = MagicMock()

        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            with patch("app.tasks.himawari_fetch_task._read_max_frames_setting", return_value=200):
                _execute_himawari_true_color("job-1", himawari_tc_params, _log)

        # Composite should NOT have been called (missing band)
        mock_composite.assert_not_called()
        mock_records.assert_not_called()

        final_update = mock_update.call_args_list[-1]
        assert final_update[1]["status"] == "failed"

    @patch("app.tasks.himawari_fetch_task._create_himawari_fetch_records")
    @patch("app.tasks.himawari_fetch_task._composite_true_color")
    @patch("app.tasks.himawari_fetch_task._fetch_and_assemble_band")
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_multiple_timestamps(
        self,
        mock_progress,
        mock_update,
        mock_timestamps,
        mock_fetch_band,
        mock_composite,
        mock_records,
        himawari_tc_params,
        tmp_path,
    ):
        """Should process multiple timestamps."""
        from app.tasks.himawari_fetch_task import _execute_himawari_true_color

        mock_timestamps.return_value = [
            {"scan_time": "2026-03-03T00:00:00+00:00", "key": "k1", "size": 1000},
            {"scan_time": "2026-03-03T00:10:00+00:00", "key": "k2", "size": 1000},
            {"scan_time": "2026-03-03T00:20:00+00:00", "key": "k3", "size": 1000},
        ]
        mock_fetch_band.return_value = np.random.uniform(0, 100, (100, 100)).astype(np.float32)
        mock_composite.return_value = Path("/tmp/test.png")

        _log = MagicMock()

        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            with patch("app.tasks.himawari_fetch_task._read_max_frames_setting", return_value=200):
                _execute_himawari_true_color("job-1", himawari_tc_params, _log)

        # 3 timestamps × 3 bands = 9 band fetches
        assert mock_fetch_band.call_count == 9
        assert mock_composite.call_count == 3

    @patch("app.tasks.himawari_fetch_task._create_himawari_fetch_records")
    @patch("app.tasks.himawari_fetch_task._composite_true_color")
    @patch("app.tasks.himawari_fetch_task._fetch_and_assemble_band")
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_respects_max_frames_limit(
        self,
        mock_progress,
        mock_update,
        mock_timestamps,
        mock_fetch_band,
        mock_composite,
        mock_records,
        himawari_tc_params,
        tmp_path,
    ):
        from app.tasks.himawari_fetch_task import _execute_himawari_true_color

        mock_timestamps.return_value = [
            {"scan_time": f"2026-03-03T00:{i * 10:02d}:00+00:00", "key": f"k{i}", "size": 1000} for i in range(5)
        ]
        mock_fetch_band.return_value = np.random.uniform(0, 100, (100, 100)).astype(np.float32)
        mock_composite.return_value = Path("/tmp/test.png")

        _log = MagicMock()

        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            with patch("app.tasks.himawari_fetch_task._read_max_frames_setting", return_value=2):
                _execute_himawari_true_color("job-1", himawari_tc_params, _log)

        # Only 2 timestamps × 3 bands = 6
        assert mock_fetch_band.call_count == 6
        assert mock_composite.call_count == 2

        final_update = mock_update.call_args_list[-1]
        assert final_update[1]["status"] == "completed_partial"


# ---------------------------------------------------------------------------
# Celery task (fetch_himawari_true_color)
# ---------------------------------------------------------------------------


class TestFetchHimawariTrueColorTask:
    @patch("app.tasks.himawari_fetch_task._execute_himawari_true_color")
    @patch("app.tasks.himawari_fetch_task._make_job_logger")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_task_calls_execute(self, mock_progress, mock_update, mock_logger, mock_execute, himawari_tc_params):
        from app.tasks.himawari_fetch_task import fetch_himawari_true_color

        mock_logger.return_value = MagicMock()
        fetch_himawari_true_color("job-1", himawari_tc_params)
        mock_execute.assert_called_once()

    @patch("app.tasks.himawari_fetch_task._execute_himawari_true_color", side_effect=ConnectionError("boom"))
    @patch("app.tasks.himawari_fetch_task._make_job_logger")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_task_handles_failure(self, mock_progress, mock_update, mock_logger, mock_execute, himawari_tc_params):
        from app.tasks.himawari_fetch_task import fetch_himawari_true_color

        mock_logger.return_value = MagicMock()
        with pytest.raises(ConnectionError):
            fetch_himawari_true_color("job-1", himawari_tc_params)

        failed_call = [c for c in mock_update.call_args_list if c[1].get("status") == "failed"]
        assert len(failed_call) == 1


# ---------------------------------------------------------------------------
# Fetch-composite endpoint dispatch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestFetchCompositeDispatch:
    @patch("app.tasks.himawari_fetch_task.fetch_himawari_true_color.delay")
    async def test_himawari_true_color_dispatches_to_himawari_task(self, mock_delay, client):
        """POST /fetch-composite with himawari_true_color recipe should dispatch to Himawari task."""
        resp = await client.post(
            "/api/satellite/fetch-composite",
            json={
                "satellite": "Himawari-9",
                "sector": "FLDK",
                "recipe": "himawari_true_color",
                "start_time": "2026-03-03T00:00:00",
                "end_time": "2026-03-03T01:00:00",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "Himawari True Color" in data["message"]
        mock_delay.assert_called_once()

    @patch("app.tasks.composite_task.fetch_composite_data.delay")
    async def test_goes_true_color_dispatches_to_goes_task(self, mock_delay, client):
        """GOES true_color recipe should still dispatch to the GOES composite task."""
        resp = await client.post(
            "/api/satellite/fetch-composite",
            json={
                "satellite": "GOES-18",
                "sector": "CONUS",
                "recipe": "true_color",
                "start_time": "2026-03-03T00:00:00",
                "end_time": "2026-03-03T01:00:00",
            },
        )
        assert resp.status_code == 200
        mock_delay.assert_called_once()

    async def test_himawari_true_color_recipe_accepted(self, client):
        """The himawari_true_color recipe should be accepted by the validator."""
        # We just need it to not be a 422 validation error
        with patch("app.tasks.himawari_fetch_task.fetch_himawari_true_color.delay"):
            resp = await client.post(
                "/api/satellite/fetch-composite",
                json={
                    "satellite": "Himawari-9",
                    "sector": "FLDK",
                    "recipe": "himawari_true_color",
                    "start_time": "2026-03-03T00:00:00",
                    "end_time": "2026-03-03T01:00:00",
                },
            )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Composite recipe endpoint includes Himawari
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestCompositeRecipeEndpoint:
    async def test_himawari_recipe_in_list(self, client):
        resp = await client.get("/api/satellite/composite-recipes")
        assert resp.status_code == 200
        recipes = resp.json()
        ids = [r["id"] for r in recipes]
        assert "himawari_true_color" in ids

    async def test_himawari_recipe_has_correct_bands(self, client):
        resp = await client.get("/api/satellite/composite-recipes")
        for recipe in resp.json():
            if recipe["id"] == "himawari_true_color":
                assert recipe["bands"] == ["B03", "B02", "B01"]
                break
        else:
            pytest.fail("himawari_true_color not found in recipes")


# ---------------------------------------------------------------------------
# Scheduling dispatch for Himawari
# ---------------------------------------------------------------------------


class TestSchedulingDispatch:
    def test_scheduling_dispatches_himawari_single_band(self):
        """_launch_schedule_job should use fetch_himawari_data for Himawari single-band presets."""
        from app.tasks.scheduling_tasks import _launch_schedule_job

        session = MagicMock()
        schedule = MagicMock()
        schedule.interval_minutes = 10

        preset = MagicMock()
        preset.satellite = "Himawari-9"
        preset.sector = "FLDK"
        preset.band = "B13"
        preset.id = "preset-1"
        preset.name = "Test"

        now = datetime(2026, 3, 3, 0, 0, tzinfo=UTC)

        with patch("app.tasks.himawari_fetch_task.fetch_himawari_data.delay") as mock_delay:
            _launch_schedule_job(session, schedule, preset, now)
            mock_delay.assert_called_once()

    def test_scheduling_dispatches_himawari_true_color(self):
        """_launch_schedule_job should use fetch_himawari_true_color for TrueColor presets."""
        from app.tasks.scheduling_tasks import _launch_schedule_job

        session = MagicMock()
        schedule = MagicMock()
        schedule.interval_minutes = 10

        preset = MagicMock()
        preset.satellite = "Himawari-9"
        preset.sector = "FLDK"
        preset.band = "TrueColor"
        preset.id = "preset-2"
        preset.name = "TrueColor Preset"

        now = datetime(2026, 3, 3, 0, 0, tzinfo=UTC)

        with patch("app.tasks.himawari_fetch_task.fetch_himawari_true_color.delay") as mock_delay:
            _launch_schedule_job(session, schedule, preset, now)
            mock_delay.assert_called_once()

    def test_scheduling_dispatches_goes_unchanged(self):
        """_launch_schedule_job should still use fetch_goes_data for GOES presets."""
        from app.tasks.scheduling_tasks import _launch_schedule_job

        session = MagicMock()
        schedule = MagicMock()
        schedule.interval_minutes = 10

        preset = MagicMock()
        preset.satellite = "GOES-18"
        preset.sector = "CONUS"
        preset.band = "C02"
        preset.id = "preset-3"
        preset.name = "GOES Preset"

        now = datetime(2026, 3, 3, 0, 0, tzinfo=UTC)

        with patch("app.tasks.fetch_task.fetch_goes_data.delay") as mock_delay:
            _launch_schedule_job(session, schedule, preset, now)
            mock_delay.assert_called_once()


# ---------------------------------------------------------------------------
# Scheduling endpoint dispatch for Himawari presets
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestSchedulingEndpointDispatch:
    async def test_create_himawari_preset(self, client):
        """Should be able to create a Himawari preset with TrueColor band."""
        resp = await client.post(
            "/api/satellite/fetch-presets",
            json={
                "name": "Himawari FLDK TrueColor",
                "satellite": "Himawari-9",
                "sector": "FLDK",
                "band": "TrueColor",
                "description": "Auto-fetch Himawari True Color",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["satellite"] == "Himawari-9"
        assert data["band"] == "TrueColor"

    async def test_create_himawari_single_band_preset(self, client):
        """Should be able to create a Himawari preset with a single band."""
        resp = await client.post(
            "/api/satellite/fetch-presets",
            json={
                "name": "Himawari FLDK B13",
                "satellite": "Himawari-9",
                "sector": "FLDK",
                "band": "B13",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["satellite"] == "Himawari-9"
        assert data["band"] == "B13"

    async def test_create_himawari_schedule(self, client):
        """Should be able to create a schedule with a Himawari preset."""
        # Create preset
        resp = await client.post(
            "/api/satellite/fetch-presets",
            json={
                "name": "Sched Preset",
                "satellite": "Himawari-9",
                "sector": "FLDK",
                "band": "TrueColor",
            },
        )
        preset_id = resp.json()["id"]

        # Create schedule
        resp = await client.post(
            "/api/satellite/schedules",
            json={
                "name": "Every 10 min",
                "preset_id": preset_id,
                "interval_minutes": 10,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["interval_minutes"] == 10

    async def test_run_himawari_true_color_preset(self, client, monkeypatch):
        """Running a Himawari TrueColor preset should dispatch to fetch_himawari_true_color."""
        called = {}

        class FakeTask:
            def delay(self, job_id, params):
                called["job_id"] = job_id
                called["params"] = params

        import app.tasks.himawari_fetch_task as h_mod

        monkeypatch.setattr(h_mod, "fetch_himawari_true_color", FakeTask())

        resp = await client.post(
            "/api/satellite/fetch-presets",
            json={
                "name": "Run TC",
                "satellite": "Himawari-9",
                "sector": "FLDK",
                "band": "TrueColor",
            },
        )
        pid = resp.json()["id"]
        resp = await client.post(f"/api/satellite/fetch-presets/{pid}/run")
        assert resp.status_code == 200
        assert "job_id" in called
        assert called["params"]["band"] == "TrueColor"

    async def test_run_himawari_single_band_preset(self, client, monkeypatch):
        """Running a Himawari single-band preset should dispatch to fetch_himawari_data."""
        called = {}

        class FakeTask:
            def delay(self, job_id, params):
                called["job_id"] = job_id
                called["params"] = params

        import app.tasks.himawari_fetch_task as h_mod

        monkeypatch.setattr(h_mod, "fetch_himawari_data", FakeTask())

        resp = await client.post(
            "/api/satellite/fetch-presets",
            json={
                "name": "Run B13",
                "satellite": "Himawari-9",
                "sector": "FLDK",
                "band": "B13",
            },
        )
        pid = resp.json()["id"]
        resp = await client.post(f"/api/satellite/fetch-presets/{pid}/run")
        assert resp.status_code == 200
        assert "job_id" in called
        assert called["params"]["band"] == "B13"


# ---------------------------------------------------------------------------
# TrueColor band validation (blocked from direct fetch)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestTrueColorBandValidation:
    async def test_truecolor_blocked_in_direct_fetch(self, client):
        """TrueColor should NOT be allowed in the direct /fetch endpoint."""
        resp = await client.post(
            "/api/satellite/fetch",
            json={
                "satellite": "Himawari-9",
                "sector": "FLDK",
                "band": "TrueColor",
                "start_time": "2026-03-03T00:00:00",
                "end_time": "2026-03-03T01:00:00",
            },
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        if isinstance(detail, list):
            assert any("composite" in str(e).lower() for e in detail)
        else:
            assert "composite" in str(detail).lower()


# ---------------------------------------------------------------------------
# Celery app registration
# ---------------------------------------------------------------------------


class TestCeleryRegistration:
    def test_himawari_fetch_task_in_includes(self):
        from app.celery_app import celery_app

        assert "app.tasks.himawari_fetch_task" in celery_app.conf.include

    def test_himawari_task_routes_exist(self):
        from app.celery_app import celery_app

        routes = celery_app.conf.task_routes
        assert "fetch_himawari_data" in routes
        assert "fetch_himawari_true_color" in routes
