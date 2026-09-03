import { createHash } from "node:crypto";
import { ConflictException, GoneException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sealSecret } from "../../common/secret-box.js";
import { PublicService } from "./public.service.js";

const tenant = { id: "f9dd70d0-0f7b-497c-9d02-302859f65f1e", slug: "shop", status: "ACTIVE", timezone: "UTC", currency: "CRC" };
const key = "n".repeat(32);
const env = { NOTIFICATION_ENCRYPTION_KEY: key };
const startAt = new Date("2030-01-01T10:00:00Z");
const window = { startAt, endAt: new Date("2030-01-01T10:30:00Z"), occupiedStartAt: startAt, occupiedEndAt: new Date("2030-01-01T10:30:00Z") };
const requestHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("PublicService", () => {
  let tx: any;
  let prisma: any;
  let scheduling: any;
  let service: PublicService;

  beforeEach(() => {
    tx = {
      idempotencyKey: { deleteMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      serviceCategory: { findMany: vi.fn().mockResolvedValue([{ id: "category" }]) },
      service: { findFirst: vi.fn() },
      location: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([{ id: "location" }]) },
      booking: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
      slotHold: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
      availabilityBlock: { findMany: vi.fn().mockResolvedValue([]) },
      customer: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      bookingStatusHistory: { create: vi.fn() },
      auditEvent: { create: vi.fn() },
      bookingPublicToken: { create: vi.fn() },
      bookingConfirmation: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
      $executeRaw: vi.fn().mockResolvedValue(1)
    };
    prisma = { tenant: { findFirst: vi.fn().mockResolvedValue(tenant) }, withTenant: vi.fn((_tenantId: string, operation: (client: typeof tx) => unknown) => operation(tx)) };
    scheduling = { window: vi.fn().mockReturnValue(window), lockLocation: vi.fn(), assertAvailable: vi.fn(), assertBusinessHours: vi.fn() };
    service = new PublicService(prisma, scheduling, env as never);
  });

  it("returns only an active public tenant and its catalog", async () => {
    await expect(service.tenant("shop")).resolves.toEqual(tenant);
    await expect(service.services("shop")).resolves.toEqual([{ id: "category" }]);
    await expect(service.locations("shop")).resolves.toEqual([{ id: "location" }]);
  });

  it("acquires an expiring hold and stores only its digest", async () => {
    const input = { serviceId: "s", locationId: "l", startAt };
    tx.idempotencyKey.findUnique.mockResolvedValue({ requestHash: requestHash(input), responseBody: null, responseBodyEncrypted: null });
    tx.service.findFirst.mockResolvedValue({ id: "s", durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 });
    tx.location.findFirst.mockResolvedValue({ id: "l", timezone: "UTC", businessHours: [] });
    const result = await service.createHold("shop", input, "hold-idempotency-key");
    const stored = tx.slotHold.create.mock.calls[0][0].data;
    expect(result.holdToken).toHaveLength(43);
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.tokenHash).not.toBe(result.holdToken);
    expect(scheduling.lockLocation).toHaveBeenCalled();
    expect(tx.idempotencyKey.update.mock.calls[0][0].data.responseBodyEncrypted).not.toContain(result.holdToken);
  });

  it("consumes a matching hold and returns only a one-use confirmation nonce", async () => {
    const input = { serviceId: "s", locationId: "l", startAt, holdToken: "h".repeat(43), customer: { firstName: "A", lastName: "B", email: "a@b.com", consent: true as const } };
    tx.idempotencyKey.findUnique.mockResolvedValue({ requestHash: requestHash(input), responseBody: null, responseBodyEncrypted: null });
    tx.service.findFirst.mockResolvedValue({ id: "s", name: "Care", durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, price: null, currency: "CRC" });
    tx.location.findFirst.mockResolvedValue({ id: "l", timezone: "UTC", businessHours: [] });
    tx.slotHold.findFirst.mockResolvedValue({ id: "hold" });
    tx.slotHold.updateMany.mockResolvedValue({ count: 1 });
    tx.customer.findFirst.mockResolvedValue(null);
    tx.customer.create.mockResolvedValue({ id: "customer" });
    tx.booking.create.mockResolvedValue({ id: "booking", status: "PENDING" });
    const result = await service.createBooking("shop", input, "booking-idempotency-key");
    expect(result).toEqual({ confirmationNonce: expect.any(String), expiresAt: expect.any(String) });
    expect(result).not.toHaveProperty("trackingToken");
    expect(tx.bookingPublicToken.create.mock.calls[0][0].data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tx.bookingConfirmation.create.mock.calls[0][0].data.payloadEncrypted).not.toContain(tenant.id);
    expect(tx.slotHold.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "CONSUMED" } }));
  });

  it("rejects a missing or expired hold", async () => {
    const input = { serviceId: "s", locationId: "l", startAt, holdToken: "h".repeat(43), customer: { firstName: "A", lastName: "B", email: "a@b.com", phone: "12345", consent: true as const } };
    tx.idempotencyKey.findUnique.mockResolvedValue({ requestHash: requestHash(input), responseBody: null, responseBodyEncrypted: null });
    tx.service.findFirst.mockResolvedValue({ id: "s", durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 });
    tx.location.findFirst.mockResolvedValue({ id: "l", timezone: "UTC", businessHours: [] });
    tx.slotHold.findFirst.mockResolvedValue(null);
    await expect(service.createBooking("shop", input, "booking-idempotency-key")).rejects.toBeInstanceOf(GoneException);
  });

  it("consumes a confirmation once and decrypts the tracking result", async () => {
    const input = { confirmationNonce: "c".repeat(43) };
    tx.idempotencyKey.findUnique.mockResolvedValue({ requestHash: requestHash(input), responseBody: null, responseBodyEncrypted: null });
    tx.bookingConfirmation.findUnique.mockResolvedValue({
      id: "confirmation", tenantId: tenant.id, consumedAt: null, expiresAt: new Date(Date.now() + 60_000),
      payloadEncrypted: sealSecret(JSON.stringify({ trackingToken: "tracking-secret" }), key, "citari:booking-confirmation:v1"),
      booking: { id: "booking", customer: { firstName: "A" } }
    });
    tx.bookingConfirmation.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.consumeConfirmation("shop", input, "confirmation-key-1")).resolves.toMatchObject({ trackingToken: "tracking-secret", booking: { id: "booking" } });
    tx.bookingConfirmation.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.consumeConfirmation("shop", input, "confirmation-key-2")).rejects.toBeInstanceOf(GoneException);
  });

  it("rejects reused idempotency keys with a different request", async () => {
    const input = { serviceId: "s", locationId: "l", startAt };
    tx.$executeRaw.mockResolvedValue(0);
    tx.idempotencyKey.findUnique.mockResolvedValue({ requestHash: "different", responseBody: null, responseBodyEncrypted: null });
    await expect(service.createHold("shop", input, "hold-idempotency-key")).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not disclose inactive tenants", async () => {
    prisma.tenant.findFirst.mockResolvedValue(null);
    await expect(service.tenant("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
