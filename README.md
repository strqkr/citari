# Citari

Production-oriented, multi-tenant appointment platform. The supported stack is
Next.js, NestJS/Fastify, Prisma, and PostgreSQL 17. Runtime mock data, demo
accounts, Python, and SQL Server are not part of the application.

## Applications

- `apps/frontend`: customer booking/tracking and authenticated administration.
- `apps/api`: REST API, authentication, tenant isolation, business domains, and
  the Prisma schema/migrations.
- `docs/production-mvp-blueprint.md`: the prioritized 200-point delivery plan.

## Local setup

1. Copy `.env.example` to `.env` and replace every placeholder.
2. Run `corepack enable` and `pnpm install --frozen-lockfile`.
3. Start PostgreSQL with `pnpm infra:up`.
4. Run `pnpm db:migrate:deploy` and `pnpm db:generate`.
5. Start both applications with `pnpm dev`.

The database is deliberately empty. To create the sole initial superadmin,
pipe a temporary password from a secret provider into `pnpm admin:bootstrap`.
This creates Andrew Fuentes (`andrew@euxora.net`), requires a password change
and MFA enrollment, and creates no tenant or business data.

## Quality and delivery

`pnpm quality` is the required local and CI gate. It runs lint, TypeScript
checks, coverage-enforced tests, and production builds. Pull requests also
apply all Prisma migrations to an empty PostgreSQL 17 database, prove bootstrap
idempotency, and build both production Docker images.

See `docs/development.md`, `docs/deployment.md`, and
`docs/postgresql-migration-runbook.md` for operating procedures and
`docs/security.md` for the authentication and recovery model. Never use
`prisma db push` on a shared environment and never commit credentials.
