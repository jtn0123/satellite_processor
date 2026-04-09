# Architecture Decision Records

This directory captures the significant architectural decisions that have
shaped this project. ADRs are short, immutable Markdown documents that record
**why** a decision was made so future contributors (including Future Us) do
not have to reverse-engineer the rationale from commit history.

## Format

Each ADR follows the classic
[Michael Nygard template](https://github.com/joelparkerhenderson/architecture-decision-record/blob/main/locales/en/templates/decision-record-template-by-michael-nygard/index.md):

- **Status** — Proposed / Accepted / Superseded / Deprecated
- **Context** — What forces are at play? What problem is being solved?
- **Decision** — What did we actually choose?
- **Consequences** — What are the trade-offs, both good and bad?

Numbering is zero-padded (`0001`, `0002`, ...) and IDs are never reused. When
a decision is revisited, write a new ADR and mark the old one as `Superseded
by ADR-NNNN` rather than editing the historical record.

## Index

| ID | Title | Status |
|----|-------|--------|
| [0001](./0001-sync-db-in-celery-workers.md) | Sync SQLAlchemy in Celery workers, async in FastAPI | Accepted |
| [0002](./0002-optional-api-key-auth.md) | Optional API key auth (disabled in dev, required in prod) | Accepted |
| [0003](./0003-api-goes-to-satellite-rewrite.md) | `/api/goes/` to `/api/satellite/` rewrite middleware | Accepted |
| [0004](./0004-single-celery-default-queue.md) | Single Celery `default` queue (today) | Accepted |
| [0005](./0005-in-memory-sqlite-fakeredis-tests.md) | In-memory SQLite + fakeredis test strategy | Accepted |

## Adding a new ADR

1. Pick the next free number (e.g. `0006`).
2. Copy an existing ADR as a starting point or use the template above.
3. Open a PR. ADRs are reviewed like any other change — the discussion *is*
   the value, and the merged file is the artifact.
4. Add a row to the index table in this README.

## Related documents

- [`docs/runbooks/`](../runbooks/) — operational runbooks (deployment,
  branch protection, incident response).
- [`docs/deployment.md`](../deployment.md) — production architecture
  overview (Cloudflare Tunnel, Docker Compose, Alembic).
- [`CLAUDE.md`](../../CLAUDE.md) — contributor quickstart and code-style rules.
