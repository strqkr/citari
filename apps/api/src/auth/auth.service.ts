import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { hash, verify } from "argon2";
import { SignJWT } from "jose";
import { PrismaService, type TransactionClient } from "../database/prisma.service.js";
import { ENVIRONMENT, type Environment } from "../config/environment.js";
import type { RegisterOwnerDto } from "./auth.dto.js";
interface ClientContext { ip?: string | undefined; userAgent?: string | undefined }
interface TokenPair { accessToken: string; refreshToken: string; tokenType: "Bearer"; expiresIn: number }
const ACCESS_TTL_SECONDS = 900;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
@Injectable()
export class AuthService {
  private readonly key: Uint8Array;
  constructor(private readonly prisma: PrismaService, @Inject(ENVIRONMENT) private readonly env: Environment) { this.key = new TextEncoder().encode(env.JWT_SECRET); }
  async registerOwner(input: RegisterOwnerDto) {
    const email = input.ownerEmail.trim().toLowerCase();
    const slug = input.slug.trim().toLowerCase();
    const [existingUser, existingTenant] = await Promise.all([
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
      this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } })
    ]);
    if (existingUser || existingTenant) throw new ConflictException("The email or public slug is already registered");
    const passwordHash = await hash(input.password, { type: 2, memoryCost: 65_536, timeCost: 3, parallelism: 1 });
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: {
        name: input.businessName.trim(), slug, timezone: "America/Costa_Rica", locale: "es-CR", currency: "CRC"
      } });
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
      const user = await tx.user.create({ data: {
        email,
        firstName: input.ownerFirstName.trim(),
        lastName: input.ownerLastName.trim(),
        passwordHash,
        passwordChangeRequired: false
      } });
      await tx.tenantMembership.create({ data: { tenantId: tenant.id, userId: user.id, role: "OWNER" } });
      await tx.tenantContact.createMany({ data: [
        { tenantId: tenant.id, kind: "EMAIL", value: input.businessEmail.trim().toLowerCase(), isPrimary: true },
        ...(input.phone ? [{ tenantId: tenant.id, kind: "PHONE" as const, value: input.phone.trim(), isPrimary: true }] : [])
      ] });
      await tx.auditEvent.create({ data: { tenantId: tenant.id, actorUserId: user.id, action: "TENANT_REGISTRATION_SUBMITTED", entityType: "Tenant", entityId: tenant.id } });
      return { tenantId: tenant.id, userId: user.id, status: tenant.status };
    });
  }
  async login(email: string, password: string, tenantId: string | undefined, client: ClientContext): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user?.isActive || !user.passwordHash || !(await verify(user.passwordHash, password))) throw new UnauthorizedException("Invalid email or password");
    const membership = tenantId
      ? await this.prisma.withTenant(tenantId, (tx) => tx.tenantMembership.findFirst({ where: { userId: user.id, tenantId, tenant: { status: "ACTIVE" } } }))
      : await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.user_id', ${user.id}, true)`;
          return tx.tenantMembership.findFirst({ where: { userId: user.id, tenant: { status: "ACTIVE" } }, orderBy: { createdAt: "asc" } });
        });
    if (!user.globalRole && !membership) throw new UnauthorizedException("Tenant access is unavailable");
    return this.issue(user.id, user.globalRole ?? undefined, membership?.tenantId, membership?.role, randomUUID(), client);
  }
  async refresh(rawToken: string, client: ClientContext): Promise<TokenPair> {
    const tokenHash = digest(rawToken);
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({ where: { refreshTokenHash: tokenHash }, include: { user: true } });
      if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) {
        if (session) await tx.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        throw new UnauthorizedException("Refresh token is invalid or expired");
      }
      const revoked = await tx.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date(), lastUsedAt: new Date() } });
      if (revoked.count !== 1) { await tx.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } }); throw new UnauthorizedException("Refresh token reuse detected"); }
      const sessionTenantId = session.tenantId;
      const membership = sessionTenantId ? await (async () => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${sessionTenantId}, true)`;
        return tx.tenantMembership.findFirst({ where: { userId: session.userId, tenantId: sessionTenantId, tenant: { status: "ACTIVE" } } });
      })() : null;
      if (sessionTenantId && !membership) throw new UnauthorizedException("Tenant access is unavailable");
      return this.issue(session.userId, session.user.globalRole ?? undefined, membership?.tenantId, membership?.role, session.familyId, client, tx);
    });
  }
  async logout(rawToken: string): Promise<void> { await this.prisma.session.updateMany({ where: { refreshTokenHash: digest(rawToken), revokedAt: null }, data: { revokedAt: new Date() } }); }
  async getProfile(userId: string, tenantId?: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true, email: true, firstName: true, lastName: true, globalRole: true, passwordChangeRequired: true, mfaRequired: true } });
    if (!user) throw new UnauthorizedException("Authenticated user is unavailable");
    const membership = tenantId ? await this.prisma.withTenant(tenantId, (tx) => tx.tenantMembership.findFirst({ where: { tenantId, userId }, select: { tenantId: true, role: true } })) : null;
    return { ...user, tenantId: membership?.tenantId ?? null, tenantRole: membership?.role ?? null };
  }
  private async issue(userId: string, globalRole: "SUPER_ADMIN" | undefined, tenantId: string | undefined, tenantRole: "OWNER" | "ADMIN" | "STAFF" | undefined, familyId: string, client: ClientContext, tx: TransactionClient | PrismaService = this.prisma): Promise<TokenPair> {
    const refreshToken = randomBytes(48).toString("base64url");
    await tx.session.create({ data: { userId, tenantId: tenantId ?? null, familyId, refreshTokenHash: digest(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS), ipHash: client.ip ? digest(client.ip) : null, userAgent: client.userAgent?.slice(0, 512) ?? null } });
    const claims: Record<string, string> = {}; if (globalRole) claims.globalRole = globalRole; if (tenantId) claims.tenantId = tenantId; if (tenantRole) claims.tenantRole = tenantRole;
    const accessToken = await new SignJWT(claims).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(userId).setIssuer(this.env.JWT_ISSUER).setAudience(this.env.JWT_AUDIENCE).setIssuedAt().setJti(randomUUID()).setExpirationTime("15m").sign(this.key);
    return { accessToken, refreshToken, tokenType: "Bearer", expiresIn: ACCESS_TTL_SECONDS };
  }
}
