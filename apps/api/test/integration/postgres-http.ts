import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request, { type Response } from "supertest";
import { z } from "zod";
import { createApplication } from "../../src/bootstrap.js";
import { totpAt } from "../../src/auth/mfa.js";
import { openSecret } from "../../src/common/secret-box.js";
import { PrismaService } from "../../src/database/prisma.service.js";

const tokensSchema = z.object({ accessToken: z.string(), refreshToken: z.string() });
const registrationResponseSchema = z.object({ tenantId: z.uuid(), userId: z.uuid(), status: z.string() });
const profileSchema = z.object({ email: z.email(), tenantRole: z.string().nullable() });
const categorySchema = z.object({ id: z.uuid() });
const entitySchema = z.object({ id: z.uuid() });
const holdSchema = z.object({ holdToken: z.string(), expiresAt: z.string() });
const bookingResultSchema = z.object({ confirmationNonce: z.string(), expiresAt: z.string() });
const confirmationResultSchema = z.object({ trackingToken: z.string(), booking: z.object({ id: z.uuid(), status: z.string() }) });
const trackingChallengeSchema = z.object({ challengeToken: z.string(), expiresAt: z.string(), destination: z.string() });
const trackingGrantSchema = z.object({ accessGrant: z.string(), expiresAt: z.string() });
const problemSchema = z.object({ status: z.number() });
const readySchema = z.object({ status: z.literal("ready") });
const challengeSchema = z.object({ challengeToken: z.string(), status: z.string() });
const enrollmentSchema = challengeSchema.extend({ secret: z.string(), otpAuthUri: z.string() });

const registration = (suffix: string) => ({
  businessName: `QA Business ${suffix}`,
  slug: `qa-${suffix}`,
  businessEmail: `business-${suffix}@example.test`,
  ownerFirstName: "Quality",
  ownerLastName: "Engineer",
  ownerEmail: `owner-${suffix}@example.test`,
  password: "OwnerIntegrationPassword2026A",
});

function status(response: Response, expected: number): Response {
  assert.equal(response.status, expected, JSON.stringify(response.body));
  return response;
}

