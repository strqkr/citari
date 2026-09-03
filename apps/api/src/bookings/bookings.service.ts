import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { BookingStatus } from "../generated/prisma/enums.js";
import { PrismaService, type TransactionClient } from "../database/prisma.service.js";
import { SchedulingIntegrityService } from "../scheduling/scheduling-integrity.service.js";
import type { CreateBookingDto, ListBookingsQuery } from "./bookings.dto.js";
import { canOccupySchedule, transitionViolation } from "./booking-state-machine.js";
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
  availability(tenantId: string, id: string, rawFrom: string, rawTo: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const from = new Date(rawFrom), to = new Date(rawTo), now = new Date();
      if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to || to.getTime() - from.getTime() > 31 * 86_400_000) {
        throw new UnprocessableEntityException("Availability range is invalid");
      }
      const booking = await tx.booking.findFirst({ where: { tenantId, id } });
      if (!booking) throw new NotFoundException("Booking not found");
      if (!canOccupySchedule(booking.status)) throw new UnprocessableEntityException("This booking cannot be rescheduled");
      const [location, bookings, holds, blocks] = await Promise.all([
        tx.location.findFirst({ where: { tenantId, id: booking.locationId, isActive: true }, include: { businessHours: true, tenant: { select: { timezone: true } } } }),
        tx.booking.findMany({ where: { tenantId, locationId: booking.locationId, id: { not: id }, status: { in: [BookingStatus.HELD, BookingStatus.PENDING, BookingStatus.CONFIRMED] }, occupiedStartAt: { lt: to }, occupiedEndAt: { gt: from } }, select: { occupiedStartAt: true, occupiedEndAt: true } }),
        tx.slotHold.findMany({ where: { tenantId, locationId: booking.locationId, status: "ACTIVE", expiresAt: { gt: now }, occupiedStartAt: { lt: to }, occupiedEndAt: { gt: from } }, select: { occupiedStartAt: true, occupiedEndAt: true } }),
        tx.availabilityBlock.findMany({ where: { tenantId, locationId: booking.locationId, startsAt: { lt: to }, endsAt: { gt: from } }, select: { startsAt: true, endsAt: true } })
      ]);
      if (!location) throw new UnprocessableEntityException("Location is unavailable");
      const occupied = [
        ...bookings.map((item) => ({ start: item.occupiedStartAt, end: item.occupiedEndAt })),
        ...holds.map((item) => ({ start: item.occupiedStartAt, end: item.occupiedEndAt })),
        ...blocks.map((item) => ({ start: item.startsAt, end: item.endsAt }))
      ];
      const service = {
        durationMinutes: booking.serviceDurationMinutes, bufferBeforeMinutes: booking.serviceBufferBeforeMinutes,
        bufferAfterMinutes: booking.serviceBufferAfterMinutes, minimumLeadMinutes: booking.serviceMinimumLeadMinutes,
        maximumAdvanceDays: booking.serviceMaximumAdvanceDays, slotIntervalMinutes: booking.slotIntervalMinutes
      };
      return { timezone: location.timezone ?? location.tenant.timezone, slots: this.scheduling.availableSlots({ service, location, tenantTimezone: location.tenant.timezone, from, to, occupied, now }) };
    });
  }
  create(tenantId: string, actorId: string, input: CreateBookingDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [customer, service, location] = await Promise.all([
        tx.customer.findFirst({ where: { tenantId, id: input.customerId, anonymizedAt: null } }),
        tx.service.findFirst({ where: { tenantId, id: input.serviceId, isActive: true } }),
        tx.location.findFirst({ where: { tenantId, id: input.locationId, isActive: true }, include: { businessHours: true, tenant: { select: { timezone: true } } } })
      ]);
      if (!customer || !service || !location) throw new UnprocessableEntityException("Customer, service, or location is unavailable");
      const now = new Date();
      const window = this.scheduling.window(service, new Date(input.startAt));
      this.scheduling.assertPolicy(service, window.startAt, location.timezone ?? location.tenant.timezone, now);
      await this.scheduling.lockLocation(tx, tenantId, location.id);
      await this.scheduling.assertAvailable(tx, { tenantId, tenantTimezone: location.tenant.timezone, location, window, now });
      const booking = await tx.booking.create({ data: {
        tenantId, customerId: customer.id, serviceId: service.id, locationId: location.id, ...window,
        serviceName: service.name, serviceDurationMinutes: service.durationMinutes, serviceBufferBeforeMinutes: service.bufferBeforeMinutes,
        serviceBufferAfterMinutes: service.bufferAfterMinutes, serviceMinimumLeadMinutes: service.minimumLeadMinutes,
        serviceMaximumAdvanceDays: service.maximumAdvanceDays, cancellationNoticeMinutes: service.cancellationNoticeMinutes,
        rescheduleNoticeMinutes: service.rescheduleNoticeMinutes, slotIntervalMinutes: service.slotIntervalMinutes,
        servicePrice: service.price, currency: service.currency, customerNotes: input.customerNotes ?? null, internalNotes: input.internalNotes ?? null
      } });
      await tx.bookingStatusHistory.create({ data: { tenantId, bookingId: booking.id, toStatus: BookingStatus.PENDING, actorId } });
      await tx.auditEvent.create({ data: { tenantId, actorUserId: actorId, action: "booking.created", entityType: "Booking", entityId: booking.id } });
      return booking;
    });
  }
  transition(tenantId: string, id: string, actorId: string, target: BookingStatus, version: number, reason?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.booking.findFirst({ where: { tenantId, id } }); if (!current) throw new NotFoundException("Booking not found");
      const violation = transitionViolation(current.status, target, current.startAt, current.endAt);
      if (violation) throw new UnprocessableEntityException(violation);
      const changed = await tx.booking.updateMany({ where: { tenantId, id, version, status: current.status }, data: { status: target, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Booking was changed by another request");
      await this.history(tx, tenantId, id, actorId, current.status, target, reason);
      return tx.booking.findFirstOrThrow({ where: { tenantId, id } });
    });
  }
  reschedule(tenantId: string, id: string, actorId: string, version: number, rawStart: string, reason?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.booking.findFirst({ where: { tenantId, id } }); if (!current) throw new NotFoundException("Booking not found");
      if (!canOccupySchedule(current.status)) throw new UnprocessableEntityException("This booking cannot be rescheduled");
      const location = await tx.location.findFirst({ where: { tenantId, id: current.locationId, isActive: true }, include: { businessHours: true, tenant: { select: { timezone: true } } } });
      if (!location) throw new UnprocessableEntityException("Location is unavailable");
      const now = new Date();
      const window = this.scheduling.window({ durationMinutes: current.serviceDurationMinutes, bufferBeforeMinutes: current.serviceBufferBeforeMinutes, bufferAfterMinutes: current.serviceBufferAfterMinutes }, new Date(rawStart));
      this.scheduling.assertPolicy({ minimumLeadMinutes: current.serviceMinimumLeadMinutes, maximumAdvanceDays: current.serviceMaximumAdvanceDays, slotIntervalMinutes: current.slotIntervalMinutes }, window.startAt, location.timezone ?? location.tenant.timezone, now);
      await this.scheduling.lockLocation(tx, tenantId, current.locationId);
      await this.scheduling.assertAvailable(tx, { tenantId, tenantTimezone: location.tenant.timezone, location, window, excludeBookingId: id, now });
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
