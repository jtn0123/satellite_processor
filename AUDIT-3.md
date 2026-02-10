# Satellite Processor — Audit Report #3

**Date:** 2026-02-10  
**Commit:** `bff2f66` (main)  
**Auditor:** Claude (automated)

---

## 1. Code Quality — Grade: B-

1. **Duplicate satellite metadata parsing** — `backend/app/routers/images.py` and `backend/app/services/storage.py` both contain identical logic for parsing satellite name and `captured_at` from filenames. Should be a shared utility.

2. **Duplicate processor configuration** — `backend/app/services/processor.py` (`_worker`) and `backend/app/tasks/processing.py` (`_configure_processor`) both configure `SatelliteImageProcessor` settings identically. DRY violation.

3. **Unused `ProcessorService`** — `backend/app/services/processor.py` defines `processor_service` singleton but it's never imported or used anywhere. The app uses Celery tasks exclusively. Dead code.

4. **Unused imports in Layout.tsx** — `frontend/src/components/Layout.tsx` imports `Satellite`, `FlaskConical`, `FileText` icons — `FlaskConical` is not used in Layout (it's used elsewhere).

5. **`datetime.utcnow()` deprecated** — Used in `backend/app/db/models.py`, `backend/app/routers/jobs.py`, `backend/app/tasks/processing.py`. Should use `datetime.now(timezone.utc)` (deprecated since Python 3.12).

6. **Root `requirements.txt` includes dev tools** — `black`, `pylint` are in the root requirements.txt alongside production deps. Should be split into `requirements-dev.txt`.

7. **Root `conftest.py` is empty/minimal** — `conftest.py` at repo root exists but purpose is unclear; may conflict with backend's conftest.

8. **`sys.path.insert` hacks** — `backend/app/services/processor.py` and `backend/app/tasks/processing.py` both do `sys.path.insert(0, ...)` to import core module. Should use proper package installation or PYTHONPATH.

9. **Inconsistent type annotations** — Core processor uses `typing.List`, `typing.Dict`, `typing.Optional` (old style), while backend uses modern `list`, `dict`, `X | None` syntax.

10. **`# --- Bug 7:` / `# --- Bug 2:` comments** — `backend/app/tasks/processing.py` has debug comments referencing bug numbers that should be cleaned up for production.

---

## 2. Error Handling — Grade: B

11. **Silent failure in thumbnail generation** — `backend/app/routers/images.py` `get_thumbnail()` catches all exceptions with bare `except Exception` and returns a generic 500. Should log the actual error.

12. **PIL Image not closed in upload** — `backend/app/routers/images.py` opens PIL Image with `PILImage.open(dest)` in a `with` block (good), but `get_thumbnail()` opens without `with` — `img = PILImage.open(fp)` then later `img.convert("RGB").save(...)` — the file handle may leak on error.

13. **No WebSocket error handling for malformed messages** — `backend/app/main.py` WebSocket `writer()` does `json.loads(msg["data"])` without try/except. Malformed Redis messages would crash the WebSocket connection.

14. **`_get_sync_db()` session leak risk** — `backend/app/tasks/processing.py` `_update_job_db()` creates a session and calls `session.close()` in finally, but doesn't handle the case where `_get_sync_db()` itself throws (engine creation failure).

15. **No timeout on Redis pub/sub** — `backend/app/main.py` WebSocket loop has `timeout=0.5` on `get_message` but no overall connection timeout. A stalled job would keep the WebSocket open indefinitely.

16. **Frontend `catch {}` blocks** — `frontend/src/components/Upload/UploadZone.tsx` and `useWebSocket.ts` have empty catch blocks that swallow errors silently.

---

## 3. Security — Grade: C+

17. **Hardcoded database password** — `docker-compose.yml` has `POSTGRES_PASSWORD: sat` in plaintext. Should use Docker secrets or env file.

18. **Debug mode defaults to `True`** — `backend/app/config.py` has `debug: bool = True`. Production deployments that forget to set `DEBUG=false` will have verbose logging, SQL echo, etc.

19. **CORS allows all methods/headers** — `backend/app/main.py` sets `allow_methods=["*"]` and `allow_headers=["*"]`. Should be restricted to actual methods used.

20. **Settings endpoint accepts arbitrary dict** — `backend/app/routers/settings.py` `update_settings()` takes `body: dict` with no validation. Any key/value can be written to the settings JSON file.

21. **No authentication** — No auth middleware anywhere. All endpoints (including delete, settings modification, job creation) are publicly accessible. Critical for production.

22. **Path traversal partial mitigation** — `backend/app/models/job.py` validates `input_path` but allows `/data` and `/tmp` prefixes. The `image_paths` key is explicitly excluded from traversal checks. An attacker could craft `image_paths` with traversal payloads.

23. **File serving without path validation** — `backend/app/routers/images.py` `get_full_image()` serves whatever `image.file_path` points to from the DB. If DB is compromised, arbitrary files could be served.

24. **No rate limiting on delete endpoints** — Upload has `10/minute` and job creation has `5/minute`, but delete endpoints have no rate limiting.

25. **`SettingsManager` writes to home directory** — `satellite_processor/core/settings_manager.py` reads/writes `~/.satellite_processor/settings.json`. In a container, this is `/root/` — the Celery worker could be influenced by files mounted or pre-existing in the container.

---

## 4. Performance — Grade: B

26. **`list_images` loads all images** — `backend/app/routers/images.py` `list_images()` has no pagination. With thousands of images, this returns everything.

27. **`list_jobs` loads all jobs** — `backend/app/routers/jobs.py` `list_jobs()` also has no pagination. Will degrade with many jobs.

28. **`psutil.cpu_percent(interval=0.1)` blocks** — `backend/app/routers/system.py` calls `psutil.cpu_percent(interval=0.1)` which is a blocking 100ms sleep in an async endpoint. Should use `run_in_executor`.

29. **Double `psutil.virtual_memory()` call** — `backend/app/routers/system.py` calls `psutil.virtual_memory()` twice (for `.total`/`.available` and `.percent`). Should call once and reuse.

30. **`_update_job_db` called per progress tick** — `backend/app/tasks/processing.py` writes to DB on every progress callback. For a 1000-image batch, that's 1000+ DB writes. Should batch/throttle.

31. **Thumbnail generated on every request if cache miss** — No background pre-generation; first request for a large TIFF thumbnail will be slow.

32. **`multiprocessing.Pool` created per stage** — `satellite_processor/core/processor.py` creates a new Pool for each processing stage (up to 4 pools per job). Pool creation overhead is significant.

---

## 5. Testing — Grade: B-

33. **No test for WebSocket endpoint** — `backend/app/main.py` WebSocket handler has zero test coverage.

34. **No test for Celery tasks** — `backend/app/tasks/processing.py` is untested. The actual processing pipeline integration is not covered.

35. **Frontend lint failures ignored** — `.github/workflows/test.yml` runs `npm run lint || true` — lint failures are silently swallowed in CI.

36. **Coverage threshold is 35%** — `pyproject.toml` `fail_under = 35` is very low for production code.

37. **No integration test for Docker compose** — No smoke test that the full stack actually starts and serves requests.

38. **E2E tests run against built static files only** — No backend is started for E2E tests, so API interactions are untested in E2E.

39. **`test_health.py` is minimal (25 lines)** — Only tests the basic health endpoint; the detailed health check with DB/Redis/disk checks is untested.

---

## 6. Frontend — Grade: B+

40. **No loading/error state for Settings page save** — `frontend/src/pages/Settings.tsx` shows a spinner while saving but no success/error toast notification.

41. **No confirmation on delete** — Image and job deletions happen on click with no confirmation dialog. Easy accidental data loss.

42. **Preview modal not keyboard-accessible** — `frontend/src/components/ImageGallery/ImageGallery.tsx` modal has no Escape key handler and no focus trap. No ARIA attributes (`role="dialog"`, `aria-modal`).

43. **No `alt` text for thumbnails when image fails** — Image `onError` hides the element but doesn't show meaningful fallback text.

44. **Upload progress tracking bug** — `frontend/src/components/Upload/UploadZone.tsx` uses `idxRef.current++` for tracking upload index but this can desync with the `uploads` array if uploads are cleared.

45. **No mobile hamburger menu** — Mobile nav shows only icons without labels, which is not discoverable for new users.

46. **Missing `<title>` / meta tags** — No page-level title changes on navigation. All pages show the same browser tab title.

47. **VideoPlayer has no error state** — `frontend/src/components/VideoPlayer/VideoPlayer.tsx` doesn't handle video load failures.

---

## 7. Backend API — Grade: B

48. **No pagination on list endpoints** — `/api/images` and `/api/jobs` return unbounded results. Need `?page=&limit=` or cursor-based pagination.

49. **Inconsistent response formats** — `list_images` returns manually constructed dicts, `list_jobs` returns ORM objects via `response_model`. Should be consistent.

50. **No PATCH endpoint for jobs** — `JobUpdate` schema exists in `models/job.py` but is never used — no endpoint to update a job.

51. **No image count or pagination metadata** — List endpoints don't return total count, making pagination impossible for the frontend.

52. **Job output endpoint guesses file type** — `get_job_output()` tries extensions in a hardcoded order. Should store the output file path/type on the job record.

53. **No bulk delete endpoint** — Frontend shows individual delete but no way to batch-delete images or jobs.

54. **Settings endpoint returns no validation errors** — `PUT /api/settings` accepts any dict and merges blindly. Invalid keys are silently stored.

55. **Missing `/api/health` from README** — Health endpoints added but not documented in README's API table.

---

## 8. Docker/DevOps — Grade: B+

56. **No health check on API container** — `docker-compose.yml` has health checks for DB and Redis but not for the API or worker containers. Should use `/api/health`.

57. **No non-root user in backend Dockerfile** — `backend/Dockerfile` runs as root. Should add `USER` directive for security.

58. **No `.dockerignore`** — Missing `.dockerignore` files means the entire repo (including `.git`, `node_modules`, test files) is sent as build context.

59. **Dev compose doesn't have DB service** — `docker-compose.dev.yml` uses SQLite but doesn't include a DB service, which is fine, but there's no health check on Redis either.

60. **Worker and API share same Dockerfile** — Works but means the worker image includes uvicorn and web-serving deps it doesn't need. Could use multi-stage or separate Dockerfiles.

61. **No resource limits** — No `mem_limit`, `cpus`, or `deploy` resource constraints on any service.

62. **No log rotation configuration** — Docker services use default logging with no rotation, which can fill disk.

---

## 9. Documentation — Grade: B

63. **README references `app.py` desktop GUI** — "The original PyQt6 desktop application is still available" but `app.py` doesn't exist at repo root. Outdated reference.

64. **Health endpoints not documented** — `/api/health` and `/api/health/detailed` are missing from the API table.

65. **No API schema/OpenAPI docs mention** — README doesn't mention that FastAPI auto-generates `/docs` and `/redoc` (though nginx proxies them).

66. **No CONTRIBUTING.md** — No contribution guidelines, code style guide, or PR process documented.

67. **No CHANGELOG** — No changelog tracking releases or versions.

68. **`MODERNIZATION_PLAN.md` exists but may be stale** — Should be reviewed for accuracy against current state.

69. **Frontend README is boilerplate** — `frontend/README.md` is likely Vite default, not project-specific.

---

## 10. Configuration — Grade: B-

70. **No env var validation at startup** — `backend/app/config.py` uses pydantic-settings but critical vars like `DATABASE_URL` have SQLite defaults. A production deploy with no env vars silently uses SQLite.

71. **Two `requirements.txt` files at root** — Both `requirements.txt` and `requirements-api.txt` exist at repo root alongside `backend/requirements.txt`. Unclear which to use for what.

72. **Root `pyproject.toml` configured for core tests only** — `testpaths = ["satellite_processor/core/tests"]` — running `pytest` from root won't find backend tests.

73. **`ruff.toml` ignores E501** — Line length violations are ignored, which is fine, but `line-length = 120` in ruff.toml while `pyproject.toml` has `[tool.black] line-length = 88`. Inconsistent formatter configs.

74. **No production env file template** — `.env.example` exists for dev but no production template with PostgreSQL config, `DEBUG=false`, etc.

75. **`CORS_ORIGINS` default is dev-only** — Config defaults to `localhost:3000` and `localhost:5173`. Production needs explicit override or it silently fails for real domains.

76. **`pre-commit-config.yaml` exists but not documented** — No mention in README of running `pre-commit install`.

---

## Summary

| Category | Grade | Key Issues |
|----------|-------|------------|
| Code Quality | B- | Dead code, duplication, deprecated APIs |
| Error Handling | B | Silent failures, missing WebSocket error handling |
| Security | C+ | No auth, hardcoded secrets, unrestricted settings |
| Performance | B | No pagination, blocking async calls, excessive DB writes |
| Testing | B- | No WebSocket/Celery tests, low coverage threshold |
| Frontend | B+ | No confirmations on delete, accessibility gaps |
| Backend API | B | No pagination, inconsistent responses |
| Docker/DevOps | B+ | No health checks on API, runs as root |
| Documentation | B | Outdated references, missing endpoints |
| Configuration | B- | Conflicting configs, no prod env template |

**Overall: B-**

### Top 5 Priority Fixes for Production:
1. **Add authentication** (#21) — Most critical security gap
2. **Add pagination** (#26, #27, #48) — Will break at scale
3. **Fix hardcoded DB password** (#17) — Use Docker secrets
4. **Set `debug: bool = False` default** (#18) — Fail-safe for prod
5. **Add API container health check** (#56) — Needed for orchestration
