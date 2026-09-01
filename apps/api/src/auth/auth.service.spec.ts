import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hash, verify } from "argon2";
import { AuthService } from "./auth.service.js";
vi.mock("argon2", () => ({ hash: vi.fn(), verify: vi.fn() }));
const env = { JWT_SECRET: "s".repeat(32), JWT_ISSUER: "https://issuer.test", JWT_AUDIENCE: "citari" } as never;
describe("AuthService", () => {
  let prisma: any; let service: AuthService;
  beforeEach(() => { prisma = { user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() }, tenant: { findUnique: vi.fn(), create: vi.fn() }, tenantMembership: { create: vi.fn(), findFirst: vi.fn() }, tenantContact: { createMany: vi.fn() }, auditEvent: { create: vi.fn() }, session: { create: vi.fn().mockResolvedValue({}), updateMany: vi.fn() }, $executeRaw: vi.fn(), withTenant: vi.fn((_tenantId, fn) => fn(prisma)), $transaction: vi.fn((fn) => fn(prisma)) }; service = new AuthService(prisma, env); vi.mocked(hash).mockResolvedValue("argon-hash"); vi.mocked(verify).mockResolvedValue(true); });
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
    expect(pair).toMatchObject({ tokenType: "Bearer", expiresIn: 900 }); expect(pair.accessToken.split(".")).toHaveLength(3);
  });
  it("uses one indistinguishable authentication error", async () => { prisma.user.findUnique.mockResolvedValue(null); await expect(service.login("x@y.com", "password", undefined, {})).rejects.toBeInstanceOf(UnauthorizedException); });
  it("rejects a tenant the user does not belong to", async () => { prisma.user.findUnique.mockResolvedValue({ id: "u", isActive: true, passwordHash: "h", globalRole: null }); prisma.tenantMembership.findFirst.mockResolvedValue(null); await expect(service.login("x@y.com", "password", "t", {})).rejects.toBeInstanceOf(UnauthorizedException); });
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
});
