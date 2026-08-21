# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Citari: multi-tenant booking platform for service businesses.
Three parts, one repo: SQL Server database (source of truth for business logic),
a FastAPI backend, and a Next.js frontend, wired together by Docker Compose.

Docs live in `docs/`: `docs/api-handover.md` (full endpoint table, conventions,
curl examples), `docs/sql-signatures.md` (every stored procedure/view/
function/trigger signature and `THROW` error code), and `docs/deployment.md`
(production deployment). The frontend's user-facing UI text is in Spanish
(the product's market); everything else — schema, code, docs — is in English.

## Commands

### Full stack (recommended)

```bash
docker compose up --build       # db + api (hot reload) + frontend (hot reload)
docker compose down             # stop, keep data
docker compose down -v          # stop, wipe DB volume
```

First boot runs `database/scripts/01`-`07` (schema, seed, procedures,
functions, views, triggers) automatically; later boots detect the DB exists
and skip it. SQL Server is exposed on host port `11433` (not `1433`, to avoid
clashing with a local instance). Copy `.env.example` to `.env` to override
passwords/`JWT_SECRET`/ports.

### Makefile targets (from repo root)

```bash
make up               # docker compose up (db + api only) + waits for /ready
make down
make test-unit        # apps/api/tests/unit, no DB needed
make test-integration # apps/api/tests/integration, needs live SQL Server
```

### API (apps/api)

```bash
cd apps/api
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"

.venv/bin/pytest tests/unit -q                 # 95 tests, no DB
.venv/bin/pytest tests/integration -q          # 65 tests, needs SQL Server with schema applied
.venv/bin/pytest tests/unit/test_foo.py::test_bar -q   # single test

.venv/bin/ruff check app tests
.venv/bin/ruff format --check app tests
.venv/bin/mypy app
```

Without Docker: `uvicorn app.main:app --reload --port 8000` needs
`SQLSERVER_HOST`, `SQLSERVER_PASSWORD`, `JWT_SECRET` set (see
[apps/api/README.md](apps/api/README.md) for the full env var table).

### Frontend (apps/frontend)

```bash
cd apps/frontend
corepack enable && pnpm install   # pnpm only, version pinned in package.json
pnpm dev
pnpm build
pnpm lint
```

Defaults to `NEXT_PUBLIC_API_MODE=mock` (fake data from `lib/mock-data.ts`)
unless `apps/frontend/.env.local` sets `NEXT_PUBLIC_API_MODE=api` +
`NEXT_PUBLIC_API_BASE_URL`. Inside `docker compose`, `api` mode is already the
default. `NEXT_PUBLIC_*` vars are baked into the build at compile time, not
read at runtime.

### Database only

```bash
.\scripts\setup-db.ps1     # Windows
bash scripts/setup-db.sh   # macOS/Linux
```

Loads `database/scripts/01`-`07` against a SQL Server not managed by Compose.

## Architecture

### Golden rules

- **Schema and API are both English**: physical tables/columns are English
  snake_case (`services`, `name`); the API exposes camelCase (`serviceId`,
  `firstName`). Only the frontend's user-facing UI text is Spanish.
- **The API translates casing**: mappers (`apps/api/app/mappers/`) convert
  snake_case rows to camelCase in exactly one place.
- **Business logic lives in SQL**: writes go through stored procedures, reads
  go through views. The API does not duplicate business rules.
- **Triggers do the magic automatically** — tracking codes, audit logging,
  freeing availability blocks on cancel — never reimplement this in the API or
  frontend.

### API layering (apps/api/app)

Strict `Router -> Service -> Repository -> pyodbc` chain, one directory per
layer (`routers/`, `services/`, `repositories/`, `mappers/`, `schemas/`):

- **Routers** (`routers/*.py`): HTTP only — parsing, status codes, auth guard
  dependency. No SQL, no business logic.
- **Services** (`services/*.py`): orchestration between repositories.
- **Repositories** (`repositories/*.py`): the *only* layer that touches SQL —
  calls stored procedures/views via helpers in `app/db.py`
  (`exec_sp`, `exec_sp_output`, `query_view`). One repository per aggregate.
- **Mappers** (`mappers/*.py`): translate raw pyodbc rows (snake_case) to
  camelCase API schema dicts.

No ORM, no async DB driver — pyodbc is synchronous and runs on FastAPI's
threadpool. All routes mount under `/api/v1` (see `_register_routers` in
`app/main.py`) except `GET /health` and `GET /ready`, which need no auth.

**Tenant isolation**: the JWT carries `sub` (user id), `role`
(`owner`/`superadmin`), and `tenantId` (owners only). Every owner-scoped query
filters by the `tenantId` pulled from the *decoded token*, never from request
params/body — this is what makes cross-tenant access return 404 instead of
leaking data.

**Errors**: stored procedures raise SQL `THROW` with a custom 5-digit error
number in the 50000s range; `app/errors.py` maps that range to an HTTP status
(50001-50019 → 400, 50020-50039 → 404, 50040-50059 → 409, else 500) and
serializes it as an RFC 7807 `application/problem+json` body
(`type`/`title`/`status`/`detail`/`traceId`). Exception handlers for this live
centrally in `app/main.py`; individual routers/services don't do their own
HTTP-status mapping for DB errors.

`POST /admin/tenants` is intentionally `501` — tenants are created only via
`POST /auth/register-owner`.

### Frontend structure (apps/frontend)

Next.js App Router. `app/` holds three route groups: public
(`/`, `/track`, `/book/[slug]/*`, `/track/[code]/*` — no auth), owner
back-office (`/dashboard`, `/services`, `/bookings`, `/customers`,
`/reports`, `/availability`, `/settings/business`, etc. — JWT with
`role=owner`), and superadmin (`/admin/*` — JWT with `role=superadmin`).

- `lib/api.ts`: HTTP client (`apiGet`/`apiPost`/`apiPatch`/`apiDelete`),
  auto-attaches `Authorization: Bearer` when a token is stored, converts RFC
  7807 error bodies into `ApiError`. Picks browser vs. internal-Docker URL
  based on `typeof window`.
- `lib/endpoints.ts`: single source of truth for endpoint paths.
- `lib/resource.ts`: `useResource`/`useResourceOne` hooks — handle
  loading/error state and fall back to `lib/mock-data.ts` in mock mode.
- `hooks/useAuth.ts`: session rehydration via `GET /auth/me`.
- `types/`: TS contracts kept in sync with API schemas (camelCase).
- `components/ui/`: shadcn/ui primitives; `components/admin/`,
  `components/booking/`, `components/marketing/`: domain screens/managers.

### Database (database/)

`database/scripts/01`-`08` are numbered, ordered SQL Server scripts (schema,
seed, procedures, functions, views, triggers, plus `08-full-script.sql`, a
generated single-file bundle of 01-07 — regenerate it with
`python3 scripts/gen-full-script.py` after changing any of 01-07). 24 tables,
all English names. `docs/sql-signatures.md` is the canonical reference for
every stored procedure/view/function/trigger signature and `THROW` error
code; consult it before writing a new repository method rather than reading
the raw SQL.

### Tests

- `apps/api/tests/unit`: no DB dependency (mappers, errors, security, logging).
- `apps/api/tests/integration`: hits a real SQL Server with the schema
  applied; includes cross-tenant isolation checks (a foreign tenant's
  resources must 404, never leak).

CI (`.github/workflows/ci.yml`) runs these against service containers;
`publish-images.yml` builds and publishes `frontend`/`api` images to GHCR on
push to `main`, on `vX.Y.Z` tags, or manually — production only redeploys
published images, it never builds from source (see `docs/deployment.md`).
