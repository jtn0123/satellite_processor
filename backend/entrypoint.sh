#!/bin/sh
set -e

# Run database migrations
alembic upgrade head

# If a command is provided (e.g. celery worker), run it directly.
# Otherwise, start the default uvicorn server.
if [ $# -gt 0 ]; then
    exec "$@"
else
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi
