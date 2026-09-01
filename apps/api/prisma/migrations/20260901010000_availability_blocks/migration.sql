CREATE TABLE "availability_blocks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "reason" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "availability_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "availability_blocks_time_range_valid" CHECK ("startsAt" < "endsAt"),
  CONSTRAINT "availability_blocks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "availability_blocks_tenantId_locationId_fkey" FOREIGN KEY ("tenantId", "locationId") REFERENCES "locations"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "availability_blocks_tenantId_id_key" ON "availability_blocks"("tenantId", "id");
CREATE INDEX "availability_blocks_tenantId_locationId_startsAt_endsAt_idx" ON "availability_blocks"("tenantId", "locationId", "startsAt", "endsAt");

ALTER TABLE "availability_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "availability_blocks" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "availability_blocks"
  USING ("tenantId" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.tenant_id', true), '')::uuid);
