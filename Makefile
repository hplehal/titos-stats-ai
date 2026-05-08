.PHONY: db-up db-down api-dev migrate migration seed

db-up:
	docker compose -f docker-compose.dev.yml up -d

db-down:
	docker compose -f docker-compose.dev.yml down

api-dev:
	cd api && uv run uvicorn src.main:app --reload --port 8000

migrate:
	cd api && uv run alembic upgrade head

migration:
	@if [ -z "$(name)" ]; then echo "Usage: make migration name=<short_name>"; exit 1; fi
	cd api && uv run alembic revision --autogenerate -m "$(name)"

seed:
	cd api && uv run python -m src.seed
