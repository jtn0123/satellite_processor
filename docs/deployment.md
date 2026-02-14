# Deployment Guide

## Production Architecture

```
Internet → Cloudflare Tunnel → Docker Host
                                  ├─ Nginx (frontend)  :3001 → :80
                                  ├─ FastAPI (API)      :8001 → :8000
                                  ├─ Celery Worker
                                  ├─ PostgreSQL         :5432
                                  └─ Redis              :6379
```

## Docker Compose: Production vs Development

### Production (GHCR images)

```yaml
# docker-compose.yml — uses pre-built images from GitHub Container Registry
services:
  frontend:
    image: ghcr.io/<org>/satellite-processor-frontend:latest
    ports: ["3001:80"]
  api:
    image: ghcr.io/<org>/satellite-processor-api:latest
    ports: ["8001:8000"]
```

Push to the `release` branch to trigger the CI workflow that builds and pushes images to GHCR.

### Development (local build)

```yaml
# docker-compose.dev.yml — builds from source with hot-reload
services:
  frontend:
    build: ./frontend
    ports: ["3000:3000"]
  api:
    build: .
    ports: ["8000:8000"]
    volumes: ["./app:/app/app"]  # hot-reload
```

## Cloudflare Tunnel Setup

Cloudflare Tunnels provide TLS/HTTPS without opening ports or managing certificates.

### 1. Install cloudflared

```bash
# Debian/Ubuntu
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
```

### 2. Authenticate and create tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create satellite-processor
```

### 3. Configure the tunnel

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  # Frontend
  - hostname: sat.example.com
    service: http://localhost:3001
  # API
  - hostname: sat-api.example.com
    service: http://localhost:8001
  # Catch-all
  - service: http_status:404
```

### 4. Set DNS records

```bash
cloudflared tunnel route dns satellite-processor sat.example.com
cloudflared tunnel route dns satellite-processor sat-api.example.com
```

### 5. Run as a service

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

## Port Mappings

| Service | Container Port | Host Port | Description |
|---------|---------------|-----------|-------------|
| Frontend (Nginx) | 80 | 3001 | React SPA |
| API (FastAPI) | 8000 | 8001 | REST + WebSocket |
| PostgreSQL | 5432 | 5432 | Database |
| Redis | 6379 | 6379 | Task queue |

## Environment Variables

### API Service

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://...` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection string |
| `DATA_DIR` | `/data` | Shared volume for images/outputs |
| `SECRET_KEY` | (required) | Application secret for sessions |
| `CORS_ORIGINS` | `*` | Allowed CORS origins |
| `MAX_UPLOAD_SIZE_MB` | `500` | Maximum upload file size |
| `WORKER_CONCURRENCY` | `4` | Celery worker concurrency |

### Frontend (build-time)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `/api` | API base URL |
| `VITE_WS_URL` | (auto) | WebSocket URL |

## Alembic Migrations

### First deployment (existing database)

If the database already has tables (e.g., created by SQLAlchemy `create_all`), stamp the current revision before running migrations:

```bash
# Inside the API container
docker compose exec api alembic stamp head
```

This tells Alembic "the DB is already at the latest state" without running any migrations.

### Running migrations

```bash
# Apply all pending migrations
docker compose exec api alembic upgrade head

# Check current revision
docker compose exec api alembic current

# Generate a new migration after model changes
docker compose exec api alembic revision --autogenerate -m "description"
```

### Gotchas

- **Always stamp before first migrate** — if you run `upgrade head` on a DB that already has tables, you'll get errors about existing tables/columns.
- **Idempotent migrations** — use `op.create_table(..., if_not_exists=True)` or guard with `op.get_bind().execute(text("SELECT ..."))` checks when possible.
- **Downgrade safety** — test `alembic downgrade -1` in dev before deploying. Some migrations (like dropping columns) are destructive.
- **Multiple workers** — Alembic uses advisory locks by default, so concurrent `upgrade head` from multiple containers is safe, but avoid running migrations from the worker container.
