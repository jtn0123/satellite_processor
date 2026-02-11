"""Tests for pipeline.py — Pipeline stages (#142)."""

import multiprocessing
from pathlib import Path
from unittest.mock import MagicMock

from satellite_processor.core.pipeline import (
    CropStage,
    FalseColorStage,
    Pipeline,
    ScaleStage,
    Stage,
    TimestampStage,
    validate_image,
)


class TestStageConstruction:
    """Verify every stage can be constructed and has a run method."""

    def test_scale_stage(self):
        stage = ScaleStage()
        assert hasattr(stage, "run")
        assert stage.name == "Scaling"

    def test_crop_stage(self):
        stage = CropStage({}, {}, lambda x: x, lambda x: x)
        assert hasattr(stage, "run")
        assert stage.name == "Cropping"

    def test_false_color_stage(self):
        stage = FalseColorStage({}, {}, lambda x: x, lambda x: x)
        assert hasattr(stage, "run")
        assert stage.name == "False Color"

    def test_timestamp_stage(self):
        stage = TimestampStage({}, {}, lambda x: x, lambda x: x)
        assert hasattr(stage, "run")
        assert stage.name == "Adding Timestamps"


class TestScaleStagePassthrough:
    """ScaleStage should pass through files unchanged."""

    def test_passthrough(self):
        stage = ScaleStage()
        paths = [Path("/a.png"), Path("/b.png")]
        pool = MagicMock()
        assert stage.run(paths, pool) == paths


class TestPipeline:
    """Test Pipeline orchestration."""

    def test_empty_pipeline(self):
        pipeline = Pipeline()
        paths = [Path("/a.png")]
        pool = MagicMock()
        assert pipeline.run(paths, pool) == paths

    def test_cancel(self):
        pipeline = Pipeline()
        pipeline.add_stage(ScaleStage())
        pipeline.cancel()
        pool = MagicMock()
        assert pipeline.run([Path("/a.png")], pool) == []

    def test_stages_property(self):
        pipeline = Pipeline()
        s = ScaleStage()
        pipeline.add_stage(s)
        assert pipeline.stages == [s]

    def test_chaining(self):
        pipeline = Pipeline()
        result = pipeline.add_stage(ScaleStage()).add_stage(ScaleStage())
        assert result is pipeline
        assert len(pipeline.stages) == 2


class TestCropStageSkip:
    """CropStage should skip when crop_enabled is False."""

    def test_skip_when_disabled(self):
        stage = CropStage({"crop_enabled": False}, {}, lambda x: x, lambda x: x)
        paths = [Path("/a.png")]
        pool = MagicMock()
        assert stage.run(paths, pool) == paths


class TestValidateImage:
    """Test validate_image with unsupported extensions."""

    def test_unsupported_extension(self, tmp_path):
        bad = tmp_path / "file.bmp"
        bad.write_bytes(b"data")
        assert validate_image(bad) is False

    def test_valid_png(self, tmp_path):
        # Create a minimal valid PNG
        import struct
        import zlib

        def _minimal_png():
            sig = b"\x89PNG\r\n\x1a\n"
            # IHDR
            ihdr_data = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
            ihdr_crc = zlib.crc32(b"IHDR" + ihdr_data) & 0xFFFFFFFF
            ihdr = struct.pack(">I", 13) + b"IHDR" + ihdr_data + struct.pack(">I", ihdr_crc)
            # IDAT
            raw = zlib.compress(b"\x00\x00\x00\x00")
            idat_crc = zlib.crc32(b"IDAT" + raw) & 0xFFFFFFFF
            idat = struct.pack(">I", len(raw)) + b"IDAT" + raw + struct.pack(">I", idat_crc)
            # IEND
            iend_crc = zlib.crc32(b"IEND") & 0xFFFFFFFF
            iend = struct.pack(">I", 0) + b"IEND" + struct.pack(">I", iend_crc)
            return sig + ihdr + idat + iend

        good = tmp_path / "file.png"
        good.write_bytes(_minimal_png())
        assert validate_image(good) is True
