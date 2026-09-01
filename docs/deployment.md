# Production deployment

Citari publishes immutable API and frontend images through
`.github/workflows/publish-images.yml`. Production hosts pull images; they do
not compile source code.

## Images

| Image | Dockerfile | Runtime |
|---|---|---|
| `ghcr.io/strqkr/citari/api` | `apps/api/Dockerfile` | NestJS/Fastify + Prisma |
| `ghcr.io/strqkr/citari/frontend` | `apps/frontend/Dockerfile` | Next.js standalone |

Main publishes `:main` and a short-SHA tag. Version tags publish the semantic
version and `:latest`. Deploy immutable SHA or semantic-version tags.

## Required runtime configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL runtime connection; DML only, no `BYPASSRLS` |
| `JWT_ISSUER` | Public HTTPS issuer URL |
| `JWT_AUDIENCE` | Expected Citari web audience |
| `JWT_SECRET` | At least 32 random bytes from a secret manager |
| `CORS_ORIGINS` | Explicit comma-separated HTTPS frontend origins |
| `HOST`, `PORT` | API listener, normally `0.0.0.0:8000` |
| `API_INTERNAL_BASE_URL` | Server-side frontend route to the API |

`NEXT_PUBLIC_API_BASE_URL` is a frontend build argument and must be set as a
GitHub Actions variable for the public environment.

## Release order

1. Back up PostgreSQL and verify that a recent restore test succeeded.
2. Run `prisma migrate deploy` using a short-lived migration credential.
3. Bootstrap Andrew only on the first deployment, using a separate audited
   `BOOTSTRAP_DATABASE_URL` with the privileges required for bootstrap.
4. Deploy the API by immutable tag and wait for `/api/v1/health/ready`.
5. Deploy the frontend and run login, catalog, availability, booking, tracking,
   cancellation, rescheduling, and tenant-isolation smoke tests.
6. Observe error rate, latency, database saturation, and booking failures before
   promoting the release.

The repository contains no seed data. Production credentials belong in the
platform secret manager and must never be passed as command-line arguments.
