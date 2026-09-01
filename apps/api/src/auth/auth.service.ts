import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { hash, verify } from "argon2";
import { SignJWT } from "jose";
import { ENVIRONMENT, type Environment } from "../config/environment.js";
import { PrismaService, type TransactionClient } from "../database/prisma.service.js";
import type { RegisterOwnerDto } from "./auth.dto.js";
import { buildOtpAuthUri, decryptMfaSecret, encryptMfaSecret, generateMfaSecret, verifyTotpStep } from "./mfa.js";

interface ClientContext { ip?: string | undefined; userAgent?: string | undefined }
export interface TokenPair { accessToken: string; refreshToken: string; tokenType: "Bearer"; expiresIn: number }
type ChallengePurpose = "PASSWORD_CHANGE" | "MFA_ENROLL" | "MFA_CONFIRM";
type IssuedChallenge =
  | { status: "PASSWORD_CHANGE_REQUIRED"; challengeToken: string; expiresIn: number }
  | { status: "MFA_ENROLLMENT_REQUIRED"; challengeToken: string; expiresIn: number };
type AuthStep =
  | IssuedChallenge
  | { status: "MFA_CONFIRMATION_REQUIRED"; challengeToken: string; expiresIn: number; secret: string; otpAuthUri: string }
  | { status: "MFA_REQUIRED" };
export type AuthResult = TokenPair | AuthStep;

const ACCESS_TTL_SECONDS = 900;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_SECONDS = 10 * 60;
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,p=1,t=3$Brd4ak0RFm+6Bw2wqWxNkg$YQrbTLW1M+sHBxBxl0oXDZzFmWaAZfc/sT/Gh0dycRE";
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

@Injectable()
export class AuthService {
  private readonly key: Uint8Array;

  constructor(private readonly prisma: PrismaService, @Inject(ENVIRONMENT) private readonly env: Environment) {
    this.key = new TextEncoder().encode(env.JWT_SECRET);
  }

