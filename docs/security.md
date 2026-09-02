# Security model and privileged authentication

## Trust boundaries

The browser talks only to the Next.js backend-for-frontend (BFF) at
`/api/backend`. Access and refresh tokens are stored in separate `HttpOnly`,
`SameSite=Lax` cookies and are never returned to browser JavaScript. The BFF
forwards bearer credentials to the NestJS API. PostgreSQL remains the final
tenant-isolation boundary through forced row-level security and database
constraints.

`JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `NOTIFICATION_ENCRYPTION_KEY`, SMTP and
database credentials, bootstrap input, raw refresh tokens, raw authentication
challenges, and TOTP secrets are secrets. They must be supplied by the
deployment secret manager and must not appear in Git, image layers,
command-line arguments, telemetry, or support tools. Identity links carry the
opaque token in the URL fragment so it is not sent in HTTP request targets.

## First superadmin access

The one-time bootstrap creates only Andrew Fuentes at `andrew@euxora.net`. It
marks the email verified, requires a password change, requires MFA, creates no
tenant, and accepts the temporary password through standard input.

The API enforces this state machine server-side:

1. Valid temporary credentials return a ten-minute `PASSWORD_CHANGE_REQUIRED`
   challenge, not a session.
2. A new password must contain at least 16 characters, uppercase, lowercase,
   and a number, and must differ from the temporary password.
3. Password replacement revokes every existing session and returns an
   `MFA_ENROLLMENT_REQUIRED` challenge.
4. Enrollment generates a 160-bit TOTP secret, stores it with AES-256-GCM
   authenticated encryption, and returns it once with an `otpauth://` URI.
5. A valid six-digit TOTP confirmation activates MFA, records the used time
   step, audits enrollment, and only then creates the first session.
6. Every later privileged login requires password plus TOTP. A time step can
   be used only once, including across concurrent requests.

Challenge tokens contain 256 random bits. PostgreSQL stores only their SHA-256
digests; tokens are single-use, expire after ten minutes, and a newer challenge
invalidates an older challenge for the same user and purpose. Failed
confirmation rolls back consumption so a user can correct a mistyped code
while the challenge remains valid.

## Session controls

- Access tokens expire after 15 minutes and include a unique JWT identifier.
- Refresh tokens expire after 30 days, are stored only as SHA-256 digests, and
  rotate on every use.
- Reuse of a rotated, expired, or revoked refresh token revokes its entire
  session family.
- Password changes and MFA enrollment revoke all prior sessions.
- Refresh is denied if password change or required MFA enrollment is pending.
- Logout revokes the presented refresh token and the BFF clears both cookies.

## Email identity and account recovery

- Owner registration creates an unverified account and a 24-hour email
  verification challenge in the same transaction. An owner cannot log in until
  the address is verified.
- Password-reset challenges expire after 30 minutes. Successful reset revokes
  all sessions, consumes every outstanding reset challenge for that user, and
  records a security audit event. MFA enrollment is deliberately preserved.
- Verification and reset challenges contain 256 random bits. PostgreSQL stores
  only SHA-256 digests, challenges are one-use, and a newer message supersedes
  older pending challenges and deliveries for the same purpose.
- Request endpoints always return the same accepted response for known,
  unknown, ineligible, and account-throttled addresses. This prevents account
  enumeration.
- The transactional outbox stores the recipient and an AES-256-GCM encrypted
  token payload. Workers claim rows with `FOR UPDATE SKIP LOCKED`, reclaim a
  stale lock after ten minutes, and retry with bounded exponential backoff for
  at most ten attempts.
- Delivery is at least once: a process failure after SMTP accepts a message but
  before PostgreSQL records completion can produce a duplicate email. Tokens
  remain one-use, and the newest challenge invalidates older messages.
- Production refuses to start unless SMTP delivery is enabled and fully
  configured. Local and test environments may explicitly disable delivery.

## Abuse controls and client-address trust

Rate-limit identities are stored only as HMAC-SHA-256 fingerprints. Counters
are serialized with PostgreSQL row locks and apply progressive exponential
blocking, capped at penalty level eight. A rejected request uses RFC 7807 with
status `429` and a `Retry-After` header.

