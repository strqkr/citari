import { describe, expect, it, vi } from "vitest";
import { SecurityMaintenanceService } from "./security-maintenance.service.js";

describe("SecurityMaintenanceService", () => {
  it("cleans global records and uses tenant-scoped transactions for RLS data", async () => {
    const tx = {
      slotHold: { updateMany: vi.fn().mockReturnValue("expire-holds"), deleteMany: vi.fn().mockReturnValue("holds") },
      bookingConfirmation: { deleteMany: vi.fn().mockReturnValue("confirmations") },
      bookingAccessChallenge: { deleteMany: vi.fn().mockReturnValue("access-challenges") },
      idempotencyKey: { deleteMany: vi.fn().mockReturnValue("idempotency") }
    };
    const prisma = {
      rateLimitBucket: { deleteMany: vi.fn().mockReturnValue("rate") },
      authChallenge: { deleteMany: vi.fn().mockReturnValue("challenge") },
      emailDelivery: { deleteMany: vi.fn().mockReturnValue("email") },
      tenant: { findMany: vi.fn().mockResolvedValue([{ id: "tenant" }]) },
      withTenant: vi.fn((_id: string, operation: (client: typeof tx) => unknown) => operation(tx)),
      $transaction: vi.fn().mockResolvedValue([])
    };
    await new SecurityMaintenanceService(prisma as never).cleanup(new Date("2030-02-01T00:00:00Z"));
    expect(prisma.$transaction).toHaveBeenCalledWith(["rate", "challenge", "email"]);
    expect(prisma.withTenant).toHaveBeenCalledWith("tenant", expect.any(Function));
    expect(tx.slotHold.updateMany).toHaveBeenCalled();
    expect(tx.bookingConfirmation.deleteMany).toHaveBeenCalled();
    expect(tx.bookingAccessChallenge.deleteMany).toHaveBeenCalled();
    expect(tx.idempotencyKey.deleteMany).toHaveBeenCalled();
  });
});
