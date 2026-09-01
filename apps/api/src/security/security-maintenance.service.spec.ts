import { describe, expect, it, vi } from "vitest";
import { SecurityMaintenanceService } from "./security-maintenance.service.js";

describe("SecurityMaintenanceService", () => {
  it("removes expired ephemeral security data with bounded delivery retention", async () => {
    const prisma = {
      rateLimitBucket: { deleteMany: vi.fn().mockReturnValue("rate") },
      authChallenge: { deleteMany: vi.fn().mockReturnValue("challenge") },
      emailDelivery: { deleteMany: vi.fn().mockReturnValue("email") },
      $transaction: vi.fn()
    };
    const now = new Date("2030-01-31T00:00:00Z");
    await new SecurityMaintenanceService(prisma as never).cleanup(now);
    expect(prisma.$transaction).toHaveBeenCalledWith(["rate", "challenge", "email"]);
    expect(prisma.rateLimitBucket.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: now } } });
    expect(prisma.emailDelivery.deleteMany).toHaveBeenCalledWith({ where: { OR: expect.arrayContaining([{ sentAt: { lt: new Date("2030-01-01T00:00:00Z") } }]) } });
  });
});
