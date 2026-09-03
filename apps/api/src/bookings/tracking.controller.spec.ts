import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { TrackingAdminController } from "./tracking-admin.controller.js";
import { TrackingController } from "./tracking.controller.js";

describe("tracking controllers", () => {
  const tracking = { issue: vi.fn(), requestVerification: vi.fn(), verifyAccess: vi.fn(), get: vi.fn(), cancel: vi.fn(), reschedule: vi.fn() };
  const abuse = { assertAllowed: vi.fn() };

  it("requires an emailed code before lookup", async () => {
    const controller = new TrackingController(tracking as never, abuse as never);
    await controller.requestVerification({ token: "tracking-secret" }, "ip");
    await controller.verify({ token: "tracking-secret", challengeToken: "challenge", code: "123456" }, "ip");
    await controller.lookup({ token: "tracking-secret", accessGrant: "grant-secret" }, "ip");
    expect(tracking.requestVerification).toHaveBeenCalledWith("tracking-secret");
    expect(tracking.verifyAccess).toHaveBeenCalledWith("tracking-secret", "challenge", "123456");
    expect(tracking.get).toHaveBeenCalledWith("tracking-secret", "grant-secret");
    expect(abuse.assertAllowed).toHaveBeenCalled();
  });

  it("keeps both tracking secrets in POST bodies for public mutations", async () => {
    const controller = new TrackingController(tracking as never, abuse as never);
    await controller.cancel({ token: "secret", accessGrant: "grant", version: 2, reason: "r" }, "ip");
    await controller.reschedule({ token: "secret", accessGrant: "grant", version: 3, startAt: "2030-01-01T10:00:00Z" }, "ip");
    expect(tracking.cancel).toHaveBeenCalledWith("secret", "grant", 2, "r");
    expect(tracking.reschedule).toHaveBeenCalledWith("secret", "grant", 3, "2030-01-01T10:00:00Z", undefined);
  });

  it("issues only within authenticated tenant", () => {
    new TrackingAdminController(tracking as never).issue({ principal: { tenantId: "t" } } as never, "b");
    expect(tracking.issue).toHaveBeenCalledWith("t", "b");
  });

  it("rejects missing tenant", () => expect(() => new TrackingAdminController(tracking as never).issue({} as never, "b")).toThrow(UnauthorizedException));
});
