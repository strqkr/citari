CREATE TYPE "AuthChallengePurpose" AS ENUM ('PASSWORD_CHANGE', 'MFA_ENROLL', 'MFA_CONFIRM');

ALTER TABLE "users"
  ADD COLUMN "mfaSecretEncrypted" VARCHAR(512),
  ADD COLUMN "mfaLastUsedStep" BIGINT;

CREATE TABLE "auth_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tokenHash" CHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "tenantId" UUID,
    "purpose" "AuthChallengePurpose" NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "auth_challenges_userId_purpose_consumedAt_expiresAt_idx"
ON "auth_challenges"("userId", "purpose", "consumedAt", "expiresAt");

CREATE UNIQUE INDEX "auth_challenges_tokenHash_key" ON "auth_challenges"("tokenHash");

-- Authentication needs a narrowly-scoped way to discover a user's active
-- membership before a tenant context exists. It never grants other users' rows.
CREATE POLICY "user_membership_lookup" ON "tenant_memberships"
  FOR SELECT
  USING ("userId" = nullif(current_setting('app.user_id', true), '')::uuid);

-- Security events without a tenant remain visible/writable only to their actor.
CREATE POLICY "global_actor_audit" ON "audit_events"
  USING (
    "tenantId" IS NULL
    AND "actorUserId" = nullif(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    "tenantId" IS NULL
    AND "actorUserId" = nullif(current_setting('app.user_id', true), '')::uuid
  );
