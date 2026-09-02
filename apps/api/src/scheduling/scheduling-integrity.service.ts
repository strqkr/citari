import { ConflictException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import type { TransactionClient } from "../database/prisma.service.js";

export interface SchedulingWindow {
  startAt: Date;
  endAt: Date;
  occupiedStartAt: Date;
  occupiedEndAt: Date;
}

export interface SchedulingServiceSnapshot {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

export interface SchedulingLocation {
  id: string;
  timezone: string | null;
  businessHours: { dayOfWeek: number; openTime: Date | null; closeTime: Date | null; isClosed: boolean }[];
}

function localParts(at: Date, timezone: string): { dayOfWeek: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dayOfWeek: days[value("weekday")] ?? -1, minute: Number(value("hour")) * 60 + Number(value("minute")) };
}

function timeMinute(value: Date | null): number {
  return value ? value.getUTCHours() * 60 + value.getUTCMinutes() : -1;
}

@Injectable()
export class SchedulingIntegrityService {
  window(service: SchedulingServiceSnapshot, startAt: Date): SchedulingWindow {
    if (!Number.isFinite(startAt.getTime())) throw new UnprocessableEntityException("Booking start is invalid");
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
    return {
      startAt,
      endAt,
      occupiedStartAt: new Date(startAt.getTime() - service.bufferBeforeMinutes * 60_000),
      occupiedEndAt: new Date(endAt.getTime() + service.bufferAfterMinutes * 60_000)
    };
  }

  async lockLocation(tx: TransactionClient, tenantId: string, locationId: string, now = new Date()): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${locationId}`}, 0))`;
    await tx.slotHold.updateMany({ where: { tenantId, locationId, status: "ACTIVE", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
  }

  async assertAvailable(tx: TransactionClient, input: {
    tenantId: string;
    tenantTimezone: string;
    location: SchedulingLocation;
    window: SchedulingWindow;
    excludeBookingId?: string;
    excludeHoldId?: string;
  }): Promise<void> {
    const { tenantId, location, window } = input;
    const [booking, hold, block] = await Promise.all([
      tx.booking.findFirst({ where: {
        tenantId,
        locationId: location.id,
        status: { in: ["HELD", "PENDING", "CONFIRMED"] },
        ...(input.excludeBookingId ? { id: { not: input.excludeBookingId } } : {}),
        occupiedStartAt: { lt: window.occupiedEndAt },
        occupiedEndAt: { gt: window.occupiedStartAt }
      }, select: { id: true } }),
      tx.slotHold.findFirst({ where: {
        tenantId,
        locationId: location.id,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
        ...(input.excludeHoldId ? { id: { not: input.excludeHoldId } } : {}),
        occupiedStartAt: { lt: window.occupiedEndAt },
        occupiedEndAt: { gt: window.occupiedStartAt }
      }, select: { id: true } }),
      tx.availabilityBlock.findFirst({ where: {
        tenantId,
        locationId: location.id,
        startsAt: { lt: window.occupiedEndAt },
        endsAt: { gt: window.occupiedStartAt }
      }, select: { id: true } })
    ]);
    if (booking || hold || block) throw new ConflictException("The requested time is no longer available");
    this.assertBusinessHours(location, input.tenantTimezone, window);
  }

  async assertBlockAvailable(tx: TransactionClient, input: {
    tenantId: string;
    locationId: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<void> {
    const [booking, hold] = await Promise.all([
      tx.booking.findFirst({ where: {
        tenantId: input.tenantId,
        locationId: input.locationId,
        status: { in: ["HELD", "PENDING", "CONFIRMED"] },
        occupiedStartAt: { lt: input.endsAt },
        occupiedEndAt: { gt: input.startsAt }
      }, select: { id: true } }),
      tx.slotHold.findFirst({ where: {
        tenantId: input.tenantId,
        locationId: input.locationId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
        occupiedStartAt: { lt: input.endsAt },
        occupiedEndAt: { gt: input.startsAt }
      }, select: { id: true } })
    ]);
    if (booking || hold) throw new ConflictException("The availability block overlaps an active booking or hold");
  }

  assertBusinessHours(location: SchedulingLocation, tenantTimezone: string, window: SchedulingWindow): void {
    const timezone = location.timezone ?? tenantTimezone;
    const start = localParts(window.occupiedStartAt, timezone);
    const end = localParts(new Date(window.occupiedEndAt.getTime() - 1), timezone);
    const hours = location.businessHours.find((entry) => entry.dayOfWeek === start.dayOfWeek);
    const opensAt = timeMinute(hours?.openTime ?? null);
    const closesAt = timeMinute(hours?.closeTime ?? null);
    const endMinuteExclusive = end.minute + 1;
    if (!hours || hours.isClosed || start.dayOfWeek !== end.dayOfWeek || start.minute < opensAt || endMinuteExclusive > closesAt) {
      throw new ConflictException("The requested time is outside business hours");
    }
  }
}
