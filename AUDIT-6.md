# Audit #6 — Satellite Processor

**Date:** 2026-02-11  
**Branch:** `fix/core-processor-overhaul` (PR #20)  
**Auditor:** Claude (fresh-eyes review)  
**Previous:** Audits #3–5 found ~113 issues; nearly all resolved across PRs #15–20

---

## Summary

The codebase has improved **dramatically** since audit #3. The backend is well-structured with proper async patterns, Pydantic validation, rate limiting, and security middleware. The frontend is clean React/TypeScript with good patterns. The core processor overhaul (pipeline abstraction, ffmpeg/interpolation/video_handler split) is a clear improvement in architecture. Docker, CI, and docs are solid.

The remaining issues are mostly code hygiene in the core processor (dead code, duplicated logic, some Windows-centric assumptions) and a few hardening items.

| Category | Grade | Findings |
|----------|-------|----------|
| **Backend API** | **A-** | Well-structured, secure, proper patterns |
| **Core Processor** | **B** | Good overhaul, but significant dead code remains |
| **Frontend** | **A-** | Clean React/TS, good UX patterns |
| **Docker & Infrastructure** | **A-** | Production-ready compose, healthchecks |
| **CI/CD** | **A** | Comprehensive test + build + push pipeline |
| **Tests** | **B+** | Good coverage, some gaps in core |
| **Documentation** | **A-** | Clear README, CONTRIBUTING, CHANGELOG |
| **Security** | **A-** | API key auth, path traversal checks, non-root Docker |
| **Configuration** | **B+** | Clean settings, minor schema drift |
| **Performance** | **B+** | Throttling, async, parallel — some inefficiencies |

**Overall: B+/A-** — This is a well-architected project. The remaining issues are polish, not structural.

---

## Detailed Findings

### Backend API (Grade: A-)

The FastAPI backend is clean: async SQLAlchemy, Pydantic models, proper error handling, rate limiting, structured logging, WebSocket for job progress, and health checks with dependency status. Very well done.

**#114 — `configure_processor` has misplaced docstring (Low)**  
In `backend/app/services/processor.py`, the docstring appears *after* the first statement:
```python
def configure_processor(processor, params):
    params = to_core_settings(params)  # ← this runs first
    """Configure processor settings..."""  # ← docstring after code = becomes a string literal, not a docstring
```
Move the docstring before the `params = ...` line or refactor.

**#115 — `StorageService.list_uploads()` is dead code (Low)**  
Has a self-documenting comment saying it's dead code. Should be removed.

**#116 — `StorageService.save_upload()` loads entire file into memory (Low)**  
The upload endpoint itself uses chunked streaming (good!), but `save_upload()` accepts `content: bytes` — it's effectively dead code since the router handles uploads directly. Consider removing or aligning.

**#117 — WebSocket endpoint creates a new Redis connection per client (Low)**  
`job_websocket` creates `aioredis.from_url()` per WebSocket connection. For low traffic this is fine; at scale, a shared connection pool would be better.

**#118 — `_resolve_image_ids` staging uses symlinks with copy fallback (Info)**  
Good approach. Just noting this works well on Linux but symlinks may fail on some Windows Docker setups. The copy fallback handles it correctly.

---

### Core Processor (Grade: B)

The pipeline abstraction and module split (ffmpeg.py, interpolation.py, video_handler.py) are excellent architectural improvements. However, significant dead/duplicated code remains in `processor.py`.

**#119 — `processor.py` has massive dead code: `_stage_*` methods (Medium)**  
`_stage_false_color`, `_stage_crop`, `_stage_timestamp`, `_stage_scale` — these are the old pre-pipeline stage methods. They're fully superseded by the `Pipeline` + `*Stage` classes in `pipeline.py`, but they're still in `processor.py` (~80 lines). Delete them.

**#120 — `processor.py` has two `run` methods with different signatures (Medium)**  
- `process()` — main pipeline-based workflow (the real one)
- `run(input_dir, output_dir)` — older sequential loop that doesn't use the pipeline
Both exist simultaneously. `run()` appears to be dead code. Remove it.

**#121 — `some_method()` and `some_other_method()` are placeholder stubs (Low)**  
`processor.py` contains:
```python
def some_other_method(self):
    """Example method where callbacks are invoked."""
    ...
def some_method(self):
    pass
```
These are development stubs. Remove them.

**#122 — `run_processing()` is a 3-line dead stub (Low)**  
```python
def run_processing(self):
    if is_closing(None):
        self.cancel()
        return
```
Does nothing useful. Remove.

**#123 — Duplicate `parse_satellite_timestamp` in three locations (Medium)**  
The same function exists in:
1. `satellite_processor/core/utils.py`
2. `satellite_processor/utils/helpers.py`
3. `satellite_processor/core/image_operations.py` (imports from `core/utils.py`)

`core/utils.py` and `utils/helpers.py` are identical implementations. `file_manager.py` imports from `utils/helpers.py`. Consolidate to one canonical location.

**#124 — `image_operations.py` has ~6 variants of "process an image" (Medium)**  
- `process_image()`
- `process_image_batch()`
- `_parallel_process_image()`
- `_process_image_subprocess()`
- `process_image_subprocess()`
- `process_single()`
- `process_images()` (instance method)

Many have overlapping logic with subtle differences. This was likely accumulated over time. Only a few are actually called. Audit which are used and remove the rest.

**#125 — `_init_worker` uses Windows-only `ABOVE_NORMAL_PRIORITY_CLASS` (Low)**  
```python
process.nice(psutil.ABOVE_NORMAL_PRIORITY_CLASS)
```
This crashes on Linux. It's in a try/except so it fails silently, but it should use `os.name` to pick the right priority.

**#126 — `Interpolator` class at bottom of `image_operations.py` is dead code (Low)**  
The `Interpolator` class and `interpolate_frames_with_options` method reference a non-existent model path and are never used. Remove.

**#127 — `ffmpeg.py` `find_ffmpeg()` searches Windows paths on Linux (Low)**  
Searches `C:/ffmpeg/bin/ffmpeg.exe`, `PROGRAMFILES`, etc. on all platforms. Should guard with `os.name == "nt"`.

**#128 — `ffmpeg.py` `VALID_IMAGE_EXTENSIONS` has redundant case variants (Low)**  
```python
VALID_IMAGE_EXTENSIONS = [".png", ".PNG", ".jpg", ".JPG", ".jpeg", ".JPEG"]
```
Use case-insensitive comparison instead: `ext.lower() in {".png", ".jpg", ".jpeg"}`.

**#129 — `video_handler.py` duplicates `HIGH_BITRATE`/`HIGH_MAXRATE`/`HIGH_BUFSIZE` constants (Low)**  
Same constants defined in both `ffmpeg.py` and `video_handler.py`. Import from `ffmpeg.py`.

**#130 — `video_handler.py` `__init__` duplicates `find_ffmpeg` fallback logic (Low)**  
After calling `find_ffmpeg()`, it manually checks the same Windows paths again. This is already done inside `find_ffmpeg()`.

**#131 — `interpolation.py` has three nearly identical functions (Medium)**  
- `apply_interpolation()` — with hardware accel, optional `try_encode_fn`
- `apply_frame_interpolation()` — CPU-only with detailed minterpolate params
- `interpolate_frames()` — CPU-only, slightly different minterpolate params

These should be consolidated into one function with parameters.

**#132 — `video_handler.py` `_create_initial_video` hardcodes `h264_nvenc` (Low)**  
Always uses NVIDIA encoder regardless of hardware setting. Should respect the configured encoder.

**#133 — `processor.py` `__del__` anti-pattern (Low)**  
```python
def __del__(self):
    try:
        if not hasattr(self, "_is_deleted"):
            self.cleanup()
```
`__del__` is unreliable in Python. The explicit `cleanup()` method is the right approach; consider removing `__del__` and relying on context managers or explicit cleanup.

---

### Frontend (Grade: A-)

Clean React 18 + TypeScript + TailwindCSS. Good use of React Query, lazy loading, WebSocket with exponential backoff and terminal state detection. Nice step-wizard for processing.

**#134 — No TypeScript interfaces for API response shapes (Low)**  
API responses are typed as `Record<string, unknown>` in several places. Define proper interfaces for `Job`, `Image`, `Settings` etc.

**#135 — `ProcessingForm` sends `false_color.method` values not in backend's `SettingsUpdate` Literal (Low)**  
Frontend offers "water_vapor", "dust", "airmass" but backend `SettingsUpdate.default_false_color` only accepts `Literal["vegetation", "fire", "natural", "urban", "water"]`. The ProcessingForm params go through the job params validator (different path), but there's a conceptual mismatch.

**#136 — Missing `nginx.conf` referenced in frontend Dockerfile (Medium)**  
```dockerfile
COPY nginx.conf /etc/nginx/conf.d/default.conf
```
No `nginx.conf` file exists in the frontend directory. Build will fail.

**#137 — `dist/` directory committed to git (Low)**  
`frontend/dist/` contains built assets. Should be in `.gitignore`.

---

### Docker & Infrastructure (Grade: A-)

Production compose is well-structured with healthchecks, volume management, non-root user, and proper service dependencies.

**#138 — `x-logging` anchor defined but never used (Low)**  
```yaml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```
Defined in `docker-compose.yml` but no service references `*default-logging`. Either apply it or remove.

**#139 — Dev compose doesn't include `db` service (Info)**  
Dev compose uses SQLite, which is fine for development. Just noting the difference from prod.

**#140 — No `Makefile` present despite README references (Low)**  
README documents `make dev`, `make prod`, `make test`, `make clean` but no `Makefile` exists.

---

### CI/CD (Grade: A)

Excellent. PR workflow runs backend tests, frontend build/lint/test, E2E with Playwright, and ruff linting. Docker workflow builds and pushes on release. Pre-commit hooks configured.

**#141 — CI doesn't run core processor tests with coverage report upload (Low)**  
Backend tests upload coverage XML; core processor tests run coverage but don't upload. Minor inconsistency.

---

### Tests (Grade: B+)

~2,460 lines of tests across backend and core. Good async test setup with in-memory SQLite. Backend endpoint tests cover CRUD, edge cases, error handling.

**#142 — No tests for `pipeline.py` stages directly (Medium)**  
The new `Pipeline`, `CropStage`, `FalseColorStage`, `TimestampStage` classes have no dedicated unit tests. They're indirectly tested through `test_processor.py` but direct tests would improve confidence.

**#143 — No tests for `settings_schema.py` (Low)**  
`to_core_settings` and `from_core_settings` are untested. Simple functions that should have unit tests.

**#144 — No tests for WebSocket endpoint (Low)**  
The `job_websocket` endpoint has no test coverage. Testing WebSockets is harder but important.

**#145 — No tests for `interpolation.py` functions (Medium)**  
Three interpolation functions with no test coverage.

---

### Documentation (Grade: A-)

README is clear with architecture diagram, API reference, quick start, and dev setup. CONTRIBUTING.md and CHANGELOG.md are present and useful.

**#146 — MODERNIZATION_PLAN.md may be stale (Low)**  
Check if this planning doc is still relevant after the overhaul. If completed, archive or remove.

---

### Security (Grade: A-)

API key auth (optional), path traversal validation on file operations, non-root Docker user, input validation via Pydantic, rate limiting. Good security posture.

**#147 — `_process_single_image_static` uses `shell=True` with string concatenation (Medium)**  
```python
cmd_str = " ".join(cmd)
subprocess.run(cmd_str, shell=True, check=True)
```
In `processor.py`, the static processing method builds a command string with user-influenced paths and runs it with `shell=True`. This is a command injection vector. Use `subprocess.run(cmd, shell=False)` with a list.

**#148 — `StorageService.delete_file` doesn't validate path is within storage (Low)**  
`delete_file()` accepts any path and deletes it. The callers validate paths, but the service itself should enforce boundaries.

**#149 — Redis connection in Celery tasks is unencrypted (Info)**  
`redis://` without TLS. Fine for docker-compose internal networking, but note for production with external Redis.

---

### Configuration (Grade: B+)

Settings flow is clean: env vars → pydantic-settings → derived paths. Core settings manager with JSON persistence. Schema bridge between API and core.

**#150 — Dual settings systems (core `SettingsManager` + backend `app_settings.json`) (Medium)**  
The core `SettingsManager` writes to `~/.satellite_processor/settings.json`. The backend settings router writes to `{storage_path}/app_settings.json`. These are two independent settings stores with overlapping concerns. The `settings_schema.py` bridge only handles `video_quality`. Consider unifying.

**#151 — `backend/data/app_settings.json` and `data/app_settings.json` both exist (Low)**  
Two settings files at different paths. One appears to be a copy. Clarify which is canonical.

---

### Performance (Grade: B+)

Good patterns: parallel image processing with multiprocessing, pipeline throttling via ResourceMonitor, chunked uploads, async database operations, background Celery workers.

**#152 — `ResourceMonitor` polls every 1 second by default (Low)**  
The processor also has its own 1-second resource timer (`_setup_resource_monitoring`). That's two polling loops doing essentially the same thing. Consolidate.

**#153 — `validate_image` in pipeline reads every image with OpenCV just to validate (Low)**  
```python
img = cv2.imread(str(path))
```
This loads the entire image into memory just to check if it's valid. For large satellite images (100MB+), consider checking only headers (e.g., with PIL's `Image.open()` which is lazy).

