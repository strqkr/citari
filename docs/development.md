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

`MAIL_TRANSPORT=disabled` is acceptable only for local development and tests;
it leaves encrypted messages in the outbox so flows can be inspected without
sending mail. For local end-to-end email testing, configure an SMTP sandbox and
set `MAIL_TRANSPORT=smtp`. Production configuration validation rejects disabled
delivery.

The database starts empty by design. The superadmin bootstrap is a deployment
operation, not a seed. Pipe its initial password through standard input; never
place it in a command argument, environment file, or shell history.

## Quality gate

Run `pnpm quality` before opening a pull request. It verifies that the committed
OpenAPI v1 document is current, then executes linting, static type checks,
coverage-enforced tests, and production builds across every package that
implements those scripts. CI must use the pinned pnpm version and
`pnpm install --frozen-lockfile`.

Run `pnpm test:e2e` for the Chromium golden paths. These tests start the Next.js
development server themselves and exercise the complete privileged first-login
and private tracking journeys at the browser boundary. Install the pinned
browser once with `pnpm exec playwright install chromium`; CI installs Chromium
and its operating-system dependencies on every clean runner.

API changes that alter routes or schemas require `pnpm openapi:generate`. Review
the diff in `apps/api/openapi/citari.v1.json` as a public contract change.
`pnpm openapi:check` is read-only and fails when that reviewed artifact is stale.

Package-level commands remain available through filters, for example:
`pnpm --filter @citari/api test`.

The API development command compiles with TypeScript before each restart so
NestJS receives decorator metadata. Do not replace it with a transpile-only
runner: dependency injection metadata is part of the runtime contract.

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
