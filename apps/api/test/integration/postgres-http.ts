import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request, { type Response } from "supertest";
import { z } from "zod";
import { createApplication } from "../../src/bootstrap.js";
import { totpAt } from "../../src/auth/mfa.js";

const tokensSchema = z.object({ accessToken: z.string(), refreshToken: z.string() });
const registrationResponseSchema = z.object({ tenantId: z.uuid(), status: z.string() });
const profileSchema = z.object({ email: z.email(), tenantRole: z.string().nullable() });
const categorySchema = z.object({ id: z.uuid() });
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

  const app = await createApplication();
  const http = request(app.getHttpServer());
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

    const secondLogin = tokensSchema.parse(status(await http.post("/api/v1/auth/login").send({ email: second.ownerEmail, password: second.password }), 200).body);
    status(await http
      .patch(`/api/v1/service-categories/${category.id}`)
      .set("Authorization", `Bearer ${secondLogin.accessToken}`)
      .send({ name: "Cross-tenant mutation" }), 404);

    const rotated = tokensSchema.parse(status(await http.post("/api/v1/auth/refresh").send({ refreshToken: firstTokens.refreshToken }), 200).body);
    assert.notEqual(rotated.refreshToken, firstTokens.refreshToken);
    status(await http.post("/api/v1/auth/refresh").send({ refreshToken: firstTokens.refreshToken }), 401);
    status(await http.post("/api/v1/auth/refresh").send({ refreshToken: rotated.refreshToken }), 401);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
