# Quality strategy

Every pull request must pass a deterministic versioned OpenAPI check, static
analysis, enforced unit coverage, production builds, clean PostgreSQL migrations,
idempotent bootstrap, real HTTP integration, Chromium golden paths, and both
production Docker builds. CI publishes the exact reviewed OpenAPI v1 document as
a durable artifact; Docker image builds cannot start unless all preceding gates
pass.

The PostgreSQL HTTP smoke test starts the actual NestJS/Fastify application and
verifies readiness, RFC 7807 validation, owner registration and email
verification through the encrypted outbox, verification replay denial,
superadmin tenant activation, the mandatory superadmin password change and MFA
enrollment, TOTP replay denial, owner authentication, password reset and session
revocation, reset replay denial, login throttling with `Retry-After`,
authenticated profile access, a real catalog write, cross-tenant mutation
denial, two simultaneous holds for one slot, idempotent concurrent booking
replay, one-use confirmation, mandatory emailed tracking verification,
invalid-code denial, replay-safe short-lived grant issuance, safe-body tracking
lookup, refresh-token rotation, reuse detection, and family revocation. It uses
unique records in the disposable CI database and does not depend on fixtures or
seed data.

The same integration run verifies policy snapshots, rejects a hold inside the
minimum lead time, proves generated slots follow the configured local interval,
and attempts an illegal direct SQL status jump and premature completion to prove
the PostgreSQL trigger is active. Deterministic unit tests cover all 36 state pairs, completion/no-show
timing, customer notice windows, IANA validation, policy boundaries, and DST
transitions in Costa Rica, New York, and Madrid.

The browser gate covers the mandatory superadmin password-change and MFA
enrollment sequence using the real Next.js application, plus the public tracking
verification sequence. It asserts that challenge, tracking, and access-grant
secrets stay in request bodies and never appear in the URL. Traces, screenshots,
and video are retained on failure. The owner golden path and automated browser
accessibility scan remain release work; unit-level axe checks do not substitute
for those gates.

Unit tests remain responsible for edge cases and deterministic branch coverage.
The integration gate is intentionally small and high-value. Staging release
checks add real SMTP receipt, public booking accessibility, load,
backup/restore, proxy-address validation, and observability verification as
described in the production MVP blueprint.