**#154 — `_create_ffmpeg_video` deletes input frame files in `finally` block (Medium)**  
```python
for frame_path in frame_paths:
    frame_path.unlink(missing_ok=True)
```
This destructively removes the input frames after video creation. If frames are shared or the caller expects them to persist, this is a data loss bug. Should only clean up if the frames were temporary copies.

---

## What's Good (Acknowledgments)

These deserve recognition — the codebase has improved enormously:

- ✅ **Pipeline abstraction** — Clean stage-based architecture replacing monolithic processing
- ✅ **Module split** — ffmpeg.py, interpolation.py, video_handler.py are properly separated
- ✅ **Backend architecture** — FastAPI + async SQLAlchemy + Celery is a solid stack
- ✅ **WebSocket with exponential backoff** — Frontend handles reconnection properly
- ✅ **Security** — API key auth, path validation, non-root Docker, rate limiting
- ✅ **Health checks** — Detailed endpoint checking DB, Redis, disk, storage writability
- ✅ **Pydantic validation** — Job params whitelist, path traversal checks
- ✅ **CI/CD** — Full pipeline with tests, linting, E2E, Docker build+push
- ✅ **Pre-commit hooks** — ruff, prettier, eslint, trailing whitespace
- ✅ **Structured logging** — JSON in prod, human-readable in dev
- ✅ **Chunked uploads** — Prevents OOM on large satellite images
- ✅ **Image-to-job resolution** — `image_ids` → file paths via DB with staging

---

## Priority Summary

| Priority | Count | Key Items |
|----------|-------|-----------|
| **Medium** | 8 | Dead code in processor (#119-122), duplicate parse_satellite_timestamp (#123), duplicate image processing functions (#124), missing nginx.conf (#136), shell=True injection (#147) |
| **Low** | 27 | Code cleanup, constant dedup, test gaps, minor inconsistencies |
| **Info** | 3 | Design notes, not bugs |

**Top 5 recommended actions:**
1. **Remove dead code from `processor.py`** (#119–122) — ~150 lines of unused methods
2. **Fix `shell=True` command injection** (#147) — security issue
3. **Add missing `nginx.conf`** (#136) — frontend Docker build is broken without it
4. **Consolidate duplicate functions** (#123, #124, #131) — reduces maintenance burden
5. **Add tests for new pipeline/interpolation modules** (#142, #145) — protect the overhaul

---

*Findings #114–#154 (41 findings). Next audit should start at #155.*
