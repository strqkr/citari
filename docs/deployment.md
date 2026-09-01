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
| `MFA_ENCRYPTION_KEY` | Independent high-entropy secret used to encrypt TOTP material |
| `NOTIFICATION_ENCRYPTION_KEY` | Independent high-entropy secret used to encrypt pending email tokens |
| `APP_PUBLIC_URL` | Canonical public HTTPS frontend origin used in identity links |
| `MAIL_TRANSPORT` | Must be `smtp` in production |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | SMTP connection and TLS mode |
| `SMTP_USER`, `SMTP_PASSWORD` | SMTP credentials from a secret manager |
| `MAIL_FROM` | Verified sender address |
| `CORS_ORIGINS` | Explicit comma-separated HTTPS frontend origins |
| `TRUST_PROXY_HOPS` | Exact number of controlled proxies before the API; zero when direct |
| `HOST`, `PORT` | API listener, normally `0.0.0.0:8000` |
| `API_INTERNAL_BASE_URL` | Server-side frontend route to the API |

`NEXT_PUBLIC_API_BASE_URL` is a frontend build argument and must be set as a
GitHub Actions variable for the public environment.

## Release order

1. Back up PostgreSQL and verify that a recent restore test succeeded.
2. Run `prisma migrate deploy` using a short-lived migration credential.
3. Bootstrap Andrew only on the first deployment, using a separate audited
   `BOOTSTRAP_DATABASE_URL` with the privileges required for bootstrap.
4. Verify the SMTP connection and complete a disposable verification and reset
   journey through the public HTTPS origin. Confirm that links use a fragment,
   the token disappears from the browser address after load, and replays fail.
5. Complete Andrew's forced password change and MFA enrollment. Confirm that
   both security audit events exist and that the temporary password no longer
   authenticates before removing the bootstrap credential.
6. Deploy the API by immutable tag and wait for `/api/v1/health/ready`.
7. Deploy the frontend and run login, catalog, availability, booking, tracking,
   cancellation, rescheduling, and tenant-isolation smoke tests.
8. Observe error rate, latency, database saturation, email delivery backlog,
   permanently failed messages, `429` volume, and booking failures before
   promoting the release.

Production must terminate TLS before the application and preserve the true
client address through only controlled proxies. Set `TRUST_PROXY_HOPS` from the
documented network path and verify it with a rate-limit smoke test; never trust
an arbitrary forwarded-header chain.

Alert when unsent outbox records remain past their `availableAt` time, when any
record reaches ten attempts, or when the oldest pending delivery exceeds the
agreed notification SLO. The outbox is at-least-once; duplicate identity emails
are possible during process failure, while their opaque tokens remain one-use.

The repository contains no seed data. Production credentials belong in the
platform secret manager and must never be passed as command-line arguments.
See `security.md` for key rotation constraints, identity delivery, abuse
controls, the privileged login state machine, and the two-person break-glass
MFA recovery procedure.
