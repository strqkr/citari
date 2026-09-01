import { createHash, randomBytes } from "node:crypto";
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { BookingStatus } from "../generated/prisma/enums.js";
import { PrismaService, type TransactionClient } from "../database/prisma.service.js";
const hash = (token: string): string => createHash("sha256").update(token).digest("hex");
const tokenTenant = (token: string): string => {
  const tenantId = token.split(".", 1)[0];
  if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new NotFoundException("Tracking link is invalid or expired");
  }
  return tenantId;
};
const PUBLIC_MUTABLE: BookingStatus[] = [BookingStatus.HELD, BookingStatus.PENDING, BookingStatus.CONFIRMED];
@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}
  async issue(tenantId: string, bookingId: string): Promise<{ token: string; expiresAt: Date }> {
    const booking = await this.prisma.booking.findFirst({ where: { tenantId, id: bookingId }, select: { id: true } });
    if (!booking) throw new NotFoundException("Booking not found");
    const token = `${tenantId}.${randomBytes(32).toString("base64url")}`, expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.bookingPublicToken.create({ data: { tenantId, bookingId, tokenHash: hash(token), expiresAt } });
    return { token, expiresAt };
  }
  async get(token: string) {
    const tenantId = tokenTenant(token);
    const record = await this.prisma.withTenant(tenantId, (tx) => tx.bookingPublicToken.findFirst({ where: { tenantId, tokenHash: hash(token) }, include: { booking: { select: { id: true, version: true, status: true, startAt: true, endAt: true, serviceName: true, serviceDurationMinutes: true, currency: true, servicePrice: true, location: { select: { name: true, addressLine1: true, addressLine2: true, province: true, canton: true, district: true } }, tenant: { select: { name: true, logoUrl: true, publicMessage: true, timezone: true, locale: true } } } } } }));
    if (!record || record.revokedAt || record.expiresAt <= new Date()) throw new NotFoundException("Tracking link is invalid or expired");
    return record.booking;
  }
  async cancel(token: string, version: number, reason?: string) {
    return this.withValidToken(token, async (tx, tenantId, bookingId) => {
      const booking = await tx.booking.findFirst({ where: { tenantId, id: bookingId } });
      if (!booking || !PUBLIC_MUTABLE.includes(booking.status)) throw new UnprocessableEntityException("Booking cannot be cancelled");
      const changed = await tx.booking.updateMany({ where: { tenantId, id: bookingId, version, status: booking.status }, data: { status: BookingStatus.CANCELLED, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Booking was changed by another request");
      await this.record(tx, tenantId, bookingId, booking.status, BookingStatus.CANCELLED, reason);
      return tx.booking.findFirstOrThrow({ where: { tenantId, id: bookingId } });
    });
  }
  async reschedule(token: string, version: number, rawStart: string, reason?: string) {
    return this.withValidToken(token, async (tx, tenantId, bookingId) => {
      const booking = await tx.booking.findFirst({ where: { tenantId, id: bookingId } });
      if (!booking || !PUBLIC_MUTABLE.includes(booking.status)) throw new UnprocessableEntityException("Booking cannot be rescheduled");
      const startAt = new Date(rawStart), endAt = new Date(startAt.getTime() + booking.serviceDurationMinutes * 60_000);
      if (startAt <= new Date()) throw new UnprocessableEntityException("Booking start must be in the future");
      await this.assertAvailable(tx, tenantId, booking.locationId, bookingId, startAt, endAt);
      const changed = await tx.booking.updateMany({ where: { tenantId, id: bookingId, version, status: booking.status }, data: { startAt, endAt, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Booking was changed by another request");
      await tx.auditEvent.create({ data: { tenantId, actorUserId: null, action: "booking.public_rescheduled", entityType: "Booking", entityId: bookingId, reason: reason ?? null, metadata: { previousStartAt: booking.startAt.toISOString(), startAt: startAt.toISOString() } } });
      return tx.booking.findFirstOrThrow({ where: { tenantId, id: bookingId } });
    });
  }
  private async withValidToken<T>(token: string, operation: (tx: TransactionClient, tenantId: string, bookingId: string) => Promise<T>): Promise<T> {
    const tenantId = tokenTenant(token), tokenHash = hash(token);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const record = await tx.bookingPublicToken.findFirst({ where: { tenantId, tokenHash, revokedAt: null, expiresAt: { gt: new Date() } }, select: { bookingId: true } });
      if (!record) throw new NotFoundException("Tracking link is invalid or expired");
      return operation(tx, tenantId, record.bookingId);
    });
  }
  private async record(tx: TransactionClient, tenantId: string, bookingId: string, fromStatus: BookingStatus, toStatus: BookingStatus, reason?: string): Promise<void> {
    await tx.bookingStatusHistory.create({ data: { tenantId, bookingId, fromStatus, toStatus, actorId: null, reason: reason ?? null } });
    await tx.auditEvent.create({ data: { tenantId, actorUserId: null, action: "booking.public_cancelled", entityType: "Booking", entityId: bookingId, reason: reason ?? null } });
  }
  private async assertAvailable(tx: TransactionClient, tenantId: string, locationId: string, bookingId: string, startAt: Date, endAt: Date): Promise<void> {
    const [booking, block, location] = await Promise.all([
      tx.booking.findFirst({ where: { tenantId, locationId, id: { not: bookingId }, status: { in: [BookingStatus.HELD, BookingStatus.PENDING, BookingStatus.CONFIRMED] }, startAt: { lt: endAt }, endAt: { gt: startAt } }, select: { id: true } }),
      tx.availabilityBlock.findFirst({ where: { tenantId, locationId, startsAt: { lt: endAt }, endsAt: { gt: startAt } }, select: { id: true } }),
      tx.location.findFirst({ where: { tenantId, id: locationId }, select: { timezone: true, tenant: { select: { timezone: true } }, businessHours: true } })
    ]);
    if (booking || block) throw new ConflictException("The requested time is no longer available");
    if (!location) throw new ConflictException("The requested time is no longer available");
    const timezone = location.timezone ?? location.tenant.timezone;
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(startAt);
    const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((value) => value.type === type)?.value ?? "";
    const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const hours = location.businessHours.find((entry) => entry.dayOfWeek === days[part("weekday")]);
    const localMinute = Number(part("hour")) * 60 + Number(part("minute"));
    const minute = (value: Date | null): number => value ? value.getUTCHours() * 60 + value.getUTCMinutes() : -1;
    if (!hours || hours.isClosed || localMinute < minute(hours.openTime) || localMinute + Math.ceil((endAt.getTime() - startAt.getTime()) / 60_000) > minute(hours.closeTime)) throw new ConflictException("The requested time is outside business hours");
  }
}
