# Deployment

Philosophy: **this repository contains the application and how to build it,
not the infrastructure that hosts it.** The homelab (Dockploy, Traefik, Cloudflare
Tunnel, Tailscale, etc.) lives in a separate repository. GitHub Actions builds
and publishes the images; the server **never builds code**, it only pulls
already-built images.

```
git push / tag  ─▶  GitHub Actions  ─▶  build images  ─▶  push to GHCR
                                                              │
                                          Dockploy watches ───┘  and redeploys
```

## Published images (GHCR)

The workflow [`.github/workflows/publish-images.yml`](../.github/workflows/publish-images.yml)
builds and publishes two production images:

| Image | Dockerfile | Content |
|--------|-----------|-----------|
| `ghcr.io/strqkr/citari/frontend` | `apps/frontend/Dockerfile` | Next.js standalone (multi-stage, no source code or full node_modules) |
| `ghcr.io/strqkr/citari/api` | `apps/api/Dockerfile` | FastAPI + uvicorn + ODBC 18 driver |

**Triggered by:**

- push to `main` → tags `:main` and `:<short-sha>`
- tag `vX.Y.Z` → tags `:X.Y.Z` and `:latest`
- manual run (**Actions → Publish images → Run workflow** tab)

No credentials need to be configured: it uses the workflow's own
`GITHUB_TOKEN`. The first time, in **Settings → Packages**, mark the packages
as visible so Dockploy can pull them (or configure a read token if you keep
them private).

## Required configuration before the first deploy

### Frontend: public API URL (build-time)

`NEXT_PUBLIC_*` variables are **baked into the bundle at build time**, not at
runtime. Set the real public API URL in
**Settings → Secrets and variables → Actions → Variables**:

```
NEXT_PUBLIC_API_BASE_URL = https://api.your-domain.com
```

If not set, it defaults to `http://localhost:8000` (only useful for testing).
Every time that URL changes, the frontend image must be **rebuilt** (restarting
the container is not enough).

### API: runtime variables (read by Dockploy/compose at startup)

| Variable | Description |
|----------|-------------|
| `SQLSERVER_HOST` / `SQLSERVER_PORT` | SQL Server host and port |
| `SQLSERVER_USER` / `SQLSERVER_PASSWORD` | Credentials |
| `SQLSERVER_DB` | `citari` |
| `JWT_SECRET` | JWT secret (min. 32 characters) — **change in production** |
| `JWT_EXPIRES_MIN` | Token expiration (minutes), defaults to 60 |
| `CORS_ORIGINS` | Frontend origin, e.g. `https://your-domain.com` |
| `LOG_FORMAT` | `json` in production |

## Database

The schema and seed scripts are in [`database/scripts/`](../database/scripts)
(`01`…`07`, in order; `08-full-script.sql` concatenates them). In production
they run once against the SQL Server instance; the homelab decides whether to
use a SQL Server container, a persistent volume, or a managed instance. The
app does not create the schema on its own.

## Testing the production image locally (optional)

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 \
  -t citari-frontend:local apps/frontend
docker run --rm -p 3000:3000 citari-frontend:local

docker build -t citari-api:local apps/api
```

## Development (not production)

For day-to-day work, `docker compose up` is used (see `docker-compose.yml`):
bind mounts + hot reload for the frontend (`next dev`) and the API
(`uvicorn --reload`). Those development overrides are **not** what gets
deployed; production always runs the GHCR images described above.
