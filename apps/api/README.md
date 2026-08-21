# Citari API (apps/api)

FastAPI + pyodbc (synchronous) API for the Citari project.

Layers: Router (HTTP only) -> Service (orchestration) -> Repository (the only
layer that knows SQL/stored procedures) -> pyodbc, running on FastAPI's
threadpool. No ORM, no async DB drivers.

The full API surface is implemented: public booking/tracking flow, JWT auth
(owner/superadmin roles), owner CRUD, admin, reports and audit logs. Each route
delegates to its stored procedure or view; tenant isolation is derived from the
JWT claim and enforced down through the repository and SQL layers. `GET /health`
and `GET /ready` are the only routes that require no auth (`/ready` checks the DB
with a simple `SELECT 1`). The one intentional exception is `POST /admin/tenants`,
left as `501` on purpose — tenants are created via `POST /auth/register-owner`.

## Run locally (recommended: Docker)

From the repo root:

```bash
docker compose up --build
```

Brings up `db` + this API + the frontend. The `api` service is bind-mounted
and installed editable (`pip install -e .`), runs `uvicorn --reload`, and sets
`WATCHFILES_FORCE_POLLING=true` so the reloader picks up changes over Windows/
Docker Desktop bind mounts — edit a file on the host, save, and uvicorn
reloads on its own. No rebuild needed for ordinary code changes; a
`docker compose up -d --build api` is only required when `pyproject.toml`
dependencies change.

API at http://localhost:8000, interactive docs at `/docs`.

## Run locally (without Docker, in a venv)

```bash
cd apps/api
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"

# minimal env to boot the process (DB is only touched by /ready):
export SQLSERVER_HOST=localhost
export SQLSERVER_PASSWORD=YourStrong!Passw0rd
export JWT_SECRET=devsecretdevsecretdevsecret12345

.venv/bin/uvicorn app.main:app --reload --port 8000
```

`GET http://localhost:8000/health` -> `{"status": "ok"}` (no DB access).
`GET http://localhost:8000/ready` -> `{"status": "ok"}` if `SELECT 1` against
SQL Server succeeds, otherwise HTTP 503.

## Run tests

```bash
.venv/bin/pytest tests/unit -q
```

`tests/unit` has no database dependency (mappers, errors, security, logging
formatters). `tests/integration` runs against a real SQL Server instance,
seeding and cleaning up its own rows, and includes cross-tenant isolation checks
(a foreign tenant's resources must return 404, never leak). Run them with
`.venv/bin/pytest tests/integration -q` once the DB is up and seeded.

## Lint / type-check

```bash
.venv/bin/ruff check app tests
.venv/bin/ruff format --check app tests
.venv/bin/mypy app
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `SQLSERVER_HOST` | `localhost` | SQL Server host |
| `SQLSERVER_PORT` | `1433` | SQL Server port |
| `SQLSERVER_USER` | `sa` | SQL Server login |
| `SQLSERVER_PASSWORD` | (none) | SQL Server password |
| `SQLSERVER_DB` | `citari` | Database name |
| `JWT_SECRET` | `change-me` | HS256 signing secret - set a real one outside dev |
| `JWT_EXPIRES_MIN` | `60` | Access token lifetime in minutes |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `LOG_FORMAT` | `json` | `dev` for a human-readable pipe-delimited line, `json` (default) for one JSON object per line |

## Production image

Same `Dockerfile` used above for dev (editable install), but production runs
it without `--reload` and without the bind mount (baked-in code, immutable
image). See [docs/deployment.md](../../docs/deployment.md) for the GHCR
publish workflow and required runtime env vars.

```bash
docker build -t citari-api apps/api
docker run --rm -p 8000:8000 \
  -e SQLSERVER_HOST=sqlserver -e SQLSERVER_PASSWORD=... -e JWT_SECRET=... \
  citari-api
```
