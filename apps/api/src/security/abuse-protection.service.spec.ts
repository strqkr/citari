import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AbuseProtectionService } from "./abuse-protection.service.js";

describe("AbuseProtectionService", () => {
  let tx: any;
  let prisma: any;
  let service: AbuseProtectionService;

  beforeEach(() => {
    tx = { $executeRaw: vi.fn(), $queryRaw: vi.fn(), rateLimitBucket: { update: vi.fn() } };
    prisma = { $transaction: vi.fn((operation) => operation(tx)), rateLimitBucket: { deleteMany: vi.fn() } };
    service = new AbuseProtectionService(prisma, { JWT_SECRET: "s".repeat(32) } as never);
  });

  it("increments an HMAC-keyed bucket without persisting the raw identity", async () => {
    tx.$queryRaw.mockResolvedValue([{ windowStart: new Date(), count: 0, penaltyLevel: 0, blockedUntil: null }]);
    await expect(service.consume("auth.login.account", "Owner@Example.com", 3, 900, 60)).resolves.toBe(true);
    const keyHash = tx.rateLimitBucket.update.mock.calls[0]?.[0]?.where.scope_keyHash.keyHash as string;
    expect(keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(keyHash).not.toContain("owner@example.com");
    expect(tx.rateLimitBucket.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ count: 1, blockedUntil: null }) }));
  });

  it("applies a progressive block after the configured limit", async () => {
    tx.$queryRaw.mockResolvedValue([{ windowStart: new Date(), count: 3, penaltyLevel: 1, blockedUntil: null }]);
    await expect(service.consume("auth.login.account", "owner@example.com", 3, 900, 300)).resolves.toBe(false);
    expect(tx.rateLimitBucket.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ count: 4, penaltyLevel: 2, blockedUntil: expect.any(Date) }) }));
  });

  it("rejects an active block without mutating its penalty", async () => {
    tx.$queryRaw.mockResolvedValue([{ windowStart: new Date(), count: 4, penaltyLevel: 2, blockedUntil: new Date(Date.now() + 60_000) }]);
    await expect(service.consume("auth.login.account", "owner@example.com", 3, 900, 300)).resolves.toBe(false);
    expect(tx.rateLimitBucket.update).not.toHaveBeenCalled();
  });

  it("raises an HTTP 429 and can reset a proven account", async () => {
    tx.$queryRaw.mockResolvedValue([{ windowStart: new Date(), count: 3, penaltyLevel: 0, blockedUntil: null }]);
    await expect(service.assertAllowed("auth.login.account", "owner@example.com", 3, 900, 300)).rejects.toBeInstanceOf(HttpException);
    await service.reset("auth.login.account", "owner@example.com");
    expect(prisma.rateLimitBucket.deleteMany).toHaveBeenCalledWith({ where: { scope: "auth.login.account", keyHash: expect.stringMatching(/^[a-f0-9]{64}$/) } });
  });
});
