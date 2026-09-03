import { createHash, randomBytes } from "node:crypto";
import { ConflictException, GoneException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { z } from "zod";
import { openSecret, sealSecret } from "../../common/secret-box.js";
import { ENVIRONMENT, type Environment } from "../../config/environment.js";
import { PrismaService, type TransactionClient } from "../../database/prisma.service.js";
import { SchedulingIntegrityService } from "../../scheduling/scheduling-integrity.service.js";
import type { availabilityQuerySchema, confirmationNonceSchema, publicBookingSchema, slotHoldSchema } from "./public.schemas.js";

type AvailabilityInput = z.infer<typeof availabilityQuerySchema>;
type BookingInput = z.infer<typeof publicBookingSchema>;
type HoldInput = z.infer<typeof slotHoldSchema>;
type ConfirmationInput = z.infer<typeof confirmationNonceSchema>;
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const HOLD_TTL_MS = 10 * 60_000;
const CONFIRMATION_TTL_MS = 15 * 60_000;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60_000;
const IDEMPOTENCY_CONTEXT = "citari:public-idempotency:v1";
const CONFIRMATION_CONTEXT = "citari:booking-confirmation:v1";

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduling: SchedulingIntegrityService,
    @Inject(ENVIRONMENT) private readonly env: Environment
  ) {}

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

  async locations(slug: string) {
    const tenant = await this.activeTenant(slug);
    return this.prisma.withTenant(tenant.id, (tx) => tx.location.findMany({
      where: { tenantId: tenant.id, isActive: true },
      select: { id: true, name: true, timezone: true, addressLine1: true, addressLine2: true, province: true, canton: true, district: true, isMain: true },
      orderBy: [{ isMain: "desc" }, { name: "asc" }]
    }));
  }

  async availability(slug: string, input: AvailabilityInput) {
    const tenant = await this.activeTenant(slug);
    return this.prisma.withTenant(tenant.id, async (tx) => {
      const [service, location, bookings, holds, blocks] = await Promise.all([
        tx.service.findFirst({ where: { id: input.serviceId, tenantId: tenant.id, isActive: true } }),
        tx.location.findFirst({ where: { id: input.locationId, tenantId: tenant.id, isActive: true }, include: { businessHours: true } }),
        tx.booking.findMany({ where: { tenantId: tenant.id, locationId: input.locationId, status: { in: ["HELD", "PENDING", "CONFIRMED"] }, occupiedStartAt: { lt: input.to }, occupiedEndAt: { gt: input.from } }, select: { occupiedStartAt: true, occupiedEndAt: true } }),
        tx.slotHold.findMany({ where: { tenantId: tenant.id, locationId: input.locationId, status: "ACTIVE", expiresAt: { gt: new Date() }, occupiedStartAt: { lt: input.to }, occupiedEndAt: { gt: input.from } }, select: { occupiedStartAt: true, occupiedEndAt: true } }),
        tx.availabilityBlock.findMany({ where: { tenantId: tenant.id, locationId: input.locationId, startsAt: { lt: input.to }, endsAt: { gt: input.from } }, select: { startsAt: true, endsAt: true } })
      ]);
      if (!service || !location) throw new NotFoundException("Service or location was not found");
      const occupied = [
        ...bookings.map((item) => ({ start: item.occupiedStartAt, end: item.occupiedEndAt })),
        ...holds.map((item) => ({ start: item.occupiedStartAt, end: item.occupiedEndAt })),
        ...blocks.map((item) => ({ start: item.startsAt, end: item.endsAt }))
      ];
      const slots: Date[] = [];
      for (let cursor = new Date(input.from); cursor < input.to; cursor = new Date(cursor.getTime() + 15 * 60_000)) {
        const window = this.scheduling.window(service, cursor);
        if (window.endAt > input.to || occupied.some((item) => window.occupiedStartAt < item.end && window.occupiedEndAt > item.start)) continue;
        try {
          this.scheduling.assertBusinessHours(location, tenant.timezone, window);
          slots.push(new Date(cursor));
        } catch (error) {
          if (!(error instanceof ConflictException)) throw error;
        }
      }
      return { timezone: location.timezone ?? tenant.timezone, slots };
    });
  }

  async createHold(slug: string, input: HoldInput, idempotencyKey: string) {
    const tenant = await this.activeTenant(slug);
    return this.prisma.withTenant(tenant.id, async (tx) => {
      const scope = `public-hold:${tenant.id}`;
      const replay = await this.claimIdempotency<{ holdToken: string; expiresAt: string }>(tx, tenant.id, scope, idempotencyKey, input, HOLD_TTL_MS);
      if (replay) return replay;
      const [service, location] = await Promise.all([
        tx.service.findFirst({ where: { id: input.serviceId, tenantId: tenant.id, isActive: true } }),
        tx.location.findFirst({ where: { id: input.locationId, tenantId: tenant.id, isActive: true }, include: { businessHours: true } })
      ]);
      if (!service || !location) throw new NotFoundException("Service or location was not found");
      if (input.startAt <= new Date()) throw new UnprocessableEntityException("Booking start must be in the future");
      const window = this.scheduling.window(service, input.startAt);
      await this.scheduling.lockLocation(tx, tenant.id, location.id);
      await this.scheduling.assertAvailable(tx, { tenantId: tenant.id, tenantTimezone: tenant.timezone, location, window });
      const holdToken = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + HOLD_TTL_MS);
      await tx.slotHold.create({ data: { tenantId: tenant.id, serviceId: service.id, locationId: location.id, tokenHash: digest(holdToken), ...window, expiresAt } });
      const response = { holdToken, expiresAt: expiresAt.toISOString() };
      await this.completeIdempotency(tx, scope, idempotencyKey, response);
      return response;
    });
  }

  async createBooking(slug: string, input: BookingInput, idempotencyKey: string) {
    const tenant = await this.activeTenant(slug);
    return this.prisma.withTenant(tenant.id, async (tx) => {
      const scope = `public-booking:${tenant.id}`;
      const replay = await this.claimIdempotency<{ confirmationNonce: string; expiresAt: string }>(tx, tenant.id, scope, idempotencyKey, input);
      if (replay) return replay;
      const [service, location] = await Promise.all([
        tx.service.findFirst({ where: { id: input.serviceId, tenantId: tenant.id, isActive: true } }),
        tx.location.findFirst({ where: { id: input.locationId, tenantId: tenant.id, isActive: true }, include: { businessHours: true } })
      ]);
      if (!service || !location) throw new NotFoundException("Service or location was not found");
      const window = this.scheduling.window(service, input.startAt);
      await this.scheduling.lockLocation(tx, tenant.id, location.id);
      const hold = await tx.slotHold.findFirst({ where: {
        tenantId: tenant.id,
        tokenHash: digest(input.holdToken),
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
        serviceId: service.id,
        locationId: location.id,
        startAt: input.startAt,
        endAt: window.endAt,
        occupiedStartAt: window.occupiedStartAt,
        occupiedEndAt: window.occupiedEndAt
      } });
      if (!hold) throw new GoneException("The slot hold expired or is invalid");
      await this.scheduling.assertAvailable(tx, { tenantId: tenant.id, tenantTimezone: tenant.timezone, location, window, excludeHoldId: hold.id });
      const match = { email: input.customer.email };
      let customer = await tx.customer.findFirst({ where: { tenantId: tenant.id, ...match, anonymizedAt: null } });
      const customerData = { firstName: input.customer.firstName, lastName: input.customer.lastName, email: input.customer.email, phone: input.customer.phone ?? null, notes: input.customer.notes ?? null, consentAt: new Date() };
      customer = customer ? await tx.customer.update({ where: { id: customer.id }, data: customerData }) : await tx.customer.create({ data: { tenantId: tenant.id, ...customerData } });
      const booking = await tx.booking.create({ data: {
        tenantId: tenant.id, customerId: customer.id, serviceId: service.id, locationId: location.id, status: "PENDING", ...window,
        serviceName: service.name, serviceDurationMinutes: service.durationMinutes, serviceBufferBeforeMinutes: service.bufferBeforeMinutes,
        serviceBufferAfterMinutes: service.bufferAfterMinutes, servicePrice: service.price, currency: service.currency, customerNotes: input.customerNotes ?? null
      } });
      const consumed = await tx.slotHold.updateMany({ where: { id: hold.id, status: "ACTIVE", expiresAt: { gt: new Date() } }, data: { status: "CONSUMED" } });
      if (consumed.count !== 1) throw new GoneException("The slot hold expired or is invalid");
      await tx.bookingStatusHistory.create({ data: { tenantId: tenant.id, bookingId: booking.id, toStatus: "PENDING" } });
      await tx.auditEvent.create({ data: { tenantId: tenant.id, actorUserId: null, action: "PUBLIC_BOOKING_CREATED", entityType: "Booking", entityId: booking.id } });
      const trackingToken = `${tenant.id}.${randomBytes(32).toString("base64url")}`;
      await tx.bookingPublicToken.create({ data: { tenantId: tenant.id, bookingId: booking.id, tokenHash: digest(trackingToken), expiresAt: new Date(Date.now() + 30 * 86_400_000) } });
      const confirmationNonce = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS);
      await tx.bookingConfirmation.create({ data: {
        tenantId: tenant.id,
        bookingId: booking.id,
        tokenHash: digest(confirmationNonce),
        payloadEncrypted: sealSecret(JSON.stringify({ trackingToken }), this.env.NOTIFICATION_ENCRYPTION_KEY, CONFIRMATION_CONTEXT),
        expiresAt
      } });
      const response = { confirmationNonce, expiresAt: expiresAt.toISOString() };
      await this.completeIdempotency(tx, scope, idempotencyKey, response);
      return response;
    });
  }

  async consumeConfirmation(slug: string, input: ConfirmationInput, idempotencyKey: string) {
    const tenant = await this.activeTenant(slug);
    return this.prisma.withTenant(tenant.id, async (tx) => {
      const scope = `public-confirmation:${tenant.id}`;
      const replay = await this.claimIdempotency<{ booking: unknown; trackingToken: string }>(tx, tenant.id, scope, idempotencyKey, input, CONFIRMATION_TTL_MS);
      if (replay) return replay;
      const confirmation = await tx.bookingConfirmation.findUnique({ where: { tokenHash: digest(input.confirmationNonce) }, include: { booking: { select: {
        id: true, version: true, status: true, startAt: true, endAt: true, serviceName: true, serviceDurationMinutes: true, servicePrice: true, currency: true,
        customer: { select: { firstName: true } }, location: { select: { name: true } }, tenant: { select: { name: true, timezone: true, locale: true } }
      } } } });
      if (confirmation?.tenantId !== tenant.id || confirmation.consumedAt || confirmation.expiresAt <= new Date()) throw new GoneException("The booking confirmation expired or was already used");
      const consumed = await tx.bookingConfirmation.updateMany({ where: { id: confirmation.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
      if (consumed.count !== 1) throw new GoneException("The booking confirmation expired or was already used");
      const payload = JSON.parse(openSecret(confirmation.payloadEncrypted, this.env.NOTIFICATION_ENCRYPTION_KEY, CONFIRMATION_CONTEXT)) as { trackingToken?: unknown };
      if (typeof payload.trackingToken !== "string") throw new GoneException("The booking confirmation is unavailable");
      const response = { booking: confirmation.booking, trackingToken: payload.trackingToken };
      await this.completeIdempotency(tx, scope, idempotencyKey, response, 200);
      return response;
    });
  }

  private async activeTenant(slug: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { slug, status: "ACTIVE" }, select: { id: true, timezone: true, currency: true } });
    if (!tenant) throw new NotFoundException("Business was not found");
    return tenant;
  }

  private async claimIdempotency<T>(tx: TransactionClient, tenantId: string, scope: string, key: string, request: unknown, ttlMs = IDEMPOTENCY_TTL_MS): Promise<T | null> {
    const keyHash = digest(key);
    const requestHash = digest(JSON.stringify(request));
    const now = new Date();
    await tx.idempotencyKey.deleteMany({ where: { scope, keyHash, expiresAt: { lte: now } } });
    const inserted = await tx.$executeRaw`
      INSERT INTO "idempotency_keys" ("id", "tenantId", "scope", "keyHash", "requestHash", "expiresAt", "createdAt")
      VALUES (gen_random_uuid(), ${tenantId}::uuid, ${scope}, ${keyHash}, ${requestHash}, ${new Date(now.getTime() + ttlMs)}, ${now})
      ON CONFLICT ("scope", "keyHash") DO NOTHING
    `;
    const record = await tx.idempotencyKey.findUnique({ where: { scope_keyHash: { scope, keyHash } } });
    if (record?.requestHash !== requestHash) throw new ConflictException("Idempotency key was already used for another request");
    if (inserted === 1) return null;
    if (record.responseBodyEncrypted) return JSON.parse(openSecret(record.responseBodyEncrypted, this.env.NOTIFICATION_ENCRYPTION_KEY, IDEMPOTENCY_CONTEXT)) as T;
    if (record.responseBody) return record.responseBody as T;
    throw new ConflictException("The idempotent request is still being processed");
  }

  private async completeIdempotency(tx: TransactionClient, scope: string, key: string, response: unknown, responseCode = 201): Promise<void> {
    await tx.idempotencyKey.update({ where: { scope_keyHash: { scope, keyHash: digest(key) } }, data: {
      responseCode,
      responseBodyEncrypted: sealSecret(JSON.stringify(response), this.env.NOTIFICATION_ENCRYPTION_KEY, IDEMPOTENCY_CONTEXT)
    } });
  }
}
