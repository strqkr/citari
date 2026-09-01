import { describe, expect, it, vi } from "vitest";
import { ReportsService } from "./reports.service.js";

describe("ReportsService", () => {
  it("builds every tenant-scoped operational report", async () => {
    const tx = {
      booking: { count: vi.fn().mockResolvedValue(2), findMany: vi.fn().mockResolvedValue([{ id: "b" }]), groupBy: vi.fn().mockResolvedValue([{ serviceId: "s", _count: { _all: 2 } }]) },
      customer: { count: vi.fn().mockResolvedValue(3) }, service: { count: vi.fn().mockResolvedValue(4) },
      location: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([{ id: "l", name: "Main" }]) },
      businessHour: { findMany: vi.fn().mockResolvedValue([{ locationId: "l", dayOfWeek: 1 }]) },
    };
    const prisma = { withTenant: vi.fn((_tenant: string, operation: (client: typeof tx) => unknown) => operation(tx)) };
    const service = new ReportsService(prisma as never);
    const range = { from: new Date("2026-01-01"), to: new Date("2026-01-02"), page: 1, pageSize: 25 };
    await expect(service.dashboard("tenant")).resolves.toMatchObject({ bookingsToday: 2, customers: 3 });
    await expect(service.agenda("tenant", range)).resolves.toHaveLength(1);
    await expect(service.detail("tenant", range)).resolves.toMatchObject({ pagination: { total: 2 } });
    await expect(service.demand("tenant", range)).resolves.toHaveLength(1);
    await expect(service.availability("tenant")).resolves.toMatchObject({ locations: [{ id: "l", hours: [{ locationId: "l" }] }] });
    expect(prisma.withTenant).toHaveBeenCalledTimes(5);
  });
});
