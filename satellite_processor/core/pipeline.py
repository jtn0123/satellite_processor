"""
Processing Pipeline Abstraction (#13)
------------------------------------
Composable pipeline with pluggable stages for satellite image processing.
Each stage transforms a list of image paths and returns the (possibly new) list.
"""

from __future__ import annotations

import logging
import multiprocessing.pool
import time
from abc import ABC, abstractmethod
from collections.abc import Callable
from pathlib import Path
from typing import Any

from PIL import Image  # type: ignore

from .resource_monitor import ResourceMonitor

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[str, int], None]


class Stage(ABC):
    """Base class for a processing pipeline stage."""

    name: str = "stage"

    @abstractmethod
    def run(
        self,
        image_paths: list[Path],
        pool: multiprocessing.pool.Pool,
        progress_callback: ProgressCallback | None = None,
    ) -> list[Path]:
        """Execute the stage, returning the (possibly modified) list of paths."""
        ...


class CropStage(Stage):
    """Stage 2: Crop images in parallel."""

    name = "Cropping"

    def __init__(self, options: dict[str, Any], dirs: dict[str, Path], worker_fn: Any, order_fn: Any) -> None:
        self.options = options
        self.dirs = dirs
        self.worker_fn = worker_fn
        self.order_fn = order_fn

    def run(
        self,
        image_paths: list[Path],
        pool: multiprocessing.pool.Pool,
        progress_callback: ProgressCallback | None = None,
    ) -> list[Path]:
        if not self.options.get("crop_enabled"):
            return image_paths

        args = [(str(f), self.dirs["crop"], self.options) for f in image_paths]
        results: list[Path] = []
        total = len(image_paths)

        for idx, result in enumerate(pool.imap_unordered(self.worker_fn, args)):
            if result:
                results.append(Path(result))
            if progress_callback:
                progress_callback(self.name, int((idx + 1) / total * 100))

        return self.order_fn(results) if results else image_paths


class FalseColorStage(Stage):
    """Stage 1: Apply false color processing."""

    name = "False Color"

    def __init__(self, options: dict[str, Any], dirs: dict[str, Path], worker_fn: Any, order_fn: Any) -> None:
        self.options = options
        self.dirs = dirs
        self.worker_fn = worker_fn
        self.order_fn = order_fn

    def run(
        self,
        image_paths: list[Path],
        pool: multiprocessing.pool.Pool,
        progress_callback: ProgressCallback | None = None,
    ) -> list[Path]:
        if not self.options.get("false_color_enabled"):
            return image_paths

        args = [
            (
                str(f),
                self.dirs["sanchez"],
                self.options.get("sanchez_path"),
                self.options.get("underlay_path"),
            )
            for f in image_paths
        ]
        results: list[Path] = []
        total = len(image_paths)

        for idx, result in enumerate(pool.imap_unordered(self.worker_fn, args)):
            if result:
                results.append(Path(result))
            if progress_callback:
                progress_callback(self.name, int((idx + 1) / total * 100))

        return self.order_fn(results) if results else image_paths


class TimestampStage(Stage):
    """Stage 3: Add timestamps."""

    name = "Adding Timestamps"

    def __init__(self, options: dict[str, Any], dirs: dict[str, Path], worker_fn: Any, order_fn: Any) -> None:
        self.options = options
        self.dirs = dirs
        self.worker_fn = worker_fn
        self.order_fn = order_fn

    def run(
        self,
        image_paths: list[Path],
        pool: multiprocessing.pool.Pool,
        progress_callback: ProgressCallback | None = None,
    ) -> list[Path]:
        if not self.options.get("add_timestamp", True):
            return image_paths

        args = [(str(f), self.dirs["timestamp"]) for f in image_paths]
        results: list[Path] = []
        total = len(image_paths)

        for idx, result in enumerate(pool.imap_unordered(self.worker_fn, args)):
            if result:
                results.append(Path(result))
            if progress_callback:
                progress_callback(self.name, int((idx + 1) / total * 100))

        return self.order_fn(results) if results else image_paths


class ScaleStage(Stage):
    """Stage: Scale images (placeholder for future scaling)."""

    name = "Scaling"

    def run(
        self,
        image_paths: list[Path],
        pool: multiprocessing.pool.Pool,
        progress_callback: ProgressCallback | None = None,
    ) -> list[Path]:
        return image_paths


class Pipeline:
    """Composable processing pipeline that runs stages in order."""

    def __init__(self, resource_monitor: ResourceMonitor | None = None) -> None:
        self._stages: list[Stage] = []
        self._resource_monitor = resource_monitor
        self._cancelled = False

    def add_stage(self, stage: Stage) -> Pipeline:
        """Add a stage to the pipeline. Returns self for chaining."""
        self._stages.append(stage)
        return self

    def cancel(self) -> None:
        self._cancelled = True

    @property
    def stages(self) -> list[Stage]:
        return list(self._stages)

    def run(
        self,
        image_paths: list[Path],
        pool: multiprocessing.pool.Pool,
        progress_callback: ProgressCallback | None = None,
    ) -> list[Path]:
        """Run all stages sequentially, passing image_paths through each."""
        current = image_paths
        for stage in self._stages:
            if self._cancelled or not current:
                return []

            # Throttle if system is under pressure
            if self._resource_monitor and hasattr(self._resource_monitor, "should_throttle"):
                if self._resource_monitor.should_throttle():
                    logger.info("System under pressure — throttling pipeline")
                    time.sleep(0.5)

            logger.info(f"Running pipeline stage: {stage.name}")
            current = stage.run(current, pool, progress_callback)

        return current


def validate_image(path: Path) -> bool:
    """Validate that *path* is a supported, readable image file (#15).

    Returns True if the file has a supported extension and can be read by OpenCV.
    """
    supported_extensions = {".png", ".jpg", ".jpeg", ".tif", ".tiff"}
    if path.suffix.lower() not in supported_extensions:
        logger.warning(f"Unsupported image extension: {path}")
        return False
    try:
        # PIL Image.open is lazy — it reads the header without loading pixel data (#153)
        with Image.open(path) as img:
            img.verify()
    except Exception as e:
        logger.warning(f"Failed to read image {path}: {e}")
        return False
    return True
