import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller.js";
describe("HealthController", () => {
  it("reports liveness", () => expect(new HealthController({} as never).live()).toEqual({ status: "ok" }));
  it("reports readiness", async () => {
    const controller = new HealthController({ isReady: vi.fn().mockResolvedValue(true) } as never);
    await expect(controller.ready()).resolves.toEqual({ status: "ready" });
  });
  it("fails readiness when postgres is unavailable", async () => {
    const controller = new HealthController({ isReady: vi.fn().mockResolvedValue(false) } as never);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
