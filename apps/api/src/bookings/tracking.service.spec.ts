import { createHmac } from "node:crypto";
import { ConflictException, NotFoundException, UnauthorizedException, UnprocessableEntityException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSecret } from "../common/secret-box.js";
import { SchedulingIntegrityService } from "../scheduling/scheduling-integrity.service.js";
import { TrackingService } from "./tracking.service.js";

describe("TrackingService", () => {
  const tenantId = "f9dd70d0-0f7b-497c-9d02-302859f65f1e";
  const token = `${tenantId}.secret-with-at-least-thirty-two-characters`;
  const grant = "grant-with-at-least-thirty-two-characters";
  const env = { JWT_SECRET: "j".repeat(32), NOTIFICATION_ENCRYPTION_KEY: "n".repeat(32) };
  let prisma: any;
  let notifications: { enqueueBookingAccess: ReturnType<typeof vi.fn> };
  let service: TrackingService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2029-01-01T09:00:00Z"));
    prisma = {
      booking: { findFirst: vi.fn(), updateMany: vi.fn(), findFirstOrThrow: vi.fn() },
      bookingPublicToken: { create: vi.fn(), findFirst: vi.fn() },
      bookingAccessChallenge: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
      bookingStatusHistory: { create: vi.fn() },
      auditEvent: { create: vi.fn() },
      slotHold: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn() },
      availabilityBlock: { findFirst: vi.fn() },
      location: { findFirst: vi.fn().mockResolvedValue({ id: "l", timezone: "UTC", tenant: { timezone: "UTC" }, businessHours: [{ dayOfWeek: 2, isClosed: false, openTime: new Date("1970-01-01T08:00:00Z"), closeTime: new Date("1970-01-01T18:00:00Z") }] }) },
      $executeRaw: vi.fn(),
      withTenant: vi.fn((_tenantId, operation) => operation(prisma))
    };
    notifications = { enqueueBookingAccess: vi.fn() };
    service = new TrackingService(prisma, new SchedulingIntegrityService(), notifications as never, env as never);
  });

  afterEach(() => vi.useRealTimers());

  it("stores only a digest and returns the one-time plaintext token", async () => {
    prisma.booking.findFirst.mockResolvedValue({ id: "b" });
    prisma.bookingPublicToken.create.mockResolvedValue({});
    const result = await service.issue(tenantId, "b");
    const stored = prisma.bookingPublicToken.create.mock.calls[0][0].data.tokenHash;
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
    expect(stored).not.toBe(result.token);
    expect(result.token.startsWith(`${tenantId}.`)).toBe(true);
  });

  it("sends a six-digit code and stores only its keyed digest", async () => {
    prisma.bookingPublicToken.findFirst.mockResolvedValue({ bookingId: "b", booking: { customer: { email: "customer@example.com" } } });
    const result = await service.requestVerification(token);
    expect(result.destination).toBe("c*******@example.com");
    const code = notifications.enqueueBookingAccess.mock.calls[0]?.[4];
    if (typeof code !== "string") throw new Error("Verification code was not queued");
    expect(code).toMatch(/^\d{6}$/);
    const stored = prisma.bookingAccessChallenge.create.mock.calls[0][0].data;
    expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.codeHash).not.toBe(code);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "booking.public_access_code_requested" }) });
  });

  it("exchanges the correct code for an encrypted, replay-safe short-lived grant", async () => {
    const challengeToken = "challenge-with-at-least-thirty-two-characters";
    const code = "123456";
    const challenge = {
      id: "c", tenantId, bookingId: "b", attempts: 0, consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000), grantEncrypted: null, grantExpiresAt: null,
      codeHash: createHmac("sha256", env.JWT_SECRET).update(`${challengeToken}:${code}`).digest("hex")
    };
    prisma.bookingPublicToken.findFirst.mockResolvedValue({ bookingId: "b" });
    prisma.bookingAccessChallenge.findUnique.mockResolvedValueOnce(challenge);
    prisma.bookingAccessChallenge.updateMany.mockResolvedValue({ count: 1 });
    const first = await service.verifyAccess(token, challengeToken, code);
    const stored = prisma.bookingAccessChallenge.updateMany.mock.calls[0][0].data;
    expect(stored.grantHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.grantEncrypted).not.toContain(first.accessGrant);
    expect(openSecret(stored.grantEncrypted, env.NOTIFICATION_ENCRYPTION_KEY, "citari:booking-access-grant:v1")).toBe(first.accessGrant);

    prisma.bookingAccessChallenge.findUnique.mockResolvedValueOnce({ ...challenge, consumedAt: new Date(), grantEncrypted: stored.grantEncrypted, grantExpiresAt: stored.grantExpiresAt });
    await expect(service.verifyAccess(token, challengeToken, code)).resolves.toEqual(first);
  });

  it("counts an invalid code and denies an absent grant", async () => {
    const challengeToken = "challenge-with-at-least-thirty-two-characters";
    prisma.bookingPublicToken.findFirst.mockResolvedValue({ bookingId: "b" });
    prisma.bookingAccessChallenge.findUnique.mockResolvedValue({
      id: "c", tenantId, bookingId: "b", attempts: 0, consumedAt: null, expiresAt: new Date(Date.now() + 60_000),
      grantEncrypted: null, grantExpiresAt: null,
      codeHash: createHmac("sha256", env.JWT_SECRET).update(`${challengeToken}:123456`).digest("hex")
    });
    await expect(service.verifyAccess(token, challengeToken, "654321")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.bookingAccessChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ attempts: { increment: 1 } }) }));
    prisma.bookingAccessChallenge.findFirst.mockResolvedValue(null);
    await expect(service.get(token, grant)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("returns the deliberately minimized projection only after a valid grant", async () => {
    const booking = { id: "b", status: "CONFIRMED" };
    prisma.bookingPublicToken.findFirst.mockResolvedValue({ bookingId: "b" });
    prisma.bookingAccessChallenge.findFirst.mockResolvedValue({ id: "grant" });
    prisma.booking.findFirstOrThrow.mockResolvedValue(booking);
    await expect(service.get(token, grant)).resolves.toBe(booking);
    expect(prisma.booking.findFirstOrThrow).toHaveBeenCalledWith(expect.objectContaining({ select: expect.not.objectContaining({ customer: expect.anything() }) }));
  });

  it("does not reveal malformed or unknown tracking tokens", async () => {
    await expect(service.get("secret", grant)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.withTenant).not.toHaveBeenCalled();
    prisma.bookingPublicToken.findFirst.mockResolvedValue(null);
    await expect(service.get(token, grant)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("cancels with optimistic concurrency, null actor, history and audit", async () => {
    authorize();
    prisma.booking.findFirst.mockResolvedValue({ id: "b", status: "CONFIRMED", startAt: new Date("2030-01-01T10:00:00Z"), cancellationNoticeMinutes: 0 });
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.findFirstOrThrow.mockResolvedValue({ id: "b", status: "CANCELLED" });
    await expect(service.cancel(token, grant, 4, "customer request")).resolves.toMatchObject({ status: "CANCELLED" });
    expect(prisma.bookingStatusHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: null, fromStatus: "CONFIRMED", toStatus: "CANCELLED" }) });
  });

  it("rejects terminal public cancellation and concurrent writes", async () => {
    authorize();
    prisma.booking.findFirst.mockResolvedValue({ id: "b", status: "COMPLETED", startAt: new Date("2030-01-01T10:00:00Z"), cancellationNoticeMinutes: 0 });
    await expect(service.cancel(token, grant, 1)).rejects.toBeInstanceOf(UnprocessableEntityException);
    prisma.booking.findFirst.mockResolvedValue({ id: "b", status: "PENDING", startAt: new Date("2030-01-01T10:00:00Z"), cancellationNoticeMinutes: 0 });
    prisma.booking.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.cancel(token, grant, 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it("reschedules publicly after grant, collision and block checks", async () => {
    authorize();
    prisma.booking.findFirst.mockResolvedValueOnce({ id: "b", status: "PENDING", locationId: "l", serviceDurationMinutes: 30, serviceBufferBeforeMinutes: 0, serviceBufferAfterMinutes: 0, serviceMinimumLeadMinutes: 60, serviceMaximumAdvanceDays: 365, rescheduleNoticeMinutes: 0, slotIntervalMinutes: 15, startAt: new Date("2029-01-01T10:00:00Z") }).mockResolvedValueOnce(null);
    prisma.availabilityBlock.findFirst.mockResolvedValue(null);
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.findFirstOrThrow.mockResolvedValue({ id: "b", version: 2 });
    await expect(service.reschedule(token, grant, 1, "2029-12-25T10:00:00Z", "later")).resolves.toMatchObject({ version: 2 });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: null, action: "booking.public_rescheduled" }) });
  });

  function authorize(): void {
    prisma.bookingPublicToken.findFirst.mockResolvedValue({ bookingId: "b" });
    prisma.bookingAccessChallenge.findFirst.mockResolvedValue({ id: "grant" });
  }
});
