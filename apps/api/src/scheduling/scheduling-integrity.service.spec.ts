import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SchedulingIntegrityService } from "./scheduling-integrity.service.js";

const hours = [{ dayOfWeek: 2, isClosed: false, openTime: new Date("1970-01-01T08:00:00Z"), closeTime: new Date("1970-01-01T18:00:00Z") }];

describe("SchedulingIntegrityService", () => {
  const service = new SchedulingIntegrityService();

  it("includes immutable service buffers in the occupied range", () => {
    expect(service.window({ durationMinutes: 30, bufferBeforeMinutes: 10, bufferAfterMinutes: 15 }, new Date("2030-01-01T10:00:00Z"))).toEqual({
      startAt: new Date("2030-01-01T10:00:00Z"),
      endAt: new Date("2030-01-01T10:30:00Z"),
      occupiedStartAt: new Date("2030-01-01T09:50:00Z"),
      occupiedEndAt: new Date("2030-01-01T10:45:00Z")
    });
  });

  it("serializes a location and expires stale holds before checking", async () => {
    const tx = { $executeRaw: vi.fn(), slotHold: { updateMany: vi.fn() } };
    await service.lockLocation(tx as never, "tenant", "location", new Date("2030-01-01T09:00:00Z"));
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.slotHold.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "EXPIRED" } }));
  });

  it("rejects booking, hold, and availability-block collisions", async () => {
    const window = service.window({ durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 }, new Date("2030-01-01T10:00:00Z"));
    for (const collision of ["booking", "hold", "block"] as const) {
      const tx = {
        booking: { findFirst: vi.fn().mockResolvedValue(collision === "booking" ? { id: "b" } : null) },
        slotHold: { findFirst: vi.fn().mockResolvedValue(collision === "hold" ? { id: "h" } : null) },
        availabilityBlock: { findFirst: vi.fn().mockResolvedValue(collision === "block" ? { id: "a" } : null) }
      };
      await expect(service.assertAvailable(tx as never, { tenantId: "t", tenantTimezone: "UTC", location: { id: "l", timezone: "UTC", businessHours: hours }, window })).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it("rejects an availability block that overlaps an active booking or hold", async () => {
    for (const collision of ["booking", "hold"] as const) {
      const tx = {
        booking: { findFirst: vi.fn().mockResolvedValue(collision === "booking" ? { id: "b" } : null) },
        slotHold: { findFirst: vi.fn().mockResolvedValue(collision === "hold" ? { id: "h" } : null) }
      };
      await expect(service.assertBlockAvailable(tx as never, {
        tenantId: "t",
        locationId: "l",
        startsAt: new Date("2030-01-01T10:00:00Z"),
        endsAt: new Date("2030-01-01T11:00:00Z")
      })).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it("requires the full buffered range to remain inside one business day", () => {
    const valid = service.window({ durationMinutes: 30, bufferBeforeMinutes: 10, bufferAfterMinutes: 10 }, new Date("2030-01-01T10:00:00Z"));
    expect(() => service.assertBusinessHours({ id: "l", timezone: "UTC", businessHours: hours }, "UTC", valid)).not.toThrow();
    const outside = service.window({ durationMinutes: 30, bufferBeforeMinutes: 15, bufferAfterMinutes: 0 }, new Date("2030-01-01T08:00:00Z"));
    expect(() => service.assertBusinessHours({ id: "l", timezone: "UTC", businessHours: hours }, "UTC", outside)).toThrow(ConflictException);
  });
});
