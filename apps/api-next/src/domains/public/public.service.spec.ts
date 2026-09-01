import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PublicService } from "./public.service.js";

const tenant = { id: "f9dd70d0-0f7b-497c-9d02-302859f65f1e", slug: "shop", status: "ACTIVE", timezone: "UTC", currency: "CRC" };
const hours = [{ dayOfWeek: 2, isClosed: false, openTime: new Date("1970-01-01T08:00:00Z"), closeTime: new Date("1970-01-01T18:00:00Z") }];

describe("PublicService", () => {
  it("returns only an active public tenant and its catalog", async () => {
    const tx = { serviceCategory: { findMany: vi.fn().mockResolvedValue([{ id: "c" }]) } };
    const prisma = { tenant: { findFirst: vi.fn().mockResolvedValue(tenant) }, withTenant: vi.fn((_tenantId: string, operation: (client: typeof tx) => unknown) => operation(tx)) };
    const service = new PublicService(prisma as never);
    await expect(service.tenant("shop")).resolves.toEqual(tenant);
    await expect(service.services("shop")).resolves.toEqual([{ id: "c" }]);
  });

  it("creates an auditable idempotent booking and stores only a token hash", async () => {
    const catalogService = { id: "s", name: "Care", durationMinutes: 30, price: null, currency: "CRC" };
    const location = { id: "l", timezone: "UTC", businessHours: hours };
    const customer = { id: "c" }, booking = { id: "b", status: "PENDING" };
    const tx = {
      idempotencyKey: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() }, service: { findFirst: vi.fn().mockResolvedValue(catalogService) },
      location: { findFirst: vi.fn().mockResolvedValue(location) }, booking: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(booking) },
      customer: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(customer), update: vi.fn() }, bookingStatusHistory: { create: vi.fn() },
      auditEvent: { create: vi.fn() }, bookingPublicToken: { create: vi.fn() }, availabilityBlock: { findFirst: vi.fn().mockResolvedValue(null) }
    };
    const prisma = { tenant: { findFirst: vi.fn().mockResolvedValue(tenant) }, withTenant: vi.fn((_tenantId: string, operation: (client: typeof tx) => unknown) => operation(tx)) };
    const result = await new PublicService(prisma as never).createBooking("shop", { serviceId: "s", locationId: "l", startAt: new Date("2030-01-01T10:00:00Z"), customer: { firstName: "A", lastName: "B", email: "a@b.com", consent: true } }, "1234567890123456") as { trackingToken: string };
    expect(result.trackingToken.startsWith(`${tenant.id}.`)).toBe(true);
    const stored = tx.bookingPublicToken.create.mock.calls[0]?.[0] as { data: { tokenHash: string } };
    expect(stored.data.tokenHash).not.toBe(result.trackingToken);
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUserId: null }) }));
  });

  it("rejects reused idempotency keys with a different request", async () => {
    const tx = { idempotencyKey: { findUnique: vi.fn().mockResolvedValue({ requestHash: "different", responseBody: { bookingId: "b" } }) } };
    const prisma = { tenant: { findFirst: vi.fn().mockResolvedValue(tenant) }, withTenant: vi.fn((_tenantId: string, operation: (client: typeof tx) => unknown) => operation(tx)) };
    await expect(new PublicService(prisma as never).createBooking("shop", { serviceId: "s", locationId: "l", startAt: new Date(), customer: { firstName: "A", lastName: "B", phone: "12345", consent: true } }, "1234567890123456")).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not disclose inactive tenants", async () => {
    const prisma = { tenant: { findFirst: vi.fn().mockResolvedValue(null) } };
    await expect(new PublicService(prisma as never).tenant("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
