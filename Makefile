# Citari - development and validation targets
# Requirements: Docker Desktop, python3. Everything runs from the repo root.

VENV := apps/api/.venv
PYTEST := $(VENV)/bin/pytest

.PHONY: up down venv test-unit test-integration

up:
	docker compose up -d --build db db-init api
	@until curl -sf localhost:8000/ready > /dev/null; do sleep 2; done
	@echo "stack ready: API on :8000, DB citari on :11433"

down:
	docker compose down

venv:
	@test -x $(PYTEST) || (cd apps/api && python3 -m venv .venv && .venv/bin/pip install -q -e ".[dev]")

test-unit: venv
	$(PYTEST) apps/api/tests/unit -q

# Needs SQL Server with the schema applied (the CI job uses its own service
# container; locally, run inside the api container for the ODBC driver, see
# apps/api/README.md)
test-integration: venv
	$(PYTEST) apps/api/tests/integration -q
