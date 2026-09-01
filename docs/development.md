# Local development

Citari uses a single pnpm workspace for the TypeScript API and web application.
PostgreSQL is the only infrastructure service started by Docker Compose. Schema
creation is always an explicit Prisma migration; Compose never imports fixtures,
demo accounts, or seed data.

## Requirements

- Node.js 22 LTS or newer
- pnpm 10.34.5 through Corepack
- Docker Engine with Compose v2

## First run

1. Enable the pinned package manager: `corepack enable`.
2. Copy `.env.example` to `.env` and replace every `REPLACE_...` value. URL-encode
   special characters in passwords embedded in connection URLs.
3. Install all workspace dependencies: `pnpm install --frozen-lockfile` after a
   root lockfile exists, or `pnpm install` when intentionally refreshing it.
4. Start PostgreSQL: `pnpm infra:up`.
5. Validate and deploy the schema: `pnpm db:validate` and
   `pnpm db:migrate:deploy`.
6. Generate Prisma Client: `pnpm db:generate`.
7. Start the applications: `pnpm dev`.

The database starts empty by design. The superadmin bootstrap is a deployment
operation, not a seed. Pipe its initial password through standard input; never
place it in a command argument, environment file, or shell history.

## Quality gate

Run `pnpm quality` before opening a pull request. It executes linting, static
type checks, coverage-enforced tests, and production builds across every package
that implements those scripts. CI must use the pinned pnpm version and
`pnpm install --frozen-lockfile`.

Package-level commands remain available through filters, for example:
`pnpm --filter @citari/api-next test`.

## Database lifecycle

- `pnpm infra:down` stops local infrastructure without deleting data.
- `docker compose down --volumes` deletes the local PostgreSQL volume. This is
  destructive and must never be used against shared or production data.
- `pnpm db:migrate:deploy` applies committed migrations only.
- Do not use `prisma db push` for shared, staging, or production environments.
- Do not add Prisma seed hooks or demo records to migrations.

## Environment boundaries

Committed files contain placeholders only. Staging and production secrets belong
in the deployment platform's secret manager. Runtime database credentials should
have only application DML permissions; migrations and bootstrap use short-lived,
separately audited credentials.