async function main(): Promise<void> {
  const superadminPassword = process.env.E2E_SUPERADMIN_PASSWORD;
  if (!superadminPassword) throw new Error("E2E_SUPERADMIN_PASSWORD is required");
  const notificationKey = process.env.NOTIFICATION_ENCRYPTION_KEY;
  if (!notificationKey) throw new Error("NOTIFICATION_ENCRYPTION_KEY is required");

  const app = await createApplication();
  const http = request(app.getHttpServer());
  const prisma = app.get(PrismaService);
  const first = registration(randomUUID().replaceAll("-", "").slice(0, 16));
  const second = registration(randomUUID().replaceAll("-", "").slice(0, 16));

  try {
    const ready = status(await http.get("/api/v1/health/ready"), 200);
    assert.deepEqual(readySchema.parse(ready.body), { status: "ready" });

    const invalid = status(await http.post("/api/v1/auth/register-owner").send({ businessName: "x", unexpected: true }), 400);
    assert.match(String(invalid.headers["content-type"]), /application\/problem\+json/);
    assert.equal(problemSchema.parse(invalid.body).status, 400);

    const firstRegistration = registrationResponseSchema.parse(status(await http.post("/api/v1/auth/register-owner").send(first), 201).body);
    const secondRegistration = registrationResponseSchema.parse(status(await http.post("/api/v1/auth/register-owner").send(second), 201).body);
    assert.equal(firstRegistration.status, "PENDING_VERIFICATION");
    for (const registrationResult of [firstRegistration, secondRegistration]) {
      const delivery = await prisma.emailDelivery.findFirst({ where: { userId: registrationResult.userId, template: "EMAIL_VERIFICATION", sentAt: null }, orderBy: { createdAt: "desc" } });
      assert.ok(delivery);
      const payload = JSON.parse(openSecret(delivery.payloadEncrypted, notificationKey, "citari:email-delivery:v1")) as { token: string };
      status(await http.post("/api/v1/auth/email/verify").send({ challengeToken: payload.token }), 200);
      status(await http.post("/api/v1/auth/email/verify").send({ challengeToken: payload.token }), 401);
    }

    const passwordChallenge = challengeSchema.parse(status(await http.post("/api/v1/auth/login").send({ email: "andrew@euxora.net", password: superadminPassword }), 200).body);
    assert.equal(passwordChallenge.status, "PASSWORD_CHANGE_REQUIRED");
    const permanentPassword = "CiPermanentPassword2026B";
    const mfaChallenge = challengeSchema.parse(status(await http.post("/api/v1/auth/password/change-initial").send({ challengeToken: passwordChallenge.challengeToken, newPassword: permanentPassword }), 200).body);
    assert.equal(mfaChallenge.status, "MFA_ENROLLMENT_REQUIRED");
    const enrollment = enrollmentSchema.parse(status(await http.post("/api/v1/auth/mfa/enroll").send({ challengeToken: mfaChallenge.challengeToken }), 200).body);
    assert.equal(enrollment.status, "MFA_CONFIRMATION_REQUIRED");
    assert.match(enrollment.otpAuthUri, /^otpauth:\/\/totp\//);
    const mfaCode = totpAt(enrollment.secret, Math.floor(Date.now() / 30_000));
    const adminLogin = tokensSchema.parse(status(await http.post("/api/v1/auth/mfa/confirm").send({ challengeToken: enrollment.challengeToken, code: mfaCode }), 200).body);
    status(await http.post("/api/v1/auth/login").send({ email: "andrew@euxora.net", password: permanentPassword, mfaCode }), 401);
    const adminAuthorization = `Bearer ${adminLogin.accessToken}`;
    for (const tenantId of [firstRegistration.tenantId, secondRegistration.tenantId]) {
      status(await http
        .post(`/api/v1/admin/tenants/${tenantId}/activate`)
        .set("Authorization", adminAuthorization)
        .send({ reason: "Automated PostgreSQL integration verification" }), 201);
    }

    const firstTokens = tokensSchema.parse(status(await http.post("/api/v1/auth/login").send({ email: first.ownerEmail, password: first.password }), 200).body);
    const firstAuthorization = `Bearer ${firstTokens.accessToken}`;
    const profile = status(await http.get("/api/v1/auth/me").set("Authorization", firstAuthorization), 200);
    const profileBody = profileSchema.parse(profile.body);
    assert.equal(profileBody.email, first.ownerEmail);
    assert.equal(profileBody.tenantRole, "OWNER");

    const category = categorySchema.parse(status(await http
      .post("/api/v1/service-categories")
      .set("Authorization", firstAuthorization)
      .send({ name: "Tenant-private category" }), 201).body);

    const location = entitySchema.parse(status(await http
      .post("/api/v1/locations")
      .set("Authorization", firstAuthorization)
      .send({ name: "Integration location", timezone: "America/Costa_Rica", isMain: true }), 201).body);
    status(await http
      .put(`/api/v1/locations/${location.id}/business-hours`)
      .set("Authorization", firstAuthorization)
      .send({ hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, isClosed: false, openTime: "00:00", closeTime: "23:59" })) }), 200);
    const catalogService = entitySchema.parse(status(await http
      .post("/api/v1/services")
      .set("Authorization", firstAuthorization)
      .send({ categoryId: category.id, name: "Buffered integration service", durationMinutes: 30, bufferBeforeMinutes: 10, bufferAfterMinutes: 15, price: 2500, currency: "CRC", showPrice: true }), 201).body);

    const slotStart = new Date(Date.now() + 48 * 60 * 60_000);
    slotStart.setUTCHours(18, 0, 0, 0);
    const holdBody = { serviceId: catalogService.id, locationId: location.id, startAt: slotStart.toISOString() };
    const firstHoldKey = randomUUID();
    const competingHoldKey = randomUUID();
    const competingHolds = await Promise.all([
      http.post(`/api/v1/public/${first.slug}/holds`).set("Idempotency-Key", firstHoldKey).send(holdBody),
      http.post(`/api/v1/public/${first.slug}/holds`).set("Idempotency-Key", competingHoldKey).send(holdBody)
    ]);
    assert.deepEqual(competingHolds.map((response) => response.status).sort(), [201, 409]);
    const winningResponse = competingHolds.find((response) => response.status === 201);
    assert.ok(winningResponse);
    const winningHoldKey = competingHolds[0].status === 201 ? firstHoldKey : competingHoldKey;
    const hold = holdSchema.parse(winningResponse.body);
    const replayedHold = holdSchema.parse(status(await http.post(`/api/v1/public/${first.slug}/holds`).set("Idempotency-Key", winningHoldKey).send(holdBody), 201).body);
    assert.equal(replayedHold.holdToken, hold.holdToken);

    const publicBookingBody = {
      ...holdBody,
      holdToken: hold.holdToken,
      customer: { firstName: "Concurrent", lastName: "Customer", email: `booking-${randomUUID()}@example.test`, phone: "88888888", consent: true }
    };
    const bookingKey = randomUUID();
    const concurrentBookings = await Promise.all([
      http.post(`/api/v1/public/${first.slug}/bookings`).set("Idempotency-Key", bookingKey).send(publicBookingBody),
      http.post(`/api/v1/public/${first.slug}/bookings`).set("Idempotency-Key", bookingKey).send(publicBookingBody)
    ]);
    assert.deepEqual(concurrentBookings.map((response) => response.status), [201, 201]);
    const firstBookingResult = bookingResultSchema.parse(concurrentBookings[0].body);
    const secondBookingResult = bookingResultSchema.parse(concurrentBookings[1].body);
    assert.equal(firstBookingResult.confirmationNonce, secondBookingResult.confirmationNonce);
    assert.equal("trackingToken" in concurrentBookings[0].body, false);
    const confirmationKey = randomUUID();
    const confirmation = confirmationResultSchema.parse(status(await http.post(`/api/v1/public/${first.slug}/booking-confirmation`).set("Idempotency-Key", confirmationKey).send({ confirmationNonce: firstBookingResult.confirmationNonce }), 200).body);
    const confirmationReplay = confirmationResultSchema.parse(status(await http.post(`/api/v1/public/${first.slug}/booking-confirmation`).set("Idempotency-Key", confirmationKey).send({ confirmationNonce: firstBookingResult.confirmationNonce }), 200).body);
    assert.equal(confirmationReplay.trackingToken, confirmation.trackingToken);
    status(await http.post(`/api/v1/public/${first.slug}/booking-confirmation`).set("Idempotency-Key", randomUUID()).send({ confirmationNonce: firstBookingResult.confirmationNonce }), 410);
    status(await http.post("/api/v1/public/tracking/lookup").send({ token: confirmation.trackingToken }), 400);
    const trackingChallenge = trackingChallengeSchema.parse(status(await http.post("/api/v1/public/tracking/verification/request").send({ token: confirmation.trackingToken }), 202).body);
    const accessDelivery = await prisma.emailDelivery.findFirst({ where: { template: "BOOKING_ACCESS_CODE", sentAt: null }, orderBy: { createdAt: "desc" } });
    assert.ok(accessDelivery);
    const accessPayload = JSON.parse(openSecret(accessDelivery.payloadEncrypted, notificationKey, "citari:email-delivery:v1")) as { code: string };
    const incorrectAccessCode = accessPayload.code === "999999" ? "000000" : "999999";
    status(await http.post("/api/v1/public/tracking/verification/confirm").send({ token: confirmation.trackingToken, challengeToken: trackingChallenge.challengeToken, code: incorrectAccessCode }), 401);
    const trackingGrant = trackingGrantSchema.parse(status(await http.post("/api/v1/public/tracking/verification/confirm").send({ token: confirmation.trackingToken, challengeToken: trackingChallenge.challengeToken, code: accessPayload.code }), 200).body);
    const replayedGrant = trackingGrantSchema.parse(status(await http.post("/api/v1/public/tracking/verification/confirm").send({ token: confirmation.trackingToken, challengeToken: trackingChallenge.challengeToken, code: accessPayload.code }), 200).body);
    assert.equal(replayedGrant.accessGrant, trackingGrant.accessGrant);
    status(await http.post("/api/v1/public/tracking/lookup").send({ token: confirmation.trackingToken, accessGrant: trackingGrant.accessGrant }), 200);
    const bookingCount = await prisma.withTenant(firstRegistration.tenantId, (tx) => tx.booking.count({ where: { tenantId: firstRegistration.tenantId, startAt: slotStart } }));
    assert.equal(bookingCount, 1);
    status(await http
      .post("/api/v1/availability-blocks")
      .set("Authorization", firstAuthorization)
      .send({
        locationId: location.id,
        startsAt: new Date(slotStart.getTime() - 10 * 60_000).toISOString(),
        endsAt: new Date(slotStart.getTime() + 45 * 60_000).toISOString(),
        reason: "Must not overlap a buffered booking"
      }), 409);
    const encryptedReplay = await prisma.withTenant(firstRegistration.tenantId, (tx) => tx.idempotencyKey.findFirst({ where: { tenantId: firstRegistration.tenantId, scope: `public-booking:${firstRegistration.tenantId}` } }));
    assert.ok(encryptedReplay?.responseBodyEncrypted);
    assert.equal(encryptedReplay.responseBody, null);
    assert.equal(encryptedReplay.responseBodyEncrypted.includes(firstBookingResult.confirmationNonce), false);

    const secondLogin = tokensSchema.parse(status(await http.post("/api/v1/auth/login").send({ email: second.ownerEmail, password: second.password }), 200).body);
    status(await http
      .patch(`/api/v1/service-categories/${category.id}`)
      .set("Authorization", `Bearer ${secondLogin.accessToken}`)
      .send({ name: "Cross-tenant mutation" }), 404);

    const rotated = tokensSchema.parse(status(await http.post("/api/v1/auth/refresh").send({ refreshToken: firstTokens.refreshToken }), 200).body);
    assert.notEqual(rotated.refreshToken, firstTokens.refreshToken);
    status(await http.post("/api/v1/auth/refresh").send({ refreshToken: firstTokens.refreshToken }), 401);
    status(await http.post("/api/v1/auth/refresh").send({ refreshToken: rotated.refreshToken }), 401);

    const recoverySession = tokensSchema.parse(status(await http.post("/api/v1/auth/login").send({ email: first.ownerEmail, password: first.password }), 200).body);
    status(await http.post("/api/v1/auth/password/reset/request").send({ email: first.ownerEmail }), 202);
    const resetDelivery = await prisma.emailDelivery.findFirst({ where: { userId: firstRegistration.userId, template: "PASSWORD_RESET", sentAt: null }, orderBy: { createdAt: "desc" } });
    assert.ok(resetDelivery);
    const resetPayload = JSON.parse(openSecret(resetDelivery.payloadEncrypted, notificationKey, "citari:email-delivery:v1")) as { token: string };
    const resetPassword = "OwnerRecoveredPassword2027B";
    status(await http.post("/api/v1/auth/password/reset").send({ challengeToken: resetPayload.token, newPassword: resetPassword }), 200);
    status(await http.post("/api/v1/auth/password/reset").send({ challengeToken: resetPayload.token, newPassword: resetPassword }), 401);
    status(await http.post("/api/v1/auth/refresh").send({ refreshToken: recoverySession.refreshToken }), 401);
    tokensSchema.parse(status(await http.post("/api/v1/auth/login").send({ email: first.ownerEmail, password: resetPassword }), 200).body);

    const unknownEmail = `missing-${randomUUID()}@example.test`;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      status(await http.post("/api/v1/auth/login").send({ email: unknownEmail, password: "IncorrectPassword2027" }), 401);
    }
    const throttled = status(await http.post("/api/v1/auth/login").send({ email: unknownEmail, password: "IncorrectPassword2027" }), 429);
    assert.equal(problemSchema.parse(throttled.body).status, 429);
    assert.match(String(throttled.headers["retry-after"]), /^\d+$/);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
