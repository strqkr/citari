import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { BookingStatus } from "../generated/prisma/enums.js";
import { BookingsController } from "./bookings.controller.js";
describe("BookingsController", () => {
  const service = { list: vi.fn(), get: vi.fn(), availability: vi.fn(), create: vi.fn(), transition: vi.fn(), reschedule: vi.fn() };
  const controller = new BookingsController(service as never); const req = { principal: { userId: "u", tenantId: "t" } } as never;
  it("delegates list, detail and creation with tenant and actor", () => { controller.list(req, {}); controller.get(req, "b"); controller.create(req, { customerId: "c", serviceId: "s", locationId: "l", startAt: new Date().toISOString() }); expect(service.list).toHaveBeenCalledWith("t", {}); expect(service.get).toHaveBeenCalledWith("t", "b"); expect(service.create).toHaveBeenCalledWith("t", "u", expect.any(Object)); });
  it("delegates booking-specific availability", () => { controller.availability(req, "b", { from: "2030-01-01T00:00:00Z", to: "2030-01-02T00:00:00Z" }); expect(service.availability).toHaveBeenCalledWith("t", "b", "2030-01-01T00:00:00Z", "2030-01-02T00:00:00Z"); });
  it.each([["confirm", BookingStatus.CONFIRMED], ["cancel", BookingStatus.CANCELLED], ["complete", BookingStatus.COMPLETED], ["noShow", BookingStatus.NO_SHOW]] as const)("delegates %s transition", (method, status) => { controller[method](req, "b", { version: 2, reason: "r" }); expect(service.transition).toHaveBeenCalledWith("t", "b", "u", status, 2, "r"); });
  it("delegates rescheduling", () => { controller.reschedule(req, "b", { version: 2, startAt: "2030-01-01T10:00:00Z" }); expect(service.reschedule).toHaveBeenCalledWith("t", "b", "u", 2, "2030-01-01T10:00:00Z", undefined); });
  it("requires tenant context", () => expect(() => controller.list({ principal: { userId: "u" } } as never, {})).toThrow(UnauthorizedException));
  it("requires user context", () => expect(() => controller.create({ principal: { tenantId: "t" } } as never, {} as never)).toThrow(UnauthorizedException));
});
