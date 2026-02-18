"""Real tests for processor.py — uses real objects, mocks only external processes."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest

from satellite_processor.core.processor import (
    SatelliteImageProcessor,
    generate_output_filename,
    generate_processed_filename,
)


@pytest.fixture
def processor(tmp_path, monkeypatch):
    """Create a real processor with temp dirs."""
    monkeypatch.setenv("SETTINGS_DIR", str(tmp_path / "settings"))
    with patch("satellite_processor.core.video_handler.find_ffmpeg", return_value=Path("ffmpeg")), \
         patch.object(SatelliteImageProcessor, "_setup_resource_monitoring"), \
         patch("satellite_processor.core.processor.ResourceMonitor"):
        proc = SatelliteImageProcessor(options={})
        proc._resource_timer_running = False
        proc.input_dir = str(tmp_path / "input")
        proc.output_dir = str(tmp_path / "output")
        (tmp_path / "input").mkdir(parents=True, exist_ok=True)
        (tmp_path / "output").mkdir(parents=True, exist_ok=True)
        yield proc
        if proc.resource_monitor:
            proc.resource_monitor.stop()
        if not getattr(proc, "_is_deleted", False):
            proc.cleanup()


@pytest.fixture
def frame_dir(tmp_path):
    """Create real image frames."""
    d = tmp_path / "input"
    d.mkdir(exist_ok=True)
    img = np.zeros((64, 64, 3), dtype=np.uint8)
    for i in range(5):
        cv2.imwrite(str(d / f"frame{i:04d}.png"), img)
    return d


class TestGenerateFilenames:
    def test_output_filename(self):
        result = generate_output_filename("20230101_120000")
        assert result == "Animation_20230101_120000.mp4"

    def test_output_filename_custom(self):
        result = generate_output_filename("ts", prefix="Video", ext=".mkv")
        assert result == "Video_ts.mkv"

    def test_processed_filename(self):
        result = generate_processed_filename(Path("image.png"), "20230101")
        assert result == "processed_image_20230101.png"


class TestProcessorInit:
    def test_basic_init(self, processor):
        assert processor.cancelled is False
        assert processor._is_processing is False
        assert processor.file_manager is not None
        assert processor.video_handler is not None
        assert processor.settings_manager is not None

    def test_has_callbacks(self, processor):
        assert hasattr(processor, "on_status_update")
        assert hasattr(processor, "on_error")
        assert hasattr(processor, "on_progress")


class TestEmitCallbacks:
    def test_emit_status(self, processor):
        msgs = []
        processor.on_status_update = lambda m: msgs.append(m)
        processor._emit_status("hello")
        assert msgs == ["hello"]

    def test_emit_error(self, processor):
        errs = []
        processor.on_error = lambda m: errs.append(m)
        processor._emit_error("bad")
        assert errs == ["bad"]

    def test_emit_progress(self, processor):
        prog = []
        processor.on_progress = lambda op, p: prog.append((op, p))
        processor._emit_progress("test", 50)
        assert prog == [("test", 50)]

    def test_emit_finished(self, processor):
        called = []
        processor.on_finished = lambda: called.append(True)
        processor._emit_finished()
        assert called == [True]

    def test_emit_no_callback_no_error(self, processor):
        processor.on_status_update = None
        processor._emit_status("test")  # Should not raise


class TestProcessSingleImage:
    def test_basic(self, processor, frame_dir):
        frames = sorted(frame_dir.glob("*.png"))
        result = processor.process_single_image(frames[0])
        assert result is not None
        assert isinstance(result, np.ndarray)

    def test_with_crop(self, processor, frame_dir):
        processor.options = {"crop_enabled": True, "crop_x": 0, "crop_y": 0, "crop_width": 32, "crop_height": 32}
        frames = sorted(frame_dir.glob("*.png"))
        result = processor.process_single_image(frames[0])
        assert result is not None
        assert result.shape[0] == 32

    def test_nonexistent(self, processor):
        result = processor.process_single_image(Path("/nope.png"))
        assert result is None


class TestGetInputFiles:
    def test_finds_files(self, processor, frame_dir):
        processor.input_dir = str(frame_dir)
        files = processor.get_input_files(frame_dir)
        assert len(files) == 5

    def test_empty_dir(self, processor, tmp_path):
        files = processor.get_input_files(tmp_path)
        assert files == []


class TestUpdateDirectories:
    def test_from_options(self, processor, tmp_path):
        d = tmp_path / "newinput"
        d.mkdir()
        processor.options = {"input_dir": str(d)}
        processor.update_directories()
        assert processor.input_dir == str(d)


class TestSetDirectories:
    def test_set_input(self, processor, tmp_path):
        d = tmp_path / "inp"
        d.mkdir()
        processor.set_input_directory(d)
        assert str(d) in processor.input_dir

    def test_set_input_nonexistent(self, processor):
        processor.set_input_directory("/nonexistent/path")
        # Should not crash

    def test_set_input_empty(self, processor):
        processor.set_input_directory("")
        # Should not crash

    def test_set_output(self, processor, tmp_path):
        d = tmp_path / "out"
        processor.set_output_directory(d)
        assert d.exists()
        assert "out" in processor.output_dir


class TestUpdateProgress:
    def test_update(self, processor):
        progress = []
        processor.on_progress = lambda op, p: progress.append((op, p))
        processor.update_progress("test", 50)
        assert processor.current_operation == "test"
        assert progress == [("test", 50)]


class TestCancel:
    def test_cancel(self, processor):
        processor.cancel()
        assert processor.cancelled is True
        assert processor._is_processing is False


class TestCleanup:
    def test_cleanup(self, processor):
        processor.cleanup()
        assert processor._is_deleted is True

    def test_double_cleanup(self, processor):
        processor.cleanup()
        processor.cleanup()  # Should not raise


class TestProcessImages:
    def test_basic(self, processor, frame_dir):
        frames = sorted(frame_dir.glob("*.png"))
        results = processor.process_images(frames[:2])
        assert len(results) == 2

    def test_with_cancel(self, processor, frame_dir):
        processor.cancelled = True
        frames = sorted(frame_dir.glob("*.png"))
        results = processor.process_images(frames)
        assert len(results) == 0


class TestCreateProgressBar:
    def test_basic(self, processor):
        bar = processor._create_progress_bar("test", 5, 10)
        assert "50%" in bar
        assert "test" in bar

    def test_zero(self, processor):
        bar = processor._create_progress_bar("op", 0, 10)
        assert "0%" in bar

    def test_full(self, processor):
        bar = processor._create_progress_bar("op", 10, 10)
        assert "100%" in bar


class TestUpdateTimestamp:
    def test_updates(self, processor):
        old = processor.timestamp
        import time
        time.sleep(0.01)
        processor.update_timestamp()
        # May or may not differ in same second, just verify it runs


class TestResourceUsage:
    def test_update_resource_usage(self, processor):
        data = []
        processor.on_resource_update = lambda d: data.append(d)
        processor.update_resource_usage()
        assert len(data) == 1
        assert "cpu" in data[0]


class TestSomeOtherMethod:
    def test_runs(self, processor):
        msgs = []
        processor.on_status_update = lambda m: msgs.append(m)
        processor.on_progress = lambda *a: None
        processor.on_finished = lambda: None
        processor.some_other_method()
        assert len(msgs) >= 2


class TestRunProcessing:
    def test_with_none_window(self, processor):
        processor.run_processing()  # Should not raise


class TestParallelCrop:
    def test_crop_worker(self, frame_dir, tmp_path):
        output_dir = tmp_path / "cropped"
        output_dir.mkdir()
        frames = sorted(frame_dir.glob("*.png"))
        args = (str(frames[0]), str(output_dir), {"crop_x": 0, "crop_y": 0, "crop_width": 32, "crop_height": 32})
        result = SatelliteImageProcessor._parallel_crop(args)
        assert result is not None
        assert Path(result).exists()

    def test_crop_worker_bad_image(self, tmp_path):
        args = ("/nonexistent.png", str(tmp_path), {})
        result = SatelliteImageProcessor._parallel_crop(args)
        assert result is None


class TestParallelTimestamp:
    def test_timestamp_worker(self, frame_dir, tmp_path):
        output_dir = tmp_path / "ts"
        output_dir.mkdir()
        frames = sorted(frame_dir.glob("*.png"))
        args = (str(frames[0]), str(output_dir))
        result = SatelliteImageProcessor._parallel_timestamp(args)
        assert result is not None

    def test_timestamp_worker_bad_image(self, tmp_path):
        args = ("/nonexistent.png", str(tmp_path))
        result = SatelliteImageProcessor._parallel_timestamp(args)
        assert result is None


class TestValidatePreferences:
    def test_missing_temp(self, processor):
        processor.preferences = {}
        valid, msg = processor.validate_preferences()
        assert valid is False
        assert "temp_directory" in msg

    def test_valid(self, processor, tmp_path):
        processor.preferences = {"temp_directory": str(tmp_path)}
        valid, msg = processor.validate_preferences()
        assert valid is True
