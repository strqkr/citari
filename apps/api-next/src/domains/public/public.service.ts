import { createHash, randomBytes } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService, type TransactionClient } from "../../database/prisma.service.js";
import type { z } from "zod";
import type { availabilityQuerySchema, publicBookingSchema } from "./public.schemas.js";

type AvailabilityInput = z.infer<typeof availabilityQuerySchema>;
type BookingInput = z.infer<typeof publicBookingSchema>;
const activeStatuses = ["HELD", "PENDING", "CONFIRMED"] as const;
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

function localParts(at: Date, timezone: string): { dayOfWeek: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dayOfWeek: days[value("weekday")] ?? -1, minute: Number(value("hour")) * 60 + Number(value("minute")) };
}

function timeMinute(value: Date | null): number { return value ? value.getUTCHours() * 60 + value.getUTCMinutes() : -1; }

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async tenant(slug: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { slug, status: "ACTIVE" }, select: {
      name: true, slug: true, timezone: true, locale: true, currency: true, description: true, logoUrl: true, publicMessage: true,
      contacts: { where: { isPrimary: true, verifiedAt: { not: null } }, select: { kind: true, value: true } }
    } });
    if (!tenant) throw new NotFoundException("Business was not found");
    return tenant;
  }

  async services(slug: string) {
    const tenant = await this.activeTenant(slug);
    return this.prisma.withTenant(tenant.id, (tx) => tx.serviceCategory.findMany({
      where: { tenantId: tenant.id, isActive: true, services: { some: { isActive: true } } },
      select: { id: true, name: true, description: true, services: { where: { isActive: true }, select: { id: true, name: true, description: true, durationMinutes: true, price: true, currency: true, showPrice: true }, orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" }
    }));
  }

  async availability(slug: string, input: AvailabilityInput) {
    const tenant = await this.activeTenant(slug);
    return this.prisma.withTenant(tenant.id, async (tx) => {
      const [service, location, bookings, blocks] = await Promise.all([
        tx.service.findFirst({ where: { id: input.serviceId, tenantId: tenant.id, isActive: true } }),
        tx.location.findFirst({ where: { id: input.locationId, tenantId: tenant.id, isActive: true }, include: { businessHours: true } }),
        tx.booking.findMany({ where: { tenantId: tenant.id, locationId: input.locationId, status: { in: [...activeStatuses] }, startAt: { lt: input.to }, endAt: { gt: input.from } }, select: { startAt: true, endAt: true } }),
        tx.availabilityBlock.findMany({ where: { tenantId: tenant.id, locationId: input.locationId, startsAt: { lt: input.to }, endsAt: { gt: input.from } }, select: { startsAt: true, endsAt: true } })
      ]);
      if (!service || !location) throw new NotFoundException("Service or location was not found");
      const timezone = location.timezone ?? tenant.timezone;
      const occupied = [...bookings.map((item) => ({ start: item.startAt, end: item.endAt })), ...blocks.map((item) => ({ start: item.startsAt, end: item.endsAt }))];
      const durationMinutes = service.durationMinutes + service.bufferBeforeMinutes + service.bufferAfterMinutes;
      const slots: Date[] = [];
      for (let cursor = new Date(input.from); cursor < input.to; cursor = new Date(cursor.getTime() + 15 * 60_000)) {
        const end = new Date(cursor.getTime() + durationMinutes * 60_000), local = localParts(cursor, timezone);
        const hours = location.businessHours.find((item) => item.dayOfWeek === local.dayOfWeek);
        if (hours && !hours.isClosed && local.minute >= timeMinute(hours.openTime) && local.minute + durationMinutes <= timeMinute(hours.closeTime) && end <= input.to && !occupied.some((item) => cursor < item.end && end > item.start)) slots.push(new Date(cursor));
      }
      return { timezone, slots };
    });
  }

  async createBooking(slug: string, input: BookingInput, idempotencyKey: string) {
    const tenant = await this.activeTenant(slug);
    const keyHash = digest(idempotencyKey), requestHash = digest(JSON.stringify(input)), scope = `public-booking:${tenant.id}`;
    return this.prisma.withTenant(tenant.id, async (tx) => {
      const previous = await tx.idempotencyKey.findUnique({ where: { scope_keyHash: { scope, keyHash } } });
      if (previous) { if (previous.requestHash !== requestHash) throw new ConflictException("Idempotency key was already used for another request"); return previous.responseBody; }
      const [service, location] = await Promise.all([
        tx.service.findFirst({ where: { id: input.serviceId, tenantId: tenant.id, isActive: true } }),
        tx.location.findFirst({ where: { id: input.locationId, tenantId: tenant.id, isActive: true }, include: { businessHours: true } })
      ]);
      if (!service || !location) throw new NotFoundException("Service or location was not found");
      const endAt = new Date(input.startAt.getTime() + service.durationMinutes * 60_000);
      await this.assertAvailable(tx, tenant.id, tenant.timezone, location, input.startAt, endAt);
      const match = input.customer.email ? { email: input.customer.email } : { phone: input.customer.phone ?? "" };
      let customer = await tx.customer.findFirst({ where: { tenantId: tenant.id, ...match, anonymizedAt: null } });
      const customerData = { firstName: input.customer.firstName, lastName: input.customer.lastName, email: input.customer.email ?? null, phone: input.customer.phone ?? null, notes: input.customer.notes ?? null, consentAt: new Date() };
      customer = customer ? await tx.customer.update({ where: { id: customer.id }, data: customerData }) : await tx.customer.create({ data: { tenantId: tenant.id, ...customerData } });
      const booking = await tx.booking.create({ data: { tenantId: tenant.id, customerId: customer.id, serviceId: service.id, locationId: location.id, status: "PENDING", startAt: input.startAt, endAt, serviceName: service.name, serviceDurationMinutes: service.durationMinutes, servicePrice: service.price, currency: service.currency, customerNotes: input.customerNotes ?? null } });
      await tx.bookingStatusHistory.create({ data: { tenantId: tenant.id, bookingId: booking.id, toStatus: "PENDING" } });
      await tx.auditEvent.create({ data: { tenantId: tenant.id, actorUserId: null, action: "PUBLIC_BOOKING_CREATED", entityType: "Booking", entityId: booking.id } });
      const token = `${tenant.id}.${randomBytes(32).toString("base64url")}`;
      await tx.bookingPublicToken.create({ data: { tenantId: tenant.id, bookingId: booking.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + 30 * 86_400_000) } });
      const response = { bookingId: booking.id, status: booking.status, trackingToken: token };
      await tx.idempotencyKey.create({ data: { tenantId: tenant.id, scope, keyHash, requestHash, responseCode: 201, responseBody: response, expiresAt: new Date(Date.now() + 86_400_000) } });
      return response;
    });
  }

  private async activeTenant(slug: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { slug, status: "ACTIVE" }, select: { id: true, timezone: true, currency: true } });
    if (!tenant) throw new NotFoundException("Business was not found");
    return tenant;
  }

  private async assertAvailable(tx: TransactionClient, tenantId: string, tenantTimezone: string, location: { id: string; timezone: string | null; businessHours: { dayOfWeek: number; openTime: Date | null; closeTime: Date | null; isClosed: boolean }[] }, startAt: Date, endAt: Date): Promise<void> {
    const [booking, block] = await Promise.all([
      tx.booking.findFirst({ where: { tenantId, locationId: location.id, status: { in: [...activeStatuses] }, startAt: { lt: endAt }, endAt: { gt: startAt } }, select: { id: true } }),
      tx.availabilityBlock.findFirst({ where: { tenantId, locationId: location.id, startsAt: { lt: endAt }, endsAt: { gt: startAt } }, select: { id: true } })
    ]);
    if (booking || block) throw new ConflictException("Selected time is no longer available");
    const local = localParts(startAt, location.timezone ?? tenantTimezone), hours = location.businessHours.find((item) => item.dayOfWeek === local.dayOfWeek);
    const duration = Math.ceil((endAt.getTime() - startAt.getTime()) / 60_000);
    if (!hours || hours.isClosed || local.minute < timeMinute(hours.openTime) || local.minute + duration > timeMinute(hours.closeTime)) throw new ConflictException("Selected time is outside business hours");
  }
}
