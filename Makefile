.PHONY: dev prod test clean

dev:
	docker compose -f docker-compose.dev.yml up --build

prod:
	docker compose up --build -d

test:
	cd backend && pip install -r requirements.txt -q && pytest -v --tb=short
	cd frontend && npm ci --silent && npm run build

clean:
	docker compose down -v
	docker compose -f docker-compose.dev.yml down -v 2>/dev/null || true
