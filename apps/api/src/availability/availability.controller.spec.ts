import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AvailabilityController } from "./availability.controller.js";
describe("AvailabilityController", () => {
  const service = { list: vi.fn(), create: vi.fn(), remove: vi.fn() }; const controller = new AvailabilityController(service as never); const req = { principal: { tenantId: "t" } } as never;
  it("delegates all operations with tenant isolation", () => { const query = { from: new Date("2030-01-01T00:00:00Z"), to: new Date("2030-01-02T00:00:00Z") }; const input = { locationId: "l", startsAt: query.from, endsAt: query.to }; controller.list(req, query); controller.create(req, input); controller.remove(req, "b"); expect(service.list).toHaveBeenCalledWith("t", query); expect(service.create).toHaveBeenCalledWith("t", input); expect(service.remove).toHaveBeenCalledWith("t", "b"); });
  it("rejects missing tenant", () => expect(() => controller.list({} as never, {} as never)).toThrow(ForbiddenException));
});
