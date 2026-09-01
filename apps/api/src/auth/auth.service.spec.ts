import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hash, verify } from "argon2";
import { AuthService } from "./auth.service.js";
import { encryptMfaSecret, totpAt } from "./mfa.js";
vi.mock("argon2", () => ({ hash: vi.fn(), verify: vi.fn() }));
const env = { JWT_SECRET: "s".repeat(32), JWT_ISSUER: "https://issuer.test", JWT_AUDIENCE: "citari", MFA_ENCRYPTION_KEY: "m".repeat(32) } as never;
describe("AuthService", () => {
  let prisma: any; let service: AuthService;
  beforeEach(() => { prisma = { user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() }, tenant: { findUnique: vi.fn(), create: vi.fn() }, tenantMembership: { create: vi.fn(), findFirst: vi.fn() }, tenantContact: { createMany: vi.fn() }, auditEvent: { create: vi.fn() }, authChallenge: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() }, session: { create: vi.fn().mockResolvedValue({}), findUnique: vi.fn(), updateMany: vi.fn() }, $executeRaw: vi.fn(), withTenant: vi.fn((_tenantId, fn) => fn(prisma)), $transaction: vi.fn((fn) => fn(prisma)) }; service = new AuthService(prisma, env); vi.mocked(hash).mockResolvedValue("argon-hash"); vi.mocked(verify).mockResolvedValue(true); prisma.authChallenge.updateMany.mockResolvedValue({ count: 1 }); prisma.user.updateMany.mockResolvedValue({ count: 1 }); });
  it("registers a pending tenant owner atomically without demo data", async () => {
    prisma.user.findUnique.mockResolvedValue(null); prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.tenant.create.mockResolvedValue({ id: "t", status: "PENDING_VERIFICATION" }); prisma.user.create.mockResolvedValue({ id: "u" });
    await expect(service.registerOwner({ businessName: "Citari Test", slug: "citari-test", businessEmail: "INFO@TEST.CO", ownerFirstName: "Ana", ownerLastName: "Diaz", ownerEmail: "ANA@TEST.CO", password: "StrongPassword2026", phone: "8888-8888" })).resolves.toEqual({ tenantId: "t", userId: "u", status: "PENDING_VERIFICATION" });
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: "ana@test.co", passwordHash: "argon-hash" }) });
    expect(prisma.tenantMembership.create).toHaveBeenCalledWith({ data: { tenantId: "t", userId: "u", role: "OWNER" } });
    expect(prisma.tenantContact.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ kind: "EMAIL", value: "info@test.co" }), expect.objectContaining({ kind: "PHONE" })]) });
  });
  it("rejects an existing registration identity", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u" }); prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(service.registerOwner({ businessName: "Test", slug: "test", businessEmail: "info@test.co", ownerFirstName: "Ana", ownerLastName: "Diaz", ownerEmail: "ana@test.co", password: "StrongPassword2026" })).rejects.toBeInstanceOf(ConflictException);
  });
  it("normalizes credentials, selects membership and creates a hashed session", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u", isActive: true, passwordHash: "hash", globalRole: null }); prisma.tenantMembership.findFirst.mockResolvedValue({ tenantId: "t", role: "OWNER" });
    const pair = await service.login(" USER@EXAMPLE.COM ", "password", "t", { ip: "127.0.0.1", userAgent: "test" });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "user@example.com" } }));
    expect(prisma.session.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "u", familyId: expect.any(String), refreshTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/), ipHash: expect.stringMatching(/^[a-f0-9]{64}$/) }) });
    expect(pair).toMatchObject({ tokenType: "Bearer", expiresIn: 900 }); expect("accessToken" in pair && pair.accessToken.split(".")).toHaveLength(3);
  });
  it("uses one indistinguishable authentication error and a dummy hash for unknown users", async () => { prisma.user.findUnique.mockResolvedValue(null); await expect(service.login("x@y.com", "password", undefined, {})).rejects.toBeInstanceOf(UnauthorizedException); expect(verify).toHaveBeenCalledWith(expect.stringMatching(/^\$argon2id\$/), "password"); });
  it("rejects a tenant the user does not belong to", async () => { prisma.user.findUnique.mockResolvedValue({ id: "u", isActive: true, passwordHash: "h", globalRole: null }); prisma.tenantMembership.findFirst.mockResolvedValue(null); await expect(service.login("x@y.com", "password", "t", {})).rejects.toBeInstanceOf(UnauthorizedException); });
  it("issues only a hashed password-change challenge for first superadmin access", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u", isActive: true, passwordHash: "h", globalRole: "SUPER_ADMIN", emailVerifiedAt: new Date(), passwordChangeRequired: true, mfaRequired: true });
    const result = await service.login("andrew@example.com", "temporary", undefined, {});
    expect(result).toMatchObject({ status: "PASSWORD_CHANGE_REQUIRED", expiresIn: 600, challengeToken: expect.any(String) });
    const raw = "challengeToken" in result ? result.challengeToken : "";
    expect(prisma.authChallenge.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/), purpose: "PASSWORD_CHANGE" }) });
    expect(JSON.stringify(prisma.authChallenge.create.mock.calls)).not.toContain(raw);
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
  it("requires verified email for a superadmin even after valid password verification", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u", isActive: true, passwordHash: "h", globalRole: "SUPER_ADMIN", emailVerifiedAt: null });
    await expect(service.login("andrew@example.com", "temporary", undefined, {})).rejects.toMatchObject({ status: 403 });
  });
  it("changes the temporary password, revokes sessions, audits, and advances to MFA", async () => {
    vi.mocked(verify).mockResolvedValue(false);
    prisma.authChallenge.findUnique.mockResolvedValue({ id: "c", userId: "u", tenantId: null, purpose: "PASSWORD_CHANGE", consumedAt: null, expiresAt: new Date(Date.now() + 60_000), user: { id: "u", email: "andrew@example.com", isActive: true, passwordHash: "old", globalRole: "SUPER_ADMIN", mfaRequired: true } });
    const result = await service.changeInitialPassword("x".repeat(43), "PermanentPassword2026", {});
    expect(result).toMatchObject({ status: "MFA_ENROLLMENT_REQUIRED", challengeToken: expect.any(String) });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u" }, data: { passwordHash: "argon-hash", passwordChangeRequired: false } });
    expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u", revokedAt: null } }));
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "INITIAL_PASSWORD_CHANGED" }) });
  });
  it("generates an encrypted MFA enrollment secret and a one-use confirmation challenge", async () => {
    prisma.authChallenge.findUnique.mockResolvedValue({ id: "c", userId: "u", tenantId: null, purpose: "MFA_ENROLL", consumedAt: null, expiresAt: new Date(Date.now() + 60_000), user: { id: "u", email: "andrew@example.com", isActive: true, mfaRequired: true } });
    const result = await service.beginMfaEnrollment("x".repeat(43));
    expect(result).toMatchObject({ status: "MFA_CONFIRMATION_REQUIRED", challengeToken: expect.any(String), secret: expect.any(String), otpAuthUri: expect.stringContaining("otpauth://") });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u" }, data: expect.objectContaining({ mfaSecretEncrypted: expect.any(String), mfaEnrolledAt: null }) });
    expect(JSON.stringify(prisma.user.update.mock.calls)).not.toContain(result.status === "MFA_CONFIRMATION_REQUIRED" ? result.secret : "not-present");
  });
  it("confirms MFA, records the anti-replay step, and creates the first privileged session", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const step = Math.floor(Date.now() / 30_000);
    prisma.authChallenge.findUnique.mockResolvedValue({ id: "c", userId: "u", tenantId: null, purpose: "MFA_CONFIRM", consumedAt: null, expiresAt: new Date(Date.now() + 60_000), user: { id: "u", email: "andrew@example.com", isActive: true, mfaRequired: true, mfaSecretEncrypted: encryptMfaSecret(secret, "m".repeat(32)), globalRole: "SUPER_ADMIN" } });
    const result = await service.confirmMfaEnrollment("x".repeat(43), totpAt(secret, step), {});
    expect(result).toMatchObject({ tokenType: "Bearer", accessToken: expect.any(String) });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u" }, data: expect.objectContaining({ mfaEnrolledAt: expect.any(Date), mfaLastUsedStep: BigInt(step) }) });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "MFA_ENROLLED" }) });
  });
  it("requires and validates TOTP for every later privileged login", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const step = Math.floor(Date.now() / 30_000);
    prisma.user.findUnique.mockResolvedValue({ id: "u", isActive: true, passwordHash: "h", globalRole: "SUPER_ADMIN", emailVerifiedAt: new Date(), passwordChangeRequired: false, mfaRequired: true, mfaEnrolledAt: new Date(), mfaSecretEncrypted: encryptMfaSecret(secret, "m".repeat(32)) });
    await expect(service.login("andrew@example.com", "password", undefined, {})).resolves.toEqual({ status: "MFA_REQUIRED" });
    const result = await service.login("andrew@example.com", "password", undefined, {}, totpAt(secret, step));
    expect(result).toMatchObject({ tokenType: "Bearer" });
    expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { mfaLastUsedStep: BigInt(step) } }));
  });
  it("rejects consumed or expired authentication challenges", async () => {
    prisma.authChallenge.findUnique.mockResolvedValue({ id: "c", userId: "u", purpose: "MFA_ENROLL", consumedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), user: { isActive: true } });
    await expect(service.beginMfaEnrollment("x".repeat(43))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it("revokes a refresh token idempotently on logout", async () => { prisma.session.updateMany.mockResolvedValue({ count: 1 }); await service.logout("x".repeat(32)); expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { revokedAt: expect.any(Date) } })); });
  it("returns a production profile and active tenant role", async () => { prisma.user.findFirst.mockResolvedValue({ id: "u", email: "a@b.co" }); prisma.tenantMembership.findFirst.mockResolvedValue({ tenantId: "t", role: "OWNER" }); await expect(service.getProfile("u", "t")).resolves.toMatchObject({ id: "u", tenantId: "t", tenantRole: "OWNER" }); });
  it("rejects a deleted or disabled profile", async () => { prisma.user.findFirst.mockResolvedValue(null); await expect(service.getProfile("u")).rejects.toBeInstanceOf(UnauthorizedException); });
  it("rotates a valid refresh token atomically", async () => {
    prisma.session.findUnique = vi.fn().mockResolvedValue({ id: "s", userId: "u", familyId: "f", revokedAt: null, expiresAt: new Date(Date.now() + 10000), user: { isActive: true, globalRole: null, memberships: [] } });
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
    const pair = await service.refresh("x".repeat(32), {}); expect(pair.refreshToken).not.toBe("x".repeat(32)); expect(prisma.session.create).toHaveBeenCalled();
  });
  it("rejects expired refresh tokens and revokes their family", async () => {
    prisma.session.findUnique = vi.fn().mockResolvedValue({ familyId: "f", revokedAt: null, expiresAt: new Date(0), user: { isActive: true } }); prisma.session.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.refresh("x".repeat(32), {})).rejects.toBeInstanceOf(UnauthorizedException); expect(prisma.session.updateMany).toHaveBeenCalled();
  });
  it("revokes refresh families when privileged authentication becomes incomplete", async () => {
    prisma.session.findUnique.mockResolvedValue({ familyId: "f", revokedAt: null, expiresAt: new Date(Date.now() + 10_000), user: { isActive: true, passwordChangeRequired: true, mfaRequired: true, mfaEnrolledAt: null } });
    await expect(service.refresh("x".repeat(32), {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({ where: { familyId: "f", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });
});
