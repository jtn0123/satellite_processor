.PHONY: dev prod test lint build deploy logs clean benchmark test-integration test-migrations-sqlite

dev:
	docker compose -f docker-compose.dev.yml up --build

prod:
	docker compose up --build -d

build:
	docker compose build

deploy: build prod

lint:
	cd backend && python -m ruff check .
	cd frontend && npx eslint src/

test:
	cd backend && pip install -r requirements.txt -q && pytest -v --tb=short
	cd frontend && npm ci --silent && npm run build

test-migrations-sqlite:
	cd backend && DATABASE_URL=sqlite:///$$(mktemp -t alembic-sqlite-XXXXXX.db) alembic upgrade head

test-integration:
	docker compose -f docker-compose.test.yml up --build -d
	@echo "Waiting for services to be healthy..."
	sleep 15
	curl -f http://localhost:8000/api/health || (docker compose -f docker-compose.test.yml logs && exit 1)
	docker compose -f docker-compose.test.yml down -v

logs:
	docker compose logs -f --tail=100

benchmark:
	cd backend && python -m benchmarks.profile_processor

clean:
	docker compose down -v
	docker compose -f docker-compose.dev.yml down -v 2>/dev/null || true
	docker compose -f docker-compose.test.yml down -v 2>/dev/null || true
