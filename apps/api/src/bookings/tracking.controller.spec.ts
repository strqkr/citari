import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { TrackingAdminController } from "./tracking-admin.controller.js";
import { TrackingController } from "./tracking.controller.js";
describe("tracking controllers", () => {
  const tracking = { issue: vi.fn(), get: vi.fn(), cancel: vi.fn(), reschedule: vi.fn() };
  const abuse = { assertAllowed: vi.fn() };
  it("delegates public token lookup", async () => { await new TrackingController(tracking as never, abuse as never).get("token", "ip"); expect(tracking.get).toHaveBeenCalledWith("token"); expect(abuse.assertAllowed).toHaveBeenCalled(); });
  it("delegates public cancellation and rescheduling", async () => { const controller = new TrackingController(tracking as never, abuse as never); await controller.cancel("token", { version: 2, reason: "r" }, "ip"); await controller.reschedule("token", { version: 3, startAt: "2030-01-01T10:00:00Z" }, "ip"); expect(tracking.cancel).toHaveBeenCalledWith("token", 2, "r"); expect(tracking.reschedule).toHaveBeenCalledWith("token", 3, "2030-01-01T10:00:00Z", undefined); });
  it("keeps tracking secrets in POST bodies for the safe browser routes", async () => { const controller = new TrackingController(tracking as never, abuse as never); await controller.lookup({ token: "secret" }, "ip"); await controller.cancelByToken({ token: "secret", version: 2 }, "ip"); await controller.rescheduleByToken({ token: "secret", version: 3, startAt: "2030-01-01T10:00:00Z" }, "ip"); expect(tracking.get).toHaveBeenCalledWith("secret"); expect(tracking.cancel).toHaveBeenCalledWith("secret", 2, undefined); expect(tracking.reschedule).toHaveBeenCalledWith("secret", 3, "2030-01-01T10:00:00Z", undefined); });
  it("issues only within authenticated tenant", () => { new TrackingAdminController(tracking as never).issue({ principal: { tenantId: "t" } } as never, "b"); expect(tracking.issue).toHaveBeenCalledWith("t", "b"); });
  it("rejects missing tenant", () => expect(() => new TrackingAdminController(tracking as never).issue({} as never, "b")).toThrow(UnauthorizedException));
});
