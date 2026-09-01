# Citari API

Production API built with NestJS, Fastify, PostgreSQL 17, and the officially
supported Prisma 7 client. This is the repository's only backend runtime.

## Safety rules

- Production runs `prisma migrate deploy`; never `db push`.
- Migrations contain schema and technical invariants only, never demo users.
- Runtime database credentials cannot perform DDL.
- Bootstrap uses a separate, temporary `BOOTSTRAP_DATABASE_URL` role with
  `BYPASSRLS`; the runtime credential must never receive that privilege.
- Tenant tables require RLS before the new API can serve production traffic.
- Bootstrap credentials are piped from a secret provider and never placed in shell history.

## Superadmin bootstrap

After migrations, pipe a generated temporary password from the deployment
secret provider into:

```bash
pnpm admin:bootstrap
```

The command creates only Andrew Fuentes (`andrew@euxora.net`), is idempotent,
and requires password change and MFA enrollment. It creates no tenant or demo data.
