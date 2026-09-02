import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AvailabilityService } from "./availability.service.js";

function setup(overrides: Record<string, unknown> = {}) {
  const tx = {
    availabilityBlock: {
      findMany: vi.fn().mockResolvedValue([{ id: "block" }]),
      create: vi.fn().mockResolvedValue({ id: "created" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    location: { findFirst: vi.fn().mockResolvedValue({ id: "location" }) },
    ...overrides
  };
  const prisma = { withTenant: vi.fn((_tenantId: string, operation: (client: typeof tx) => unknown) => operation(tx)) };
  const scheduling = { lockLocation: vi.fn(), assertBlockAvailable: vi.fn() };
  return { service: new AvailabilityService(prisma as never, scheduling as never), scheduling, tx };
}

describe("AvailabilityService", () => {
  it("lists overlapping blocks in tenant context", async () => {
    const { service, tx } = setup();
    const from = new Date("2026-09-01T08:00:00Z");
    const to = new Date("2026-09-01T18:00:00Z");
    await expect(service.list("tenant", { from, to, locationId: "location" })).resolves.toEqual([{ id: "block" }]);
    expect(tx.availabilityBlock.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant", locationId: "location" }) }));
  });

  it("rejects inverted list and create ranges", () => {
    const { service } = setup();
    const date = new Date("2026-09-01T08:00:00Z");
    expect(() => service.list("tenant", { from: date, to: date })).toThrow(BadRequestException);
    expect(() => service.create("tenant", { locationId: "location", startsAt: date, endsAt: date })).toThrow(BadRequestException);
  });

  it("creates a block only for an active tenant location", async () => {
    const { service, scheduling, tx } = setup();
    const input = { locationId: "location", startsAt: new Date("2026-09-01T08:00:00Z"), endsAt: new Date("2026-09-01T09:00:00Z"), reason: "maintenance" };
    await expect(service.create("tenant", input)).resolves.toEqual({ id: "created" });
    expect(scheduling.lockLocation).toHaveBeenCalledWith(tx, "tenant", "location");
    expect(scheduling.assertBlockAvailable).toHaveBeenCalledWith(tx, { tenantId: "tenant", locationId: "location", startsAt: input.startsAt, endsAt: input.endsAt });
    expect(tx.availabilityBlock.create).toHaveBeenCalledWith({ data: { tenantId: "tenant", ...input } });
  });

  it("rejects unknown locations and unknown blocks", async () => {
    const unknownLocation = setup({ location: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(unknownLocation.service.create("tenant", { locationId: "missing", startsAt: new Date("2026-09-01T08:00:00Z"), endsAt: new Date("2026-09-01T09:00:00Z") })).rejects.toBeInstanceOf(NotFoundException);
    const unknownBlock = setup({ availabilityBlock: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } });
    await expect(unknownBlock.service.remove("tenant", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
