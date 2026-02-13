# Changelog

## [1.2.0] - 2026-02-13

### Added
- Dependabot configuration for pip, npm, and GitHub Actions (weekly schedule)
- `docker-compose.test.yml` for local integration testing
- Automated health check verification in Docker CI/CD workflow
- Resource limits (memory/CPU) on all Docker Compose services
- Makefile targets: `lint`, `build`, `deploy`, `logs`, `test-integration`
- Backend API improvements and error handling enhancements
- Frontend UI/UX improvements

### Changed
- Bumped VERSION to 1.2.0
- Docker Compose: all services now have resource limits and restart policies
- Makefile restructured with comprehensive targets
- Improved CI/CD pipeline with post-build health verification

## [Unreleased]

### Fixed
- Frontend params (`crop`, `false_color`, `timestamp`, `scale`, `video`) rejected by backend validation
- Pagination response mismatch between backend and frontend
- Single job delete now actually deletes (was only soft-cancelling)
- PIL Image resource leak in thumbnail generation
- WebSocket `json.loads` crash on malformed messages
- Settings form fields now match backend `SettingsUpdate` schema
- Staging directory cleanup after job processing

### Added
- API key support in frontend via `VITE_API_KEY` env var
- Health check for API container in docker-compose
- Non-root user in backend Dockerfile
- Redis healthcheck in dev docker-compose
- Health endpoints documented in README
- Pydantic model for bulk delete requests
- Alembic migration TODO note
- CONTRIBUTING.md and CHANGELOG.md

### Removed
- Committed `.env` file (now gitignored only)
- `BATCH-PLAN.md` internal planning doc
- `requirements-api.txt` (vestigial)
- Desktop GUI section from README (app.py no longer exists)
- `|| true` from CI lint step

### Changed
- Docker API service now has PYTHONPATH=/app (matching worker)
- Log rotation config added to docker-compose
