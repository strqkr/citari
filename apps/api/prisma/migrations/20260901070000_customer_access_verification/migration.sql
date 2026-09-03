ALTER TYPE "NotificationTemplate" ADD VALUE 'BOOKING_ACCESS_CODE';

ALTER TABLE "email_deliveries"
  ADD COLUMN "deduplicationKey" VARCHAR(200);

UPDATE "email_deliveries"
SET "deduplicationKey" = 'user:' || "userId"::text || ':' || "template"::text;

ALTER TABLE "email_deliveries"
  ALTER COLUMN "userId" DROP NOT NULL,
  ALTER COLUMN "deduplicationKey" SET NOT NULL;

CREATE INDEX "email_deliveries_deduplicationKey_createdAt_idx"
  ON "email_deliveries"("deduplicationKey", "createdAt");

CREATE TABLE "booking_access_challenges" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "codeHash" CHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "grantHash" CHAR(64),
  "grantEncrypted" TEXT,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "grantExpiresAt" TIMESTAMPTZ(3),
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_access_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_access_challenges_attempts_valid" CHECK ("attempts" BETWEEN 0 AND 5),
  CONSTRAINT "booking_access_challenges_expiry_valid" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "booking_access_challenges_grant_consistent" CHECK (
    ("grantHash" IS NULL AND "grantEncrypted" IS NULL AND "grantExpiresAt" IS NULL)
    OR
    ("grantHash" IS NOT NULL AND "grantEncrypted" IS NOT NULL AND "grantExpiresAt" IS NOT NULL AND "consumedAt" IS NOT NULL)
  ),
  CONSTRAINT "booking_access_challenges_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "booking_access_challenges_tenantId_bookingId_fkey" FOREIGN KEY ("tenantId", "bookingId") REFERENCES "bookings"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "booking_access_challenges_tokenHash_key" ON "booking_access_challenges"("tokenHash");
CREATE UNIQUE INDEX "booking_access_challenges_grantHash_key" ON "booking_access_challenges"("grantHash");
CREATE INDEX "booking_access_challenges_tenantId_bookingId_expiresAt_idx" ON "booking_access_challenges"("tenantId", "bookingId", "expiresAt");
CREATE INDEX "booking_access_challenges_tenantId_grantExpiresAt_idx" ON "booking_access_challenges"("tenantId", "grantExpiresAt");

ALTER TABLE "booking_access_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking_access_challenges" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "booking_access_challenges"
  USING ("tenantId" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.tenant_id', true), '')::uuid);
