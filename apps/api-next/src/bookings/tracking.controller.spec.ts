import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { TrackingAdminController } from "./tracking-admin.controller.js";
import { TrackingController } from "./tracking.controller.js";
describe("tracking controllers", () => {
  const tracking = { issue: vi.fn(), get: vi.fn(), cancel: vi.fn(), reschedule: vi.fn() };
  it("delegates public token lookup", () => { new TrackingController(tracking as never).get("token"); expect(tracking.get).toHaveBeenCalledWith("token"); });
  it("delegates public cancellation and rescheduling", () => { const controller = new TrackingController(tracking as never); controller.cancel("token", { version: 2, reason: "r" }); controller.reschedule("token", { version: 3, startAt: "2030-01-01T10:00:00Z" }); expect(tracking.cancel).toHaveBeenCalledWith("token", 2, "r"); expect(tracking.reschedule).toHaveBeenCalledWith("token", 3, "2030-01-01T10:00:00Z", undefined); });
  it("issues only within authenticated tenant", () => { new TrackingAdminController(tracking as never).issue({ principal: { tenantId: "t" } } as never, "b"); expect(tracking.issue).toHaveBeenCalledWith("t", "b"); });
  it("rejects missing tenant", () => expect(() => new TrackingAdminController(tracking as never).issue({} as never, "b")).toThrow(UnauthorizedException));
});
