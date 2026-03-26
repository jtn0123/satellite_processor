"""Celery tasks for GOES data — backward-compatible re-export module.

This module has been split into:
- fetch_task.py — GOES data fetch and backfill tasks
- composite_task.py — composite generation and multi-band fetch tasks

All symbols are re-exported here for backward compatibility.
"""

__all__ = [
    "fetch_goes_data",
    "backfill_gaps",
    "generate_composite",
    "fetch_composite_data",
    "_build_status_message",
    "_create_backfill_image_records",
    "_create_fetch_records",
    "_detect_gaps",
    "_execute_goes_fetch",
    "_fill_single_gap",
    "_handle_fetch_failure",
    "_make_job_logger",
    "_make_progress_callback",
    "_no_frames_message",
    "_read_max_frames_setting",
    "_compose_rgb",
    "_load_band_images",
    "_mark_composite_failed",
    "_normalize_band",
    "_publish_progress",
    "_update_job_db",
]

# Re-export all public and private symbols used by tests and other modules
from .composite_task import (  # noqa: F401
    _compose_rgb,
    _load_band_images,
    _mark_composite_failed,
    _normalize_band,
    fetch_composite_data,
    generate_composite,
)
from .fetch_task import (  # noqa: F401
    _build_status_message,
    _create_backfill_image_records,
    _create_fetch_records,
    _detect_gaps,
    _execute_goes_fetch,
    _fill_single_gap,
    _handle_fetch_failure,
    _make_job_logger,
    _make_progress_callback,
    _no_frames_message,
    _read_max_frames_setting,
    backfill_gaps,
    fetch_goes_data,
)

# Re-export helpers that tests import via goes_tasks
from .helpers import _publish_progress, _update_job_db  # noqa: F401
