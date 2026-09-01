ALTER TYPE "AuthChallengePurpose" ADD VALUE 'EMAIL_VERIFY';
ALTER TYPE "AuthChallengePurpose" ADD VALUE 'PASSWORD_RESET';

CREATE TYPE "NotificationTemplate" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

CREATE TABLE "email_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "recipient" VARCHAR(254) NOT NULL,
    "template" "NotificationTemplate" NOT NULL,
    "payloadEncrypted" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_deliveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "email_deliveries_sentAt_availableAt_lockedAt_idx"
  ON "email_deliveries"("sentAt", "availableAt", "lockedAt");
CREATE INDEX "email_deliveries_userId_createdAt_idx"
  ON "email_deliveries"("userId", "createdAt");

ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_attempts_nonnegative" CHECK ("attempts" >= 0);
