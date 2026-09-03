import { ConflictException, UnprocessableEntityException } from "@nestjs/common";
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

  it("enforces lead time, horizon, local interval alignment, and IANA timezones", () => {
    const policy = { minimumLeadMinutes: 60, maximumAdvanceDays: 30, slotIntervalMinutes: 15 };
    const now = new Date("2030-01-01T10:00:00Z");
    expect(() => service.assertPolicy(policy, new Date("2030-01-01T11:00:00Z"), "America/Costa_Rica", now)).not.toThrow();
    expect(() => service.assertPolicy(policy, new Date("2030-01-01T10:45:00Z"), "America/Costa_Rica", now)).toThrow(UnprocessableEntityException);
    expect(() => service.assertPolicy(policy, new Date("2030-02-01T11:00:00Z"), "America/Costa_Rica", now)).toThrow(UnprocessableEntityException);
    expect(() => service.assertPolicy(policy, new Date("2030-01-01T11:07:00Z"), "America/Costa_Rica", now)).toThrow(UnprocessableEntityException);
    expect(() => service.assertPolicy(policy, new Date("2030-01-01T11:00:00Z"), "Not/A-Timezone", now)).toThrow(UnprocessableEntityException);
  });

  it("aligns real instants across Costa Rica and DST boundaries", () => {
    expect(service.firstAlignedSlot(new Date("2030-01-01T10:07:01Z"), "America/Costa_Rica", 15)).toEqual(new Date("2030-01-01T10:15:00Z"));
    expect(service.firstAlignedSlot(new Date("2026-03-08T06:53:00Z"), "America/New_York", 15)).toEqual(new Date("2026-03-08T07:00:00Z"));
    expect(service.firstAlignedSlot(new Date("2026-10-25T00:53:00Z"), "Europe/Madrid", 15)).toEqual(new Date("2026-10-25T01:00:00Z"));
    expect(service.firstAlignedSlot(new Date("2026-11-01T05:53:00Z"), "America/New_York", 15)).toEqual(new Date("2026-11-01T06:00:00Z"));
  });

  it("generates aligned slots while excluding occupied ranges", () => {
    const slots = service.availableSlots({
      service: { durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, minimumLeadMinutes: 0, maximumAdvanceDays: 30, slotIntervalMinutes: 15 },
      location: { id: "l", timezone: "UTC", businessHours: hours }, tenantTimezone: "UTC",
      from: new Date("2030-01-01T09:00:00Z"), to: new Date("2030-01-01T11:00:00Z"), now: new Date("2030-01-01T08:00:00Z"),
      occupied: [{ start: new Date("2030-01-01T09:30:00Z"), end: new Date("2030-01-01T10:00:00Z") }]
    });
    expect(slots).toEqual([new Date("2030-01-01T09:00:00Z"), new Date("2030-01-01T10:00:00Z"), new Date("2030-01-01T10:15:00Z"), new Date("2030-01-01T10:30:00Z")]);
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
