# Contributing

1. Fork the repo and create a feature branch from `main`.
2. Install dev dependencies: `pip install -r requirements-dev.txt`
3. Install pre-commit hooks: `pre-commit install`
4. Run backend tests: `cd backend && pytest -v`
5. Run frontend tests: `cd frontend && npm test`
6. Open a PR against `main` with a clear description of your changes.

Please follow existing code style and include tests for new features.

## Commit Message Format

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must follow this format:

```
<type>(<scope>): <description>
```

**Types:**
- `feat:` — A new feature (triggers a minor release)
- `fix:` — A bug fix (triggers a patch release)
- `docs:` — Documentation only
- `chore:` — Maintenance tasks, CI, deps
- `refactor:` — Code changes that neither fix a bug nor add a feature
- `test:` — Adding or updating tests
- `build:` — Build system or dependency changes
- `ci:` — CI configuration changes

**Breaking changes:** Add `BREAKING CHANGE:` in the commit body or `!` after the type (e.g., `feat!:`) to trigger a major release.

Examples:
```
feat(api): add satellite TLE refresh endpoint
fix(frontend): correct orbit path rendering on mobile
chore(deps): bump vitest to v3
```