| Surface | Limits per identity |
|---|---|
| Login | 60/IP/15 min and 8/account/15 min |
| Registration | 5/IP/hour |
| Verification or reset request | 10/IP/hour and 3/account/hour |
| Challenge consumption | 30/IP/15 min and 8/token/15 min |
| Public booking | 30/IP/hour and 12/tenant+IP/15 min |
| Tracking | 120 read or 30 write/IP/hour plus token limits |

A successful password check clears that account's login bucket. Account-level
delivery throttling remains intentionally silent to preserve the uniform
recovery response. Expired rate buckets and challenges are removed hourly;
completed or permanently failed delivery records are retained for 30 days.

`TRUST_PROXY_HOPS` must equal the exact number of controlled reverse-proxy hops
between the public client and the API. Leave it at zero for a directly exposed
API. A value that is too high lets callers forge the address used for audit and
rate limiting; a value that is too low groups traffic under the proxy address.

## Public booking integrity

- Availability includes service buffers, active bookings, availability blocks,
  and unexpired slot holds. The customer must choose an explicit active
  location before availability is calculated.
- Continuing from a slot acquires a ten-minute hold. PostgreSQL serializes all
  writes for the same tenant and location with a transaction-scoped advisory
  lock, while exclusion constraints reject overlapping active holds and
  bookings at the database boundary.
- Administrative availability blocks acquire that same tenant/location lock
  and are rejected when they overlap an active booking or hold, closing the
  cross-table race in both directions.
- Booking creation requires the exact hold token and atomically consumes it.
  The token is random, stored only as a SHA-256 digest, carried in the browser
  URL fragment, and removed from browser history immediately.
- Public hold and booking commands require idempotency keys. Concurrent replay
  returns the same encrypted stored result; reuse with another payload returns
  `409`. Plaintext hold, tracking, and confirmation tokens are never stored in
  the idempotency response JSON column.
- Booking creation returns only a 15-minute confirmation nonce. Its encrypted
  payload releases the tracking credential exactly once. Retrying the same
  idempotent command returns the same encrypted result after a lost response;
  replay under another key returns `410`.
- The supported browser tracking flow sends the case-sensitive credential in a
  POST body. It is never placed in a query string, browser-visible path,
  referrer, or server-rendered link.
- Expired holds are marked before every serialized scheduling command. Tenant-
  scoped maintenance removes expired holds, confirmations, and idempotency
  records without bypassing RLS.

## Key management

`MFA_ENCRYPTION_KEY` and `NOTIFICATION_ENCRYPTION_KEY` must be independent from
`JWT_SECRET` and each other, contain at least 32 high-entropy bytes, and remain
stable while their encrypted records exist. A key change without a data
re-encryption or queue-drain ceremony makes the associated material unreadable.
Store all three values in a versioned secret manager, restrict read access to
the API workload, and rotate them through a reviewed maintenance procedure with
rollback material retained for the approved recovery window.

## Break-glass MFA recovery

Citari intentionally exposes no unauthenticated MFA-reset endpoint. If Andrew
loses every enrolled authenticator, responders must open a security incident,
verify identity out of band with two authorized people, use the short-lived
`BYPASSRLS` maintenance credential, clear the encrypted MFA state, revoke all
sessions and challenges, and append a global `SUPERADMIN_MFA_RESET` audit event
inside one PostgreSQL transaction. The next valid password login will require
fresh MFA enrollment. Record the incident identifier as the audit reason and
revoke the maintenance credential immediately afterward.

## Verification evidence

Unit tests cover authenticated encryption, RFC 6238 verification, challenge
expiry and replay, password replacement, MFA enrollment, code-step replay,
session revocation, outbox claiming/retry, cleanup, and progressive throttling.
The PostgreSQL HTTP test exercises bootstrap, password change, MFA enrollment,
email verification, password reset, token replay rejection, session revocation,
login throttling with `Retry-After`, tenant activation/isolation, concurrent
slot holds, idempotent booking replay, one-use confirmation, tracking lookup,
and refresh-family revocation against a newly migrated PostgreSQL 17 database.
