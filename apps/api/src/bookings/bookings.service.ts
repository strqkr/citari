import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { BookingStatus } from "../generated/prisma/enums.js";
import { PrismaService, type TransactionClient } from "../database/prisma.service.js";
import { SchedulingIntegrityService } from "../scheduling/scheduling-integrity.service.js";
import type { CreateBookingDto, ListBookingsQuery } from "./bookings.dto.js";
const ACTIVE: BookingStatus[] = [BookingStatus.HELD, BookingStatus.PENDING, BookingStatus.CONFIRMED];
const allowed: Record<BookingStatus, BookingStatus[]> = {
  HELD: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CANCELLED], PENDING: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  CONFIRMED: [BookingStatus.CANCELLED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW], CANCELLED: [], COMPLETED: [], NO_SHOW: []
};
@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService, private readonly scheduling: SchedulingIntegrityService) {}
  list(tenantId: string, query: ListBookingsQuery) {
    const page = query.page ?? 1, take = Math.min(query.limit ?? 25, 100);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const where = { tenantId, startAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lt: new Date(query.to) } : {}) } };
      const [items, total] = await Promise.all([tx.booking.findMany({ where, include: { customer: true, service: true, location: true }, orderBy: [{ startAt: "asc" }, { id: "asc" }], skip: (page - 1) * take, take }), tx.booking.count({ where })]);
      return { items, page, limit: take, total };
    });
  }
  async get(tenantId: string, id: string) {
    const value = await this.prisma.withTenant(tenantId, (tx) => tx.booking.findFirst({ where: { tenantId, id }, include: { customer: true, service: true, location: true, statusHistory: { orderBy: { createdAt: "asc" } } } }));
    if (!value) throw new NotFoundException("Booking not found"); return value;
  }
  create(tenantId: string, actorId: string, input: CreateBookingDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [customer, service, location] = await Promise.all([
        tx.customer.findFirst({ where: { tenantId, id: input.customerId, anonymizedAt: null } }),
        tx.service.findFirst({ where: { tenantId, id: input.serviceId, isActive: true } }),
        tx.location.findFirst({ where: { tenantId, id: input.locationId, isActive: true }, include: { businessHours: true, tenant: { select: { timezone: true } } } })
      ]);
      if (!customer || !service || !location) throw new UnprocessableEntityException("Customer, service, or location is unavailable");
      const window = this.scheduling.window(service, new Date(input.startAt));
      if (window.startAt <= new Date()) throw new UnprocessableEntityException("Booking start must be in the future");
      await this.scheduling.lockLocation(tx, tenantId, location.id);
      await this.scheduling.assertAvailable(tx, { tenantId, tenantTimezone: location.tenant.timezone, location, window });
      const booking = await tx.booking.create({ data: { tenantId, customerId: customer.id, serviceId: service.id, locationId: location.id, ...window, serviceName: service.name, serviceDurationMinutes: service.durationMinutes, serviceBufferBeforeMinutes: service.bufferBeforeMinutes, serviceBufferAfterMinutes: service.bufferAfterMinutes, servicePrice: service.price, currency: service.currency, customerNotes: input.customerNotes ?? null, internalNotes: input.internalNotes ?? null } });
      await tx.bookingStatusHistory.create({ data: { tenantId, bookingId: booking.id, toStatus: BookingStatus.PENDING, actorId } });
      await tx.auditEvent.create({ data: { tenantId, actorUserId: actorId, action: "booking.created", entityType: "Booking", entityId: booking.id } });
      return booking;
    });
  }
  transition(tenantId: string, id: string, actorId: string, target: BookingStatus, version: number, reason?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.booking.findFirst({ where: { tenantId, id } }); if (!current) throw new NotFoundException("Booking not found");
      if (!allowed[current.status].includes(target)) throw new UnprocessableEntityException(`Cannot transition ${current.status} to ${target}`);
      const changed = await tx.booking.updateMany({ where: { tenantId, id, version, status: current.status }, data: { status: target, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Booking was changed by another request");
      await this.history(tx, tenantId, id, actorId, current.status, target, reason);
      return tx.booking.findFirstOrThrow({ where: { tenantId, id } });
    });
  }
  reschedule(tenantId: string, id: string, actorId: string, version: number, rawStart: string, reason?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.booking.findFirst({ where: { tenantId, id } }); if (!current) throw new NotFoundException("Booking not found");
      if (!ACTIVE.includes(current.status)) throw new UnprocessableEntityException("This booking cannot be rescheduled");
      const location = await tx.location.findFirst({ where: { tenantId, id: current.locationId, isActive: true }, include: { businessHours: true, tenant: { select: { timezone: true } } } });
      if (!location) throw new UnprocessableEntityException("Location is unavailable");
      const window = this.scheduling.window({ durationMinutes: current.serviceDurationMinutes, bufferBeforeMinutes: current.serviceBufferBeforeMinutes, bufferAfterMinutes: current.serviceBufferAfterMinutes }, new Date(rawStart));
      if (window.startAt <= new Date()) throw new UnprocessableEntityException("Booking start must be in the future");
      await this.scheduling.lockLocation(tx, tenantId, current.locationId);
      await this.scheduling.assertAvailable(tx, { tenantId, tenantTimezone: location.tenant.timezone, location, window, excludeBookingId: id });
      const changed = await tx.booking.updateMany({ where: { tenantId, id, version }, data: { ...window, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Booking was changed by another request");
      await tx.auditEvent.create({ data: { tenantId, actorUserId: actorId, action: "booking.rescheduled", entityType: "Booking", entityId: id, reason: reason ?? null, metadata: { previousStartAt: current.startAt.toISOString(), startAt: window.startAt.toISOString() } } });
      return tx.booking.findFirstOrThrow({ where: { tenantId, id } });
    });
  }
  private async history(tx: TransactionClient, tenantId: string, bookingId: string, actorId: string, fromStatus: BookingStatus, toStatus: BookingStatus, reason?: string): Promise<void> {
    await tx.bookingStatusHistory.create({ data: { tenantId, bookingId, fromStatus, toStatus, actorId, reason: reason ?? null } });
    await tx.auditEvent.create({ data: { tenantId, actorUserId: actorId, action: `booking.${toStatus.toLowerCase()}`, entityType: "Booking", entityId: bookingId, reason: reason ?? null } });
  }
}
