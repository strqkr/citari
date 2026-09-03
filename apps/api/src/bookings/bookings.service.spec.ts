import { ConflictException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingStatus } from "../generated/prisma/enums.js";
import { SchedulingIntegrityService } from "../scheduling/scheduling-integrity.service.js";
import { BookingsService } from "./bookings.service.js";

const servicePolicy = { minimumLeadMinutes: 60, maximumAdvanceDays: 365, cancellationNoticeMinutes: 30, rescheduleNoticeMinutes: 60, slotIntervalMinutes: 15 };
const bookingPolicy = { serviceMinimumLeadMinutes: 60, serviceMaximumAdvanceDays: 365, cancellationNoticeMinutes: 30, rescheduleNoticeMinutes: 60, slotIntervalMinutes: 15 };
const hours = [{ dayOfWeek: 2, isClosed: false, openTime: new Date("1970-01-01T08:00:00Z"), closeTime: new Date("1970-01-01T18:00:00Z") }];

describe("BookingsService", () => {
  let tx: any;
  let service: BookingsService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2029-01-01T09:00:00Z"));
    tx = {
      booking: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findFirstOrThrow: vi.fn() },
      slotHold: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
      availabilityBlock: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
      customer: { findFirst: vi.fn() }, service: { findFirst: vi.fn() }, location: { findFirst: vi.fn() },
      bookingStatusHistory: { create: vi.fn() }, auditEvent: { create: vi.fn() }, $executeRaw: vi.fn()
    };
    service = new BookingsService({ withTenant: vi.fn((_id, operation) => operation(tx)) } as never, new SchedulingIntegrityService());
  });

  afterEach(() => vi.useRealTimers());

  it("paginates only the tenant's bookings", async () => {
    tx.booking.findMany.mockResolvedValue([]); tx.booking.count.mockResolvedValue(0);
    await expect(service.list("t", { page: 2, limit: 10 })).resolves.toEqual({ items: [], page: 2, limit: 10, total: 0 });
    expect(tx.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "t" }), skip: 10, take: 10 }));
  });

  it("does not disclose cross-tenant bookings", async () => {
    tx.booking.findFirst.mockResolvedValue(null);
    await expect(service.get("t", "b")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("generates reschedule availability from the booking's immutable policy", async () => {
    tx.booking.findFirst.mockResolvedValue({ id: "b", status: BookingStatus.CONFIRMED, locationId: "l", serviceDurationMinutes: 30, serviceBufferBeforeMinutes: 0, serviceBufferAfterMinutes: 0, ...bookingPolicy });
    tx.booking.findMany.mockResolvedValue([]);
    tx.location.findFirst.mockResolvedValue({ id: "l", timezone: "UTC", tenant: { timezone: "UTC" }, businessHours: hours });
    const result = await service.availability("t", "b", "2029-01-02T09:00:00Z", "2029-01-02T11:00:00Z");
    expect(result.timezone).toBe("UTC");
    expect(result.slots).toEqual([new Date("2029-01-02T09:00:00Z"), new Date("2029-01-02T09:15:00Z"), new Date("2029-01-02T09:30:00Z"), new Date("2029-01-02T09:45:00Z"), new Date("2029-01-02T10:00:00Z"), new Date("2029-01-02T10:15:00Z"), new Date("2029-01-02T10:30:00Z")]);
  });

  it("creates immutable service and policy snapshots with history", async () => {
    tx.customer.findFirst.mockResolvedValue({ id: "c" });
    tx.service.findFirst.mockResolvedValue({ id: "s", durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, name: "Cut", price: null, currency: "CRC", ...servicePolicy });
    tx.location.findFirst.mockResolvedValue({ id: "l", timezone: "UTC", tenant: { timezone: "UTC" }, businessHours: [{ ...hours[0], dayOfWeek: 1 }] });
    tx.booking.findFirst.mockResolvedValue(null); tx.booking.create.mockResolvedValue({ id: "b" });
    await service.create("t", "u", { customerId: "c", serviceId: "s", locationId: "l", startAt: "2029-01-01T10:00:00Z" });
    expect(tx.booking.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: "t", serviceName: "Cut", serviceDurationMinutes: 30, serviceMinimumLeadMinutes: 60, cancellationNoticeMinutes: 30 }) });
    expect(tx.bookingStatusHistory.create).toHaveBeenCalled(); expect(tx.auditEvent.create).toHaveBeenCalled();
  });

  it("rejects unavailable references", async () => {
    tx.customer.findFirst.mockResolvedValue(null); tx.service.findFirst.mockResolvedValue(null); tx.location.findFirst.mockResolvedValue(null);
    await expect(service.create("t", "u", { customerId: "c", serviceId: "s", locationId: "l", startAt: "2029-01-01T10:00:00Z" })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it.each(["booking", "block"] as const)("rejects a %s collision", async (collision) => {
    tx.customer.findFirst.mockResolvedValue({ id: "c" });
    tx.service.findFirst.mockResolvedValue({ id: "s", name: "Cut", price: null, currency: "CRC", durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, ...servicePolicy });
    tx.location.findFirst.mockResolvedValue({ id: "l", timezone: "UTC", tenant: { timezone: "UTC" }, businessHours: [{ ...hours[0], dayOfWeek: 1 }] });
    tx.booking.findFirst.mockResolvedValue(collision === "booking" ? { id: "collision" } : null);
    tx.availabilityBlock.findFirst.mockResolvedValue(collision === "block" ? { id: "blocked" } : null);
    await expect(service.create("t", "u", { customerId: "c", serviceId: "s", locationId: "l", startAt: "2029-01-01T10:00:00Z" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("enforces the transition state machine", async () => {
    tx.booking.findFirst.mockResolvedValue({ status: BookingStatus.COMPLETED, startAt: new Date(), endAt: new Date() });
    await expect(service.transition("t", "b", "u", BookingStatus.CONFIRMED, 1)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("prevents completion before the scheduled end", async () => {
    tx.booking.findFirst.mockResolvedValue({ status: BookingStatus.CONFIRMED, startAt: new Date("2029-01-01T09:00:00Z"), endAt: new Date("2029-01-01T10:00:00Z") });
    await expect(service.transition("t", "b", "u", BookingStatus.COMPLETED, 1)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("detects optimistic transition conflicts", async () => {
    tx.booking.findFirst.mockResolvedValue({ status: BookingStatus.PENDING, startAt: new Date(), endAt: new Date() }); tx.booking.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.transition("t", "b", "u", BookingStatus.CONFIRMED, 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it("persists an allowed transition and audit history", async () => {
    tx.booking.findFirst.mockResolvedValue({ status: BookingStatus.PENDING, startAt: new Date(), endAt: new Date() }); tx.booking.updateMany.mockResolvedValue({ count: 1 }); tx.booking.findFirstOrThrow.mockResolvedValue({ status: BookingStatus.CONFIRMED });
    await expect(service.transition("t", "b", "u", BookingStatus.CONFIRMED, 1, "ok")).resolves.toMatchObject({ status: BookingStatus.CONFIRMED });
    expect(tx.bookingStatusHistory.create).toHaveBeenCalled();
  });

  it("rejects rescheduling missing or terminal bookings", async () => {
    tx.booking.findFirst.mockResolvedValueOnce(null);
    await expect(service.reschedule("t", "b", "u", 1, "2030-01-01T10:00:00Z")).rejects.toBeInstanceOf(NotFoundException);
    tx.booking.findFirst.mockResolvedValueOnce({ status: BookingStatus.CANCELLED });
    await expect(service.reschedule("t", "b", "u", 1, "2030-01-01T10:00:00Z")).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("rejects past reschedules", async () => {
    tx.booking.findFirst.mockResolvedValue({ status: BookingStatus.CONFIRMED, locationId: "l", serviceDurationMinutes: 30, serviceBufferBeforeMinutes: 0, serviceBufferAfterMinutes: 0, ...bookingPolicy });
    tx.location.findFirst.mockResolvedValue({ id: "l", timezone: "UTC", tenant: { timezone: "UTC" }, businessHours: hours });
    await expect(service.reschedule("t", "b", "u", 1, "2020-01-01T10:00:00Z")).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it.each([[1, "resolves"], [0, "conflicts"]] as const)("reschedules with optimistic result %i", async (count, outcome) => {
    tx.booking.findFirst.mockResolvedValueOnce({ id: "b", status: BookingStatus.CONFIRMED, locationId: "l", serviceDurationMinutes: 30, serviceBufferBeforeMinutes: 0, serviceBufferAfterMinutes: 0, startAt: new Date("2029-01-01T10:00:00Z"), ...bookingPolicy }).mockResolvedValueOnce(null);
    tx.location.findFirst.mockResolvedValue({ id: "l", timezone: "UTC", tenant: { timezone: "UTC" }, businessHours: hours });
    tx.booking.updateMany.mockResolvedValue({ count }); tx.booking.findFirstOrThrow.mockResolvedValue({ id: "b", version: 2 });
    const result = service.reschedule("t", "b", "u", 1, "2029-12-25T10:00:00Z");
    if (outcome === "resolves") { await expect(result).resolves.toMatchObject({ version: 2 }); expect(tx.auditEvent.create).toHaveBeenCalled(); }
    else await expect(result).rejects.toBeInstanceOf(ConflictException);
  });
});
