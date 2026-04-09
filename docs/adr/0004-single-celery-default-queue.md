# ADR 0004: Single Celery `default` queue (today)

- **Status:** Accepted (with known follow-up in JTN-399)
- **Date:** 2026-04-09
- **Deciders:** Backend maintainers
- **Tags:** `backend`, `celery`, `scaling`

## Context

Celery supports routing tasks to named queues so that different worker
pools can specialise (e.g. I/O-bound fetches on one pool, CPU-bound image
processing on another). We have several task families with genuinely
different resource profiles:

- `fetch_goes_data`, `fetch_himawari_data`, `fetch_himawari_true_color` —
  network-bound, largely waiting on S3 / remote HTTP.
- `process_images`, `generate_composite`, `generate_animation` —
  CPU-bound, and `generate_animation` additionally shells out to FFmpeg.
- `check_schedules`, `run_cleanup` — cheap Celery Beat tasks.

Splitting them across queues would let us:

- Cap concurrency differently (e.g. 16 I/O workers, 2 CPU workers on a
  small host).
- Keep a slow FFmpeg job from head-of-line-blocking a fast schedule check.
- Isolate memory pressure (image pipelines hold entire frames in memory).

But splitting also costs: more compose services, more systemd units, more
dashboards, more ways for a queue to back up unnoticed, and more room for
"why isn't my task running?" when someone forgets to include a worker for
a specific queue.

## Decision

Today, every task is routed to a single **`default`** queue:

```python
# backend/app/celery_app.py
task_default_queue="default",
task_routes={
    "fetch_goes_data": {"queue": "default"},
    "process_images": {"queue": "default"},
    "generate_animation": {"queue": "default"},
    "generate_composite": {"queue": "default"},
    "check_schedules": {"queue": "default"},
    "run_cleanup": {"queue": "default"},
    "fetch_himawari_data": {"queue": "default"},
    "fetch_himawari_true_color": {"queue": "default"},
},
```

We deliberately keep the `task_routes` map explicit (rather than relying on
the default-queue fallback) so that:

1. A future split is a one-line change per task — no need to track down
   untouched tasks.
2. Reviewers see at a glance which queue a new task lands on.
3. `grep` finds every routed task from one spot.

Concurrency is tuned on a single worker pool via `WORKER_CONCURRENCY`.

## Consequences

### Positive

- One worker container in both dev and prod compose files. One set of
  resource limits, one Prometheus scrape target, one health check.
- No risk of deploying a new task type to the API without a corresponding
  worker that understands its queue — there is only one worker.
- Celery Beat-driven tasks and user-triggered tasks share fate: if the
  worker is down, everything is down. This is simpler than partial
  degradation modes that are hard to reason about.

### Negative

- A single slow FFmpeg render **does** block schedule checks and cleanup
  runs on the same worker. In practice we mitigate this by keeping
  FFmpeg invocations short (chunked animations) and by running with
  `WORKER_CONCURRENCY >= 4` so there is always a free slot.
- Memory pressure from a large composite can pause everything else.
- We cannot scale I/O and CPU independently without rearchitecting.

### Follow-up

[**JTN-399**](https://linear.app/jtn0123/issue/JTN-399) tracks splitting
into at least two queues (`io` and `cpu`) once any of the following
triggers:

- `generate_animation` tail latency starts affecting `check_schedules`.
- A second host joins the fleet (at which point queue-based routing
  becomes a useful placement tool).
- A new task family arrives with a clearly distinct resource profile
  (e.g. ML inference).

Until then, the cost of the split exceeds the benefit.
