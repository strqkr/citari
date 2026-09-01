import { UnauthorizedException } from "@nestjs/common";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
const env = { JWT_SECRET: "s".repeat(32), JWT_ISSUER: "https://issuer.test", JWT_AUDIENCE: "citari" } as never;
function context(authorization?: string): { ctx: never; request: { headers: { authorization?: string }; principal?: unknown } } {
  const request = { headers: authorization ? { authorization } : {} };
  return { request, ctx: { switchToHttp: () => ({ getRequest: () => request }) } as never };
}
describe("JwtAuthGuard", () => {
  it("accepts a constrained token and attaches its principal", async () => {
    const token = await new SignJWT({ tenantId: "tenant", tenantRole: "OWNER" }).setProtectedHeader({ alg: "HS256" }).setSubject("user").setIssuer("https://issuer.test").setAudience("citari").setExpirationTime("1h").sign(new TextEncoder().encode("s".repeat(32)));
    const value = context(`Bearer ${token}`);
    await expect(new JwtAuthGuard(env).canActivate(value.ctx)).resolves.toBe(true);
    expect(value.request.principal).toMatchObject({ userId: "user", tenantId: "tenant", tenantRole: "OWNER" });
  });
  it("rejects missing tokens", async () => await expect(new JwtAuthGuard(env).canActivate(context().ctx)).rejects.toBeInstanceOf(UnauthorizedException));
  it("rejects invalid tokens", async () => await expect(new JwtAuthGuard(env).canActivate(context("Bearer invalid").ctx)).rejects.toBeInstanceOf(UnauthorizedException));
});
