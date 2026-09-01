# Security model and privileged authentication

## Trust boundaries

The browser talks only to the Next.js backend-for-frontend (BFF) at
`/api/backend`. Access and refresh tokens are stored in separate `HttpOnly`,
`SameSite=Lax` cookies and are never returned to browser JavaScript. The BFF
forwards bearer credentials to the NestJS API. PostgreSQL remains the final
tenant-isolation boundary through forced row-level security and database
constraints.

`JWT_SECRET`, `MFA_ENCRYPTION_KEY`, database credentials, bootstrap input, raw
refresh tokens, raw authentication challenges, and TOTP secrets are secrets.
They must be supplied by the deployment secret manager and must not appear in
Git, image layers, command-line arguments, URLs, telemetry, or support tools.

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

## Key management

`MFA_ENCRYPTION_KEY` must be independent from `JWT_SECRET`, contain at least 32
high-entropy bytes, and remain stable while enrolled MFA records exist. A key
change without a data re-encryption ceremony makes enrolled TOTP material
unreadable. Store both values in a versioned secret manager, restrict read
access to the API workload, and rotate them through a reviewed maintenance
procedure with rollback material retained for the approved recovery window.

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

Unit tests cover encryption authentication, RFC 6238 verification, challenge
expiry and replay, password replacement, MFA enrollment, code-step replay, and
session revocation. The PostgreSQL HTTP test exercises the full bootstrap,
password-change, enrollment, confirmation, replay rejection, tenant activation,
tenant isolation, and refresh-family revocation journey against a newly
migrated PostgreSQL 17 database.
