# Citari - targets de desarrollo y validacion
# Requisitos: Docker Desktop, python3. Todo corre desde la raiz del repo.

VENV := apps/api/.venv
PYTEST := $(VENV)/bin/pytest

.PHONY: up down venv test-unit test-integration test-e2e

up:
	docker compose up -d --build db db-init api
	@until curl -sf localhost:8000/ready > /dev/null; do sleep 2; done
	@echo "stack listo: API en :8000, DB citari en :11433"

down:
	docker compose down

venv:
	@test -x $(PYTEST) || (cd apps/api && python3 -m venv .venv && .venv/bin/pip install -q -e ".[dev]")

test-unit: venv
	$(PYTEST) apps/api/tests/unit -q

# Requiere SQL Server con schema (el job de CI usa su propio service container;
# local: correr dentro del contenedor api por el driver ODBC, ver apps/api/README.md)
test-integration: venv
	$(PYTEST) apps/api/tests/integration -q

# Validacion E2E caja negra contra la API real (stack debe estar arriba: make up)
test-e2e: venv
	$(PYTEST) tests/e2e -q