  async registerOwner(input: RegisterOwnerDto) {
    const email = input.ownerEmail.trim().toLowerCase();
    const slug = input.slug.trim().toLowerCase();
    const [existingUser, existingTenant] = await Promise.all([
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
      this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } })
    ]);
    if (existingUser || existingTenant) throw new ConflictException("The email or public slug is already registered");
    const passwordHash = await this.hashPassword(input.password);
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

  async login(email: string, password: string, tenantId: string | undefined, client: ClientContext, mfaCode?: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const passwordMatches = await verify(user?.passwordHash ?? DUMMY_PASSWORD_HASH, password);
    if (!user?.isActive || !user.passwordHash || !passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }
    if (user.globalRole === "SUPER_ADMIN" && !user.emailVerifiedAt) {
      throw new ForbiddenException("Email verification is required");
    }

    const context = await this.prisma.$transaction((tx) => this.resolveAccessContext(tx, user.id, user.globalRole ?? undefined, tenantId));
    if (!user.globalRole && !context.tenantId) throw new UnauthorizedException("Tenant access is unavailable");
    if (user.passwordChangeRequired) return this.createChallenge(user.id, context.tenantId, "PASSWORD_CHANGE");
    const encryptedMfaSecret = user.mfaSecretEncrypted;
    if (user.mfaRequired) {
      if (!user.mfaEnrolledAt || !encryptedMfaSecret) return this.createChallenge(user.id, context.tenantId, "MFA_ENROLL");
      if (!mfaCode) return { status: "MFA_REQUIRED" };
      const step = verifyTotpStep(decryptMfaSecret(encryptedMfaSecret, this.env.MFA_ENCRYPTION_KEY), mfaCode);
      if (step === null) throw new UnauthorizedException("Multi-factor authentication failed");
      return this.prisma.$transaction(async (tx) => {
        const accepted = await tx.user.updateMany({
          where: { id: user.id, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: BigInt(step) } }] },
          data: { mfaLastUsedStep: BigInt(step) }
        });
        if (accepted.count !== 1) throw new UnauthorizedException("Multi-factor authentication failed");
        const current = await this.resolveAccessContext(tx, user.id, user.globalRole ?? undefined, context.tenantId);
        return this.issue(user.id, user.globalRole ?? undefined, current.tenantId, current.tenantRole, randomUUID(), client, tx, true);
      });
    }
    return this.issue(user.id, user.globalRole ?? undefined, context.tenantId, context.tenantRole, randomUUID(), client);
  }

  async changeInitialPassword(challengeToken: string, newPassword: string, client: ClientContext): Promise<AuthResult> {
    const passwordHash = await this.hashPassword(newPassword);
    return this.prisma.$transaction(async (tx) => {
      const challenge = await this.consumeChallenge(tx, challengeToken, "PASSWORD_CHANGE");
      if (challenge.user.passwordHash && await verify(challenge.user.passwordHash, newPassword)) {
        throw new ConflictException("The new password must be different from the temporary password");
      }
      await tx.user.update({ where: { id: challenge.userId }, data: { passwordHash, passwordChangeRequired: false } });
      await tx.session.updateMany({ where: { userId: challenge.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.recordSecurityEvent(tx, challenge.userId, challenge.tenantId, "INITIAL_PASSWORD_CHANGED");
      if (challenge.user.mfaRequired) return this.createChallengeInTransaction(tx, challenge.userId, challenge.tenantId ?? undefined, "MFA_ENROLL");
      const context = await this.resolveAccessContext(tx, challenge.userId, challenge.user.globalRole ?? undefined, challenge.tenantId ?? undefined);
      return this.issue(challenge.userId, challenge.user.globalRole ?? undefined, context.tenantId, context.tenantRole, randomUUID(), client, tx);
    });
  }

  async beginMfaEnrollment(challengeToken: string): Promise<AuthStep> {
    return this.prisma.$transaction(async (tx) => {
      const challenge = await this.consumeChallenge(tx, challengeToken, "MFA_ENROLL");
      if (!challenge.user.mfaRequired) throw new ForbiddenException("Multi-factor enrollment is unavailable");
      const secret = generateMfaSecret();
      await tx.user.update({
        where: { id: challenge.userId },
        data: { mfaSecretEncrypted: encryptMfaSecret(secret, this.env.MFA_ENCRYPTION_KEY), mfaEnrolledAt: null, mfaLastUsedStep: null }
      });
      const confirmation = await this.createChallengeInTransaction(tx, challenge.userId, challenge.tenantId ?? undefined, "MFA_CONFIRM");
      return { ...confirmation, status: "MFA_CONFIRMATION_REQUIRED", secret, otpAuthUri: buildOtpAuthUri(secret, challenge.user.email) };
    });
  }

  async confirmMfaEnrollment(challengeToken: string, code: string, client: ClientContext): Promise<TokenPair> {
    return this.prisma.$transaction(async (tx) => {
      const challenge = await this.consumeChallenge(tx, challengeToken, "MFA_CONFIRM");
      if (!challenge.user.mfaRequired || !challenge.user.mfaSecretEncrypted) throw new ForbiddenException("Multi-factor enrollment is unavailable");
      const step = verifyTotpStep(decryptMfaSecret(challenge.user.mfaSecretEncrypted, this.env.MFA_ENCRYPTION_KEY), code);
      if (step === null) throw new UnauthorizedException("Multi-factor authentication failed");
      await tx.user.update({ where: { id: challenge.userId }, data: { mfaEnrolledAt: new Date(), mfaLastUsedStep: BigInt(step) } });
      await tx.session.updateMany({ where: { userId: challenge.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.recordSecurityEvent(tx, challenge.userId, challenge.tenantId, "MFA_ENROLLED");
      const context = await this.resolveAccessContext(tx, challenge.userId, challenge.user.globalRole ?? undefined, challenge.tenantId ?? undefined);
      return this.issue(challenge.userId, challenge.user.globalRole ?? undefined, context.tenantId, context.tenantRole, randomUUID(), client, tx, true);
    });
  }

  async refresh(rawToken: string, client: ClientContext): Promise<TokenPair> {
    const tokenHash = digest(rawToken);
    const tokens = await this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({ where: { refreshTokenHash: tokenHash }, include: { user: true } });
      const authenticationIncomplete = (session?.user.passwordChangeRequired ?? false) || ((session?.user.mfaRequired ?? false) && !session?.user.mfaEnrolledAt);
      if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive || authenticationIncomplete) {
        if (session) await tx.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        return null;
      }
      const revoked = await tx.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date(), lastUsedAt: new Date() } });
      if (revoked.count !== 1) {
        await tx.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        return null;
      }
      const context = await this.resolveAccessContext(tx, session.userId, session.user.globalRole ?? undefined, session.tenantId ?? undefined);
      if (session.tenantId && !context.tenantId) {
        await tx.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        return null;
      }
      return this.issue(session.userId, session.user.globalRole ?? undefined, context.tenantId, context.tenantRole, session.familyId, client, tx, session.user.mfaRequired);
    });
    if (!tokens) throw new UnauthorizedException("Refresh token is invalid or expired");
    return tokens;
  }

  async logout(rawToken: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { refreshTokenHash: digest(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async getProfile(userId: string, tenantId?: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true, email: true, firstName: true, lastName: true, globalRole: true, passwordChangeRequired: true, mfaRequired: true, mfaEnrolledAt: true } });
    if (!user) throw new UnauthorizedException("Authenticated user is unavailable");
    const membership = tenantId ? await this.prisma.withTenant(tenantId, (tx) => tx.tenantMembership.findFirst({ where: { tenantId, userId }, select: { tenantId: true, role: true } })) : null;
    return { ...user, mfaEnrolled: Boolean(user.mfaEnrolledAt), mfaEnrolledAt: undefined, tenantId: membership?.tenantId ?? null, tenantRole: membership?.role ?? null };
  }

  private async hashPassword(password: string): Promise<string> {
    return hash(password, { type: 2, memoryCost: 65_536, timeCost: 3, parallelism: 1 });
  }

  private async createChallenge(userId: string, tenantId: string | undefined, purpose: ChallengePurpose): Promise<IssuedChallenge> {
    return this.prisma.$transaction((tx) => this.createChallengeInTransaction(tx, userId, tenantId, purpose));
  }

  private async createChallengeInTransaction(tx: TransactionClient, userId: string, tenantId: string | undefined, purpose: ChallengePurpose): Promise<IssuedChallenge> {
    const rawToken = randomBytes(32).toString("base64url");
    const now = new Date();
    await tx.authChallenge.updateMany({ where: { userId, purpose, consumedAt: null }, data: { consumedAt: now } });
    await tx.authChallenge.create({ data: { userId, tenantId: tenantId ?? null, purpose, tokenHash: digest(rawToken), expiresAt: new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000) } });
    const status = purpose === "PASSWORD_CHANGE" ? "PASSWORD_CHANGE_REQUIRED" : "MFA_ENROLLMENT_REQUIRED";
    return { status, challengeToken: rawToken, expiresIn: CHALLENGE_TTL_SECONDS };
  }

  private async consumeChallenge(tx: TransactionClient, rawToken: string, expectedPurpose: ChallengePurpose) {
    const challenge = await tx.authChallenge.findUnique({ where: { tokenHash: digest(rawToken) }, include: { user: true } });
    if (!challenge?.user.isActive || challenge.purpose !== expectedPurpose || challenge.consumedAt || challenge.expiresAt <= new Date()) {
      throw new UnauthorizedException("Authentication challenge is invalid or expired");
    }
    const consumed = await tx.authChallenge.updateMany({ where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) throw new UnauthorizedException("Authentication challenge is invalid or expired");
    return challenge;
  }

  private async resolveAccessContext(tx: TransactionClient, userId: string, globalRole: "SUPER_ADMIN" | undefined, tenantId?: string) {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    if (tenantId) {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      const membership = await tx.tenantMembership.findFirst({ where: { userId, tenantId, tenant: { status: "ACTIVE" } } });
      if (!membership && !globalRole) throw new UnauthorizedException("Tenant access is unavailable");
      return { tenantId: membership?.tenantId, tenantRole: membership?.role };
    }
    if (globalRole) return { tenantId: undefined, tenantRole: undefined };
    const membership = await tx.tenantMembership.findFirst({ where: { userId, tenant: { status: "ACTIVE" } }, orderBy: { createdAt: "asc" } });
    return { tenantId: membership?.tenantId, tenantRole: membership?.role };
  }

  private async recordSecurityEvent(tx: TransactionClient, userId: string, tenantId: string | null, action: string): Promise<void> {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    if (tenantId) await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.auditEvent.create({ data: { tenantId, actorUserId: userId, action, entityType: "User", entityId: userId } });
  }

  private async issue(userId: string, globalRole: "SUPER_ADMIN" | undefined, tenantId: string | undefined, tenantRole: "OWNER" | "ADMIN" | "STAFF" | undefined, familyId: string, client: ClientContext, tx: TransactionClient | PrismaService = this.prisma, mfaVerified = false): Promise<TokenPair> {
    const refreshToken = randomBytes(48).toString("base64url");
    await tx.session.create({ data: { userId, tenantId: tenantId ?? null, familyId, refreshTokenHash: digest(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS), ipHash: client.ip ? digest(client.ip) : null, userAgent: client.userAgent?.slice(0, 512) ?? null } });
    const claims: Record<string, unknown> = { amr: mfaVerified ? ["pwd", "otp"] : ["pwd"] };
    if (globalRole) claims.globalRole = globalRole;
    if (tenantId) claims.tenantId = tenantId;
    if (tenantRole) claims.tenantRole = tenantRole;
    const accessToken = await new SignJWT(claims).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(userId).setIssuer(this.env.JWT_ISSUER).setAudience(this.env.JWT_AUDIENCE).setIssuedAt().setJti(randomUUID()).setExpirationTime("15m").sign(this.key);
    return { accessToken, refreshToken, tokenType: "Bearer", expiresIn: ACCESS_TTL_SECONDS };
  }
}
