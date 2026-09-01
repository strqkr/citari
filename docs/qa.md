# Quality strategy

Every pull request must pass static analysis, enforced unit coverage, production
builds, clean PostgreSQL migrations, idempotent bootstrap, real HTTP integration,
and both production Docker builds.

The PostgreSQL HTTP smoke test starts the actual NestJS/Fastify application and
verifies readiness, RFC 7807 validation, owner registration and email
verification through the encrypted outbox, verification replay denial,
superadmin tenant activation, the mandatory superadmin password change and MFA
enrollment, TOTP replay denial, owner authentication, password reset and session
revocation, reset replay denial, login throttling with `Retry-After`,
authenticated profile access, a real catalog write, cross-tenant mutation
denial, refresh-token rotation, reuse detection, and family revocation. It uses
unique records in the disposable CI database and does not depend on fixtures or
seed data.

Unit tests remain responsible for edge cases and deterministic branch coverage.
The integration gate is intentionally small and high-value. Staging release
checks add real SMTP receipt, public booking, tracking, accessibility, load,
backup/restore, proxy-address validation, and observability verification as
described in the production MVP blueprint.
