#!/bin/sh
set -e

# Ensure data directories exist and are writable
mkdir -p /app/data/output /app/data/uploads /app/data/temp 2>/dev/null || true

# Run database migrations with retry (handles race condition when
# multiple containers run alembic upgrade head simultaneously)
MAX_RETRIES=3
for i in $(seq 1 $MAX_RETRIES); do
    if alembic upgrade head; then
        break
    else
        if [ "$i" -eq "$MAX_RETRIES" ]; then
            echo "Alembic migration failed after $MAX_RETRIES attempts"
            exit 1
        fi
        echo "Migration attempt $i failed, retrying in 3s..."
        sleep 3
    fi
done

# If a command is provided (e.g. celery worker), run it directly.
# Otherwise, start the default uvicorn server.
if [ $# -gt 0 ]; then
    exec "$@"
else
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi
