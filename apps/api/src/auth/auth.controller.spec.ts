import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuthController } from "./auth.controller.js";
describe("AuthController", () => {
  const auth = { registerOwner: vi.fn(), login: vi.fn(), changeInitialPassword: vi.fn(), beginMfaEnrollment: vi.fn(), confirmMfaEnrollment: vi.fn(), requestEmailVerification: vi.fn(), verifyEmail: vi.fn(), requestPasswordReset: vi.fn(), resetPassword: vi.fn(), refresh: vi.fn(), logout: vi.fn(), getProfile: vi.fn() };
  const controller = new AuthController(auth as never);
  it("returns the authenticated user's profile", async () => { auth.getProfile.mockResolvedValue({ id: "user", email: "a@b.co" }); await expect(controller.me({ principal: { userId: "user", tenantId: "tenant" } } as never)).resolves.toMatchObject({ id: "user" }); expect(auth.getProfile).toHaveBeenCalledWith("user", "tenant"); });
  it("rejects a missing authentication context", () => expect(() => controller.me({} as never)).toThrow(UnauthorizedException));
  it("delegates login with client metadata", () => { const body = { email: "a@b.co", password: "password" }; controller.login(body, "127.0.0.1", { headers: { "user-agent": "ua" } } as never); expect(auth.login).toHaveBeenCalledWith("a@b.co", "password", undefined, { ip: "127.0.0.1", userAgent: "ua" }, undefined); });
  it("delegates owner registration", () => { const body = { businessName: "Test", slug: "test", businessEmail: "info@test.co", ownerFirstName: "Ana", ownerLastName: "Diaz", ownerEmail: "ana@test.co", password: "StrongPassword2026" }; controller.registerOwner(body, "ip", { headers: { "user-agent": "ua" } } as never); expect(auth.registerOwner).toHaveBeenCalledWith(body, { ip: "ip", userAgent: "ua" }); });
  it("delegates rotation and logout", async () => { controller.refresh({ refreshToken: "x".repeat(32) }, "ip", { headers: {} } as never); await controller.logout({ refreshToken: "x".repeat(32) }); expect(auth.refresh).toHaveBeenCalled(); expect(auth.logout).toHaveBeenCalled(); });
  it("delegates privileged first-use steps", () => {
    const request = { headers: { "user-agent": "ua" } } as never;
    controller.changeInitialPassword({ challengeToken: "x".repeat(40), newPassword: "LongPassword2026A" }, "ip", request);
    controller.beginMfaEnrollment({ challengeToken: "x".repeat(40) }, "ip", request);
    controller.confirmMfaEnrollment({ challengeToken: "x".repeat(40), code: "123456" }, "ip", request);
    expect(auth.changeInitialPassword).toHaveBeenCalled();
    expect(auth.beginMfaEnrollment).toHaveBeenCalled();
    expect(auth.confirmMfaEnrollment).toHaveBeenCalled();
  });
  it("delegates verification and recovery without returning secrets", () => {
    controller.requestEmailVerification({ email: "owner@example.com" }, "ip");
    controller.verifyEmail({ challengeToken: "x".repeat(40) }, "ip");
    controller.requestPasswordReset({ email: "owner@example.com" }, "ip");
    controller.resetPassword({ challengeToken: "x".repeat(40), newPassword: "PermanentPassword2026" }, "ip");
    expect(auth.requestEmailVerification).toHaveBeenCalledWith("owner@example.com", { ip: "ip" });
    expect(auth.verifyEmail).toHaveBeenCalledWith("x".repeat(40), { ip: "ip" });
    expect(auth.requestPasswordReset).toHaveBeenCalledWith("owner@example.com", { ip: "ip" });
    expect(auth.resetPassword).toHaveBeenCalled();
  });
});
