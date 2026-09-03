import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { ConflictException, GoneException, Inject, Injectable, NotFoundException, UnauthorizedException, UnprocessableEntityException } from "@nestjs/common";
import { openSecret, sealSecret } from "../common/secret-box.js";
import { ENVIRONMENT, type Environment } from "../config/environment.js";
import { PrismaService, type TransactionClient } from "../database/prisma.service.js";
import { BookingStatus } from "../generated/prisma/enums.js";
import { NotificationOutboxService } from "../notifications/notification-outbox.service.js";
import { SchedulingIntegrityService } from "../scheduling/scheduling-integrity.service.js";
import { customerMutationViolation } from "./booking-state-machine.js";

const hash = (token: string): string => createHash("sha256").update(token).digest("hex");
const CHALLENGE_TTL_MS = 10 * 60_000;
const ACCESS_TTL_MS = 15 * 60_000;
const MAX_CODE_ATTEMPTS = 5;
const GRANT_CONTEXT = "citari:booking-access-grant:v1";
const tokenTenant = (token: string): string => {
  const tenantId = token.split(".", 1)[0];
  if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new NotFoundException("Tracking link is invalid or expired");
  }
  return tenantId;
};
@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduling: SchedulingIntegrityService,
    private readonly notifications: NotificationOutboxService,
    @Inject(ENVIRONMENT) private readonly env: Environment
  ) {}

  async issue(tenantId: string, bookingId: string): Promise<{ token: string; expiresAt: Date }> {
    const booking = await this.prisma.booking.findFirst({ where: { tenantId, id: bookingId }, select: { id: true } });
    if (!booking) throw new NotFoundException("Booking not found");
    const token = `${tenantId}.${randomBytes(32).toString("base64url")}`, expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.bookingPublicToken.create({ data: { tenantId, bookingId, tokenHash: hash(token), expiresAt } });
    return { token, expiresAt };
  }

  async requestVerification(token: string): Promise<{ challengeToken: string; expiresAt: string; destination: string }> {
    const tenantId = tokenTenant(token);
    return this.prisma.withTenant(tenantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booking-access-request:${hash(token)}`}, 0))`;
      const record = await tx.bookingPublicToken.findFirst({
        where: { tenantId, tokenHash: hash(token), revokedAt: null, expiresAt: { gt: new Date() } },
        select: { bookingId: true, booking: { select: { customer: { select: { email: true } } } } }
      });
      const email = record?.booking.customer.email;
      if (!record) throw new NotFoundException("Tracking link is invalid or expired");
      if (!email) throw new UnprocessableEntityException("This booking has no verified delivery channel");

      const now = new Date();
      await tx.bookingAccessChallenge.updateMany({ where: { tenantId, bookingId: record.bookingId, consumedAt: null }, data: { consumedAt: now } });
      const challengeToken = randomBytes(32).toString("base64url");
      const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
      const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
      await tx.bookingAccessChallenge.create({ data: {
        tenantId,
        bookingId: record.bookingId,
        tokenHash: hash(challengeToken),
        codeHash: this.codeHash(challengeToken, code),
        expiresAt
      } });
      await this.notifications.enqueueBookingAccess(tx, tenantId, record.bookingId, email, code);
      await tx.auditEvent.create({ data: { tenantId, actorUserId: null, action: "booking.public_access_code_requested", entityType: "Booking", entityId: record.bookingId } });
      return { challengeToken, expiresAt: expiresAt.toISOString(), destination: this.maskEmail(email) };
    });
  }

  async verifyAccess(token: string, challengeToken: string, code: string): Promise<{ accessGrant: string; expiresAt: string }> {
    const tenantId = tokenTenant(token);
    return this.prisma.withTenant(tenantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booking-access-verify:${hash(challengeToken)}`}, 0))`;
      const [record, challenge] = await Promise.all([
        tx.bookingPublicToken.findFirst({ where: { tenantId, tokenHash: hash(token), revokedAt: null, expiresAt: { gt: new Date() } }, select: { bookingId: true } }),
        tx.bookingAccessChallenge.findUnique({ where: { tokenHash: hash(challengeToken) } })
      ]);
      if (!record) throw new NotFoundException("Tracking link is invalid or expired");
      if (challenge?.tenantId !== tenantId || challenge.bookingId !== record.bookingId) throw new UnauthorizedException("Verification code is invalid or expired");

      const codeMatches = this.equalDigest(challenge.codeHash, this.codeHash(challengeToken, code));
      const activeGrantExpiry = challenge.grantExpiresAt?.getTime();
      if (codeMatches && challenge.grantEncrypted && activeGrantExpiry && activeGrantExpiry > Date.now()) {
        return { accessGrant: openSecret(challenge.grantEncrypted, this.env.NOTIFICATION_ENCRYPTION_KEY, GRANT_CONTEXT), expiresAt: new Date(activeGrantExpiry).toISOString() };
      }
      if (challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= MAX_CODE_ATTEMPTS) {
        throw new GoneException("Verification code expired or was already used");
      }
      if (!codeMatches) {
        const attempts = challenge.attempts + 1;
        await tx.bookingAccessChallenge.updateMany({
          where: { id: challenge.id, attempts: challenge.attempts, consumedAt: null },
          data: { attempts: { increment: 1 }, ...(attempts >= MAX_CODE_ATTEMPTS ? { consumedAt: new Date() } : {}) }
        });
        throw new UnauthorizedException("Verification code is invalid or expired");
      }

      const accessGrant = randomBytes(32).toString("base64url");
      const grantExpiresAt = new Date(Date.now() + ACCESS_TTL_MS);
      const updated = await tx.bookingAccessChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, grantHash: null, expiresAt: { gt: new Date() }, attempts: { lt: MAX_CODE_ATTEMPTS } },
        data: {
          consumedAt: new Date(),
          grantHash: hash(accessGrant),
          grantEncrypted: sealSecret(accessGrant, this.env.NOTIFICATION_ENCRYPTION_KEY, GRANT_CONTEXT),
          grantExpiresAt
        }
      });
      if (updated.count !== 1) {
        const replay = await tx.bookingAccessChallenge.findUnique({ where: { id: challenge.id } });
        if (replay?.grantEncrypted && replay.grantExpiresAt && replay.grantExpiresAt > new Date()) {
          return { accessGrant: openSecret(replay.grantEncrypted, this.env.NOTIFICATION_ENCRYPTION_KEY, GRANT_CONTEXT), expiresAt: replay.grantExpiresAt.toISOString() };
        }
        throw new GoneException("Verification code expired or was already used");
      }
      await tx.auditEvent.create({ data: { tenantId, actorUserId: null, action: "booking.public_access_verified", entityType: "Booking", entityId: record.bookingId } });
      return { accessGrant, expiresAt: grantExpiresAt.toISOString() };
    });
  }

  get(token: string, accessGrant: string) {
    return this.withAuthorizedToken(token, accessGrant, (tx, tenantId, bookingId) => tx.booking.findFirstOrThrow({ where: { tenantId, id: bookingId }, select: {
      id: true, version: true, status: true, startAt: true, endAt: true, serviceName: true, serviceDurationMinutes: true, currency: true, servicePrice: true,
      location: { select: { name: true, addressLine1: true, addressLine2: true, province: true, canton: true, district: true } },
      tenant: { select: { name: true, logoUrl: true, publicMessage: true, timezone: true, locale: true } }
    } }));
  }

  async cancel(token: string, accessGrant: string, version: number, reason?: string) {
    return this.withAuthorizedToken(token, accessGrant, async (tx, tenantId, bookingId) => {
      const booking = await tx.booking.findFirst({ where: { tenantId, id: bookingId } });
      if (!booking) throw new UnprocessableEntityException("Booking cannot be cancelled");
      const violation = customerMutationViolation(booking.status, booking.startAt, booking.cancellationNoticeMinutes, "cancel");
      if (violation) throw new UnprocessableEntityException(violation);
      const changed = await tx.booking.updateMany({ where: { tenantId, id: bookingId, version, status: booking.status }, data: { status: BookingStatus.CANCELLED, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Booking was changed by another request");
      await this.record(tx, tenantId, bookingId, booking.status, BookingStatus.CANCELLED, reason);
      return tx.booking.findFirstOrThrow({ where: { tenantId, id: bookingId } });
    });
  }

  async reschedule(token: string, accessGrant: string, version: number, rawStart: string, reason?: string) {
    return this.withAuthorizedToken(token, accessGrant, async (tx, tenantId, bookingId) => {
      const booking = await tx.booking.findFirst({ where: { tenantId, id: bookingId } });
      if (!booking) throw new UnprocessableEntityException("Booking cannot be rescheduled");
      const now = new Date();
      const violation = customerMutationViolation(booking.status, booking.startAt, booking.rescheduleNoticeMinutes, "reschedule", now);
      if (violation) throw new UnprocessableEntityException(violation);
      const location = await tx.location.findFirst({ where: { tenantId, id: booking.locationId, isActive: true }, include: { businessHours: true, tenant: { select: { timezone: true } } } });
      if (!location) throw new ConflictException("The requested time is no longer available");
      const window = this.scheduling.window({ durationMinutes: booking.serviceDurationMinutes, bufferBeforeMinutes: booking.serviceBufferBeforeMinutes, bufferAfterMinutes: booking.serviceBufferAfterMinutes }, new Date(rawStart));
      this.scheduling.assertPolicy({ minimumLeadMinutes: booking.serviceMinimumLeadMinutes, maximumAdvanceDays: booking.serviceMaximumAdvanceDays, slotIntervalMinutes: booking.slotIntervalMinutes }, window.startAt, location.timezone ?? location.tenant.timezone, now);
      await this.scheduling.lockLocation(tx, tenantId, booking.locationId);
      await this.scheduling.assertAvailable(tx, { tenantId, tenantTimezone: location.tenant.timezone, location, window, excludeBookingId: bookingId, now });
      const changed = await tx.booking.updateMany({ where: { tenantId, id: bookingId, version, status: booking.status }, data: { ...window, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Booking was changed by another request");
      await tx.auditEvent.create({ data: { tenantId, actorUserId: null, action: "booking.public_rescheduled", entityType: "Booking", entityId: bookingId, reason: reason ?? null, metadata: { previousStartAt: booking.startAt.toISOString(), startAt: window.startAt.toISOString() } } });
      return tx.booking.findFirstOrThrow({ where: { tenantId, id: bookingId } });
    });
  }

  private async withAuthorizedToken<T>(token: string, accessGrant: string, operation: (tx: TransactionClient, tenantId: string, bookingId: string) => Promise<T>): Promise<T> {
    const tenantId = tokenTenant(token), tokenHash = hash(token), grantHash = hash(accessGrant);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const record = await tx.bookingPublicToken.findFirst({ where: { tenantId, tokenHash, revokedAt: null, expiresAt: { gt: new Date() } }, select: { bookingId: true } });
      if (!record) throw new NotFoundException("Tracking link is invalid or expired");
      const grant = await tx.bookingAccessChallenge.findFirst({ where: { tenantId, bookingId: record.bookingId, grantHash, consumedAt: { not: null }, grantExpiresAt: { gt: new Date() } }, select: { id: true } });
      if (!grant) throw new UnauthorizedException("Customer verification is required");
      return operation(tx, tenantId, record.bookingId);
    });
  }

  private codeHash(challengeToken: string, code: string): string {
    return createHmac("sha256", this.env.JWT_SECRET).update(`${challengeToken}:${code}`).digest("hex");
  }

  private equalDigest(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private maskEmail(email: string): string {
    const [local = "", domain = ""] = email.split("@");
    return `${local.slice(0, 1)}${"*".repeat(Math.min(8, Math.max(2, local.length - 1)))}@${domain}`;
  }

  private async record(tx: TransactionClient, tenantId: string, bookingId: string, fromStatus: BookingStatus, toStatus: BookingStatus, reason?: string): Promise<void> {
    await tx.bookingStatusHistory.create({ data: { tenantId, bookingId, fromStatus, toStatus, actorId: null, reason: reason ?? null } });
    await tx.auditEvent.create({ data: { tenantId, actorUserId: null, action: "booking.public_cancelled", entityType: "Booking", entityId: bookingId, reason: reason ?? null } });
  }
}
