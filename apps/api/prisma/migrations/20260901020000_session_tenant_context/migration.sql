ALTER TABLE "sessions" ADD COLUMN "tenantId" UUID;

CREATE INDEX "sessions_tenantId_revokedAt_idx" ON "sessions"("tenantId", "revokedAt");

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE POLICY membership_login_lookup ON "tenant_memberships"
  FOR SELECT
  USING ("userId" = nullif(current_setting('app.user_id', true), '')::uuid);
