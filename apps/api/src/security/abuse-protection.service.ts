import { createHmac } from "node:crypto";
import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ENVIRONMENT, type Environment } from "../config/environment.js";
import { PrismaService } from "../database/prisma.service.js";

interface RateLimitRow {
  windowStart: Date;
  count: number;
  penaltyLevel: number;
  blockedUntil: Date | null;
}
interface RateLimitDecision { allowed: boolean; retryAfterSeconds?: number }

export class RateLimitExceededException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many requests. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class AbuseProtectionService {
  constructor(private readonly prisma: PrismaService, @Inject(ENVIRONMENT) private readonly env: Environment) {}

  async assertAllowed(scope: string, identity: string, limit: number, windowSeconds: number, baseBlockSeconds: number): Promise<void> {
    const decision = await this.evaluate(scope, identity, limit, windowSeconds, baseBlockSeconds);
    if (!decision.allowed) throw new RateLimitExceededException(decision.retryAfterSeconds ?? baseBlockSeconds);
  }

  async consume(scope: string, identity: string, limit: number, windowSeconds: number, baseBlockSeconds: number): Promise<boolean> {
    return (await this.evaluate(scope, identity, limit, windowSeconds, baseBlockSeconds)).allowed;
  }

  private async evaluate(scope: string, identity: string, limit: number, windowSeconds: number, baseBlockSeconds: number): Promise<RateLimitDecision> {
    const keyHash = this.fingerprint(identity);
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + Math.max(windowSeconds, baseBlockSeconds * 2 ** 8) * 1000);
      await tx.$executeRaw`
        INSERT INTO "rate_limit_buckets" ("scope", "keyHash", "windowStart", "count", "penaltyLevel", "expiresAt", "updatedAt")
        VALUES (${scope}, ${keyHash}, ${now}, 0, 0, ${expiresAt}, ${now})
        ON CONFLICT ("scope", "keyHash") DO NOTHING
      `;
      const rows = await tx.$queryRaw<RateLimitRow[]>`
        SELECT "windowStart", "count", "penaltyLevel", "blockedUntil"
        FROM "rate_limit_buckets"
        WHERE "scope" = ${scope} AND "keyHash" = ${keyHash}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) throw new Error("Rate-limit bucket was not created");
      if (row.blockedUntil && row.blockedUntil > now) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000)) };

      const windowExpired = row.windowStart.getTime() + windowSeconds * 1000 <= now.getTime();
      const count = windowExpired ? 1 : row.count + 1;
      const windowStart = windowExpired ? now : row.windowStart;
      const exceeded = count > limit;
      const penaltyLevel = exceeded ? Math.min(row.penaltyLevel + 1, 8) : row.penaltyLevel;
      const retryAfterSeconds = baseBlockSeconds * 2 ** Math.max(0, penaltyLevel - 1);
      const blockedUntil = exceeded ? new Date(now.getTime() + retryAfterSeconds * 1000) : null;
      await tx.rateLimitBucket.update({
        where: { scope_keyHash: { scope, keyHash } },
        data: { windowStart, count, penaltyLevel, blockedUntil, expiresAt }
      });
      return exceeded ? { allowed: false, retryAfterSeconds } : { allowed: true };
    });
  }

  async reset(scope: string, identity: string): Promise<void> {
    await this.prisma.rateLimitBucket.deleteMany({ where: { scope, keyHash: this.fingerprint(identity) } });
  }

  private fingerprint(identity: string): string {
    return createHmac("sha256", this.env.JWT_SECRET).update(identity.trim().toLowerCase()).digest("hex");
  }
}
