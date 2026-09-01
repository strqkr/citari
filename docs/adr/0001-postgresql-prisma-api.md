# ADR 0001: PostgreSQL, Prisma, and a TypeScript API

- Status: Accepted
- Date: 2026-08-31
- Owner: `strqkr`

## Context

Citari currently uses FastAPI, synchronous pyodbc, SQL Server, and a monolithic
SQL file containing schema, demo data, procedures, functions, views, and
triggers. The target explicitly requires PostgreSQL and Prisma as the ORM.

Prisma does not provide an official supported Python client. Keeping FastAPI
would require an unsupported community client or a Node sidecar, adding failure
modes while failing the goal of using Prisma as the application's ORM.

## Decision

Replace the API incrementally with TypeScript, NestJS, Fastify, and the official
Prisma Client. Preserve `/api/v1` behavior while routes migrate domain by domain.
Use PostgreSQL RLS and reviewed native migrations for database guarantees Prisma
cannot express, including exclusion constraints and tenant policies.

## Consequences

- One language and package manager cover the web application, API, and contracts.
- Existing Python API tests become contract fixtures before Python is removed.
- Stored-procedure orchestration moves into tested domain services and transactions.
- Prisma migrations are immutable; production uses only `prisma migrate deploy`.
- Native SQL remains permitted only in migrations or isolated reviewed adapters.
- The migration is larger than a driver swap, but avoids unsupported production infrastructure.

## Rejected alternatives

- Prisma Python: unsupported for a production platform.
- Node Prisma sidecar behind FastAPI: duplicated transport, deployment, and failure surface.
- PostgreSQL with SQLAlchemy: technically sound, but does not meet the Prisma requirement.
