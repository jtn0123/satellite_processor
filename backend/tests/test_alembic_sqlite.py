"""Regression test for migrations on SQLite (`make dev` target).

`make dev` uses ``sqlite+aiosqlite``, but production uses PostgreSQL.
Migrations that call ``op.drop_constraint`` / ``op.create_foreign_key``
without ``op.batch_alter_table`` blow up on SQLite (no support for ALTER
constraint), which silently breaks the dev stack while CI keeps passing.

This test runs ``alembic upgrade head`` against a fresh on-disk SQLite
database in a subprocess so it can't pollute the rest of the suite by
leaking imports of app modules with a test-only DATABASE_URL.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"


def test_alembic_upgrade_head_sqlite() -> None:
    """`alembic upgrade head` must succeed against a clean SQLite DB."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "alembic-sqlite-test.db"
        # Match what `make dev` actually uses. env.py strips +aiosqlite for
        # the alembic sync engine but keeps the async URL exported for the
        # app modules it imports along the way.
        db_url = f"sqlite+aiosqlite:///{db_path}"

        env = os.environ.copy()
        env["DATABASE_URL"] = db_url
        # Tests don't ship with a real API key — flip into debug mode so the
        # app's import-time guard in main.py doesn't reject the lifespan
        # check (alembic itself doesn't load lifespans, but importing
        # ``app.db.models`` pulls a chunk of the app and we want stable
        # defaults regardless).
        env.setdefault("DEBUG", "true")

        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND_DIR,
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
        )

        assert result.returncode == 0, (
            f"alembic upgrade head failed for SQLite\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )
        assert db_path.exists(), "alembic should have created the SQLite DB"
        assert db_path.stat().st_size > 0, "DB should have at least the schema"
