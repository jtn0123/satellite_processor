FROM python:3.11-slim

WORKDIR /app

# Install system deps for OpenCV and FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libgl1 libglib2.0-0 curl && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy VERSION and CHANGELOG files
COPY VERSION /app/VERSION
COPY CHANGELOG.md /app/CHANGELOG.md

# Copy core processor module
COPY satellite_processor /app/satellite_processor

# Copy backend app
COPY backend/app /app/app

# Build metadata — placed AFTER code layers to avoid cache pollution
ARG BUILD_VERSION=0.0.0
ARG BUILD_COMMIT=dev
ARG BUILD_DATE=""
ARG BUILD_SHA=dev
ENV BUILD_VERSION=${BUILD_VERSION}
ENV BUILD_COMMIT=${BUILD_COMMIT}
ENV BUILD_DATE=${BUILD_DATE}
ENV BUILD_SHA=${BUILD_SHA}

# Copy Alembic migration files
COPY backend/alembic.ini /app/alembic.ini
COPY backend/alembic /app/alembic

# Copy entrypoint script
COPY backend/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

RUN mkdir -p /app/data/output /app/data/uploads /app/data/temp && \
    adduser --disabled-password --gecos '' appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
