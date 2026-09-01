CREATE TABLE "rate_limit_buckets" (
    "scope" VARCHAR(100) NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "penaltyLevel" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("scope", "keyHash"),
    CONSTRAINT "rate_limit_buckets_count_nonnegative" CHECK ("count" >= 0),
    CONSTRAINT "rate_limit_buckets_penalty_range" CHECK ("penaltyLevel" BETWEEN 0 AND 8)
);

CREATE INDEX "rate_limit_buckets_expiresAt_idx" ON "rate_limit_buckets"("expiresAt");
