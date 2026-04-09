"""Tests for JTN-399: Celery queue separation.

Assertions here are pure configuration checks against ``celery_app.conf``
so they run without a live broker and slot into the existing fakeredis
based test harness.
"""

from app.celery_app import (
    CELERY_QUEUE_CLEANUP,
    CELERY_QUEUE_DEFAULT,
    CELERY_QUEUE_FETCH,
    CELERY_QUEUE_PROCESS,
    CELERY_TASK_ROUTES,
    celery_app,
)

# ── Queue declarations ────────────────────────────────────────────


def test_four_queues_declared():
    names = {q.name for q in celery_app.conf.task_queues}
    assert names == {
        CELERY_QUEUE_DEFAULT,
        CELERY_QUEUE_FETCH,
        CELERY_QUEUE_PROCESS,
        CELERY_QUEUE_CLEANUP,
    }


def test_default_queue_is_default():
    assert celery_app.conf.task_default_queue == CELERY_QUEUE_DEFAULT


# ── Route mapping ─────────────────────────────────────────────────


FETCH_TASKS = {
    "fetch_goes_data",
    "backfill_gaps",
    "fetch_himawari_data",
    "fetch_himawari_true_color",
    "fetch_composite_data",
}

PROCESS_TASKS = {
    "process_images",
    "create_video",
    "generate_composite",
    "generate_animation",
}

CLEANUP_TASKS = {"run_cleanup"}
DEFAULT_TASKS = {"check_schedules"}


def test_fetch_tasks_routed_to_fetch_queue():
    routes = celery_app.conf.task_routes
    for name in FETCH_TASKS:
        assert name in routes, f"{name} must appear in task_routes"
        assert routes[name]["queue"] == CELERY_QUEUE_FETCH, f"{name} should go to fetch queue"


def test_process_tasks_routed_to_process_queue():
    routes = celery_app.conf.task_routes
    for name in PROCESS_TASKS:
        assert name in routes
        assert routes[name]["queue"] == CELERY_QUEUE_PROCESS


def test_cleanup_tasks_routed_to_cleanup_queue():
    routes = celery_app.conf.task_routes
    for name in CLEANUP_TASKS:
        assert name in routes
        assert routes[name]["queue"] == CELERY_QUEUE_CLEANUP


def test_default_tasks_routed_to_default_queue():
    routes = celery_app.conf.task_routes
    for name in DEFAULT_TASKS:
        assert name in routes
        assert routes[name]["queue"] == CELERY_QUEUE_DEFAULT


def test_task_routes_module_constant_matches_conf():
    """The exported constant and the live Celery conf must agree."""
    assert celery_app.conf.task_routes == CELERY_TASK_ROUTES


# ── Beat schedule hints ───────────────────────────────────────────


def test_beat_cleanup_pins_to_cleanup_queue():
    """run_cleanup is beat-scheduled; it must dispatch to the cleanup queue
    even if task_routes matching is somehow bypassed."""
    beat = celery_app.conf.beat_schedule
    assert "run-cleanup" in beat
    assert beat["run-cleanup"]["options"]["queue"] == CELERY_QUEUE_CLEANUP


def test_beat_check_schedules_pins_to_default_queue():
    beat = celery_app.conf.beat_schedule
    assert "check-schedules" in beat
    assert beat["check-schedules"]["options"]["queue"] == CELERY_QUEUE_DEFAULT


# ── No task silently falls back to default ──────────────────────


def test_all_known_registered_tasks_are_routed():
    """Every custom task we ship should have an explicit route entry so
    nothing silently falls back to the default queue on accident."""
    expected = FETCH_TASKS | PROCESS_TASKS | CLEANUP_TASKS | DEFAULT_TASKS
    routed = set(CELERY_TASK_ROUTES.keys())
    assert expected <= routed, f"missing routes: {expected - routed}"
