"""Real tests for pipeline.py — uses real objects, mocks only multiprocessing pool."""

import multiprocessing.pool
from pathlib import Path
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest

from satellite_processor.core.pipeline import (
    CropStage,
    FalseColorStage,
    Pipeline,
    ScaleStage,
    TimestampStage,
    validate_image,
)
from satellite_processor.core.resource_monitor import ResourceMonitor


@pytest.fixture
def real_image_file(tmp_path):
    """Create a real readable image."""
    img = np.zeros((64, 64, 3), dtype=np.uint8)
    path = tmp_path / "test.png"
    cv2.imwrite(str(path), img)
    return path


@pytest.fixture
def mock_pool():
    pool = MagicMock(spec=multiprocessing.pool.Pool)
    return pool


class TestValidateImage:
    def test_valid_png(self, real_image_file):
        assert validate_image(real_image_file) is True

    def test_valid_jpg(self, tmp_path):
        img = np.zeros((32, 32, 3), dtype=np.uint8)
        path = tmp_path / "test.jpg"
        cv2.imwrite(str(path), img)
        assert validate_image(path) is True

    def test_unsupported_extension(self, tmp_path):
        path = tmp_path / "test.bmp"
        path.write_bytes(b"\x00")
        assert validate_image(path) is False

    def test_unreadable_file(self, tmp_path):
        path = tmp_path / "bad.png"
        path.write_text("not an image")
        assert validate_image(path) is False

    def test_nonexistent(self, tmp_path):
        assert validate_image(tmp_path / "nope.png") is False


class TestScaleStage:
    def test_passthrough(self, mock_pool, tmp_path):
        stage = ScaleStage()
        paths = [tmp_path / "a.png"]
        assert stage.run(paths, mock_pool) == paths
        assert stage.name == "Scaling"


class TestCropStage:
    def test_disabled(self, mock_pool, tmp_path):
        stage = CropStage(
            options={"crop_enabled": False},
            dirs={"crop": tmp_path},
            worker_fn=MagicMock(),
            order_fn=lambda x: x,
        )
        paths = [tmp_path / "a.png"]
        assert stage.run(paths, mock_pool) == paths

    def test_enabled(self, mock_pool, tmp_path):
        worker = MagicMock()
        paths = [tmp_path / "a.png", tmp_path / "b.png"]
        mock_pool.imap_unordered.return_value = iter([str(tmp_path / "a_crop.png"), str(tmp_path / "b_crop.png")])

        stage = CropStage(
            options={"crop_enabled": True},
            dirs={"crop": tmp_path},
            worker_fn=worker,
            order_fn=lambda x: x,
        )
        progress = []
        result = stage.run(paths, mock_pool, lambda op, p: progress.append(p))
        assert len(result) == 2
        assert len(progress) == 2

    def test_no_results_returns_original(self, mock_pool, tmp_path):
        mock_pool.imap_unordered.return_value = iter([None, None])
        stage = CropStage(
            options={"crop_enabled": True},
            dirs={"crop": tmp_path},
            worker_fn=MagicMock(),
            order_fn=lambda x: x,
        )
        paths = [tmp_path / "a.png"]
        result = stage.run(paths, mock_pool)
        assert result == paths


class TestFalseColorStage:
    def test_disabled(self, mock_pool, tmp_path):
        stage = FalseColorStage(
            options={"false_color_enabled": False},
            dirs={"sanchez": tmp_path},
            worker_fn=MagicMock(),
            order_fn=lambda x: x,
        )
        paths = [tmp_path / "a.png"]
        assert stage.run(paths, mock_pool) == paths


class TestTimestampStage:
    def test_disabled(self, mock_pool, tmp_path):
        stage = TimestampStage(
            options={"add_timestamp": False},
            dirs={"timestamp": tmp_path},
            worker_fn=MagicMock(),
            order_fn=lambda x: x,
        )
        paths = [tmp_path / "a.png"]
        assert stage.run(paths, mock_pool) == paths

    def test_enabled_default(self, mock_pool, tmp_path):
        mock_pool.imap_unordered.return_value = iter([str(tmp_path / "ts.png")])
        stage = TimestampStage(
            options={},  # add_timestamp defaults to True
            dirs={"timestamp": tmp_path},
            worker_fn=MagicMock(),
            order_fn=lambda x: x,
        )
        result = stage.run([tmp_path / "a.png"], mock_pool)
        assert len(result) == 1


class TestPipeline:
    def test_empty_pipeline(self, mock_pool):
        p = Pipeline()
        result = p.run([Path("a.png")], mock_pool)
        assert result == [Path("a.png")]

    def test_add_stage_chaining(self):
        p = Pipeline()
        result = p.add_stage(ScaleStage())
        assert result is p

    def test_stages_property(self):
        p = Pipeline()
        p.add_stage(ScaleStage())
        assert len(p.stages) == 1

    def test_cancel(self, mock_pool):
        p = Pipeline()
        p.add_stage(ScaleStage())
        p.cancel()
        result = p.run([Path("a.png")], mock_pool)
        assert result == []

    def test_empty_paths_short_circuit(self, mock_pool):
        p = Pipeline()
        stage = MagicMock()
        stage.run.return_value = []
        p.add_stage(stage)
        p.add_stage(ScaleStage())
        result = p.run([Path("a.png")], mock_pool)
        assert result == []

    def test_with_resource_monitor(self, mock_pool):
        rm = ResourceMonitor()
        p = Pipeline(resource_monitor=rm)
        p.add_stage(ScaleStage())
        result = p.run([Path("a.png")], mock_pool)
        assert result == [Path("a.png")]
        rm.cleanup()

    def test_throttle(self, mock_pool):
        rm = MagicMock()
        rm.should_throttle.return_value = True
        p = Pipeline(resource_monitor=rm)
        p.add_stage(ScaleStage())
        with patch("time.sleep"):
            result = p.run([Path("a.png")], mock_pool)
        assert result == [Path("a.png")]

    def test_multi_stage(self, mock_pool):
        p = Pipeline()
        p.add_stage(ScaleStage())
        p.add_stage(ScaleStage())
        result = p.run([Path("a.png")], mock_pool)
        assert result == [Path("a.png")]
