# PostgreSQL migration and cutover runbook

This runbook controls the retirement of the legacy SQL Server/FastAPI path. It
does not authorize an in-place production cutover until contract, reconciliation,
performance, rollback, and restore evidence has passed in staging.

## Invariants

- Prisma migrations are immutable after merge.
- Production deploys run `prisma migrate deploy`; never `db push`.
- Migrations contain schema and technical reference values only—no tenants,
  bookings, customers, users, or demo data.
- Every tenant-owned table is protected by PostgreSQL row-level security and
  tested with a non-owner runtime role.
- All timestamps are stored as `timestamptz` in UTC; tenant time zones are IANA
  identifiers applied only at domain and presentation boundaries.
- Money uses fixed-precision decimal values plus an ISO 4217 currency code.
- IDs and externally visible booking references remain stable through cutover.

## Delivery phases

1. **Inventory:** freeze the SQL Server schema map and record row counts,
   constraints, procedures, views, triggers, and consumers.
2. **Contract parity:** capture legacy API behavior as automated contract tests.
3. **Schema readiness:** review Prisma models and native PostgreSQL constraints,
   RLS policies, indexes, grants, and rollback characteristics.
4. **Transformation:** implement repeatable extraction and load jobs. Reject
   malformed rows into an auditable quarantine report; never silently coerce.
5. **Dry run:** restore a production-like snapshot into an isolated environment,
   migrate it, and retain timings and reconciliation evidence.
6. **Application rehearsal:** run the new API and frontend against migrated data;
   complete security, accessibility, load, failure, and restore tests.
7. **Cutover:** announce the write freeze, take a final backup, perform the final
   delta migration, reconcile, switch traffic, and run smoke tests.
8. **Observation:** retain the legacy system read-only through the rollback window.
   Remove it only after business and engineering sign-off.

## Required reconciliation

For every entity, compare source and target row counts, null distributions,
distinct tenant ownership, and deterministic checksums over normalized business
fields. Additionally verify:

- no orphaned foreign keys;
- no overlapping active reservations;
- booking status and monetary totals match;
- normalized emails and public references remain unique;
- all tenant-owned rows are inaccessible from a different tenant context;
- the designated superadmin is the only bootstrap-created runtime identity;
- no demo tenant, service, customer, availability, or booking exists.

Store the signed reconciliation report with the deployment record. A mismatch is
a hard stop, not a warning.

## Rollback triggers

Rollback when reconciliation differs, authentication or authorization fails,
error rates breach the release threshold, latency breaches the agreed SLO, or a
critical booking workflow fails. During the rollback window, avoid target-only
writes unless a tested reverse-sync mechanism exists. Restore routing to the
read-only-preserved legacy release, verify health, and retain all logs for review.

## Backup and restore evidence

Before cutover, prove a point-in-time recovery into an isolated database, record
recovery point and recovery time, validate application login and booking reads,
and attach the evidence to the release. A backup without a successful restore
test is not accepted as a recovery control.
