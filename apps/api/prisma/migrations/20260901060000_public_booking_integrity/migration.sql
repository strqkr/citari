CREATE TYPE "SlotHoldStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');

ALTER TABLE "bookings"
  ADD COLUMN "occupiedStartAt" TIMESTAMPTZ(3),
  ADD COLUMN "occupiedEndAt" TIMESTAMPTZ(3),
  ADD COLUMN "serviceBufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "serviceBufferAfterMinutes" INTEGER NOT NULL DEFAULT 0;

UPDATE "bookings"
SET "occupiedStartAt" = "startAt", "occupiedEndAt" = "endAt";

ALTER TABLE "bookings"
  ALTER COLUMN "occupiedStartAt" SET NOT NULL,
  ALTER COLUMN "occupiedEndAt" SET NOT NULL,
  DROP CONSTRAINT "bookings_no_location_overlap",
  ADD CONSTRAINT "bookings_occupied_range_valid" CHECK ("occupiedStartAt" <= "startAt" AND "startAt" < "endAt" AND "endAt" <= "occupiedEndAt"),
  ADD CONSTRAINT "bookings_buffers_nonnegative" CHECK ("serviceBufferBeforeMinutes" >= 0 AND "serviceBufferAfterMinutes" >= 0),
  ADD CONSTRAINT "bookings_no_location_overlap" EXCLUDE USING gist (
    "tenantId" WITH =,
    "locationId" WITH =,
    tstzrange("occupiedStartAt", "occupiedEndAt", '[)') WITH &&
  ) WHERE ("status" IN ('HELD', 'PENDING', 'CONFIRMED'));

CREATE TABLE "slot_holds" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "serviceId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "status" "SlotHoldStatus" NOT NULL DEFAULT 'ACTIVE',
  "startAt" TIMESTAMPTZ(3) NOT NULL,
  "endAt" TIMESTAMPTZ(3) NOT NULL,
  "occupiedStartAt" TIMESTAMPTZ(3) NOT NULL,
  "occupiedEndAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "slot_holds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "slot_holds_range_valid" CHECK ("occupiedStartAt" <= "startAt" AND "startAt" < "endAt" AND "endAt" <= "occupiedEndAt"),
  CONSTRAINT "slot_holds_future_expiry" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "slot_holds_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "slot_holds_tenantId_serviceId_fkey" FOREIGN KEY ("tenantId", "serviceId") REFERENCES "services"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "slot_holds_tenantId_locationId_fkey" FOREIGN KEY ("tenantId", "locationId") REFERENCES "locations"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "slot_holds_no_overlap" EXCLUDE USING gist (
    "tenantId" WITH =,
    "locationId" WITH =,
    tstzrange("occupiedStartAt", "occupiedEndAt", '[)') WITH &&
  ) WHERE ("status" = 'ACTIVE')
);

CREATE UNIQUE INDEX "slot_holds_tokenHash_key" ON "slot_holds"("tokenHash");
CREATE UNIQUE INDEX "slot_holds_tenantId_id_key" ON "slot_holds"("tenantId", "id");
CREATE INDEX "slot_holds_tenantId_locationId_status_expiresAt_idx" ON "slot_holds"("tenantId", "locationId", "status", "expiresAt");

CREATE TABLE "booking_confirmations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "payloadEncrypted" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_confirmations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_confirmations_expiry_valid" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "booking_confirmations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "booking_confirmations_tenantId_bookingId_fkey" FOREIGN KEY ("tenantId", "bookingId") REFERENCES "bookings"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "booking_confirmations_tokenHash_key" ON "booking_confirmations"("tokenHash");
CREATE INDEX "booking_confirmations_tenantId_expiresAt_consumedAt_idx" ON "booking_confirmations"("tenantId", "expiresAt", "consumedAt");

ALTER TABLE "idempotency_keys" ADD COLUMN "responseBodyEncrypted" TEXT;

ALTER TABLE "slot_holds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "slot_holds" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "slot_holds"
  USING ("tenantId" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "booking_confirmations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking_confirmations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "booking_confirmations"
  USING ("tenantId" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.tenant_id', true), '')::uuid);
