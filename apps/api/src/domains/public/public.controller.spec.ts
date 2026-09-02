import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PublicController } from "./public.controller.js";

describe("PublicController", () => {
  const id = "f9dd70d0-0f7b-497c-9d02-302859f65f1e";
  const abuse = { assertAllowed: vi.fn() };
  it("delegates public reads and rate-limited booking", async () => {
    const service = { tenant: vi.fn(), services: vi.fn(), locations: vi.fn(), availability: vi.fn(), createBooking: vi.fn(), createHold: vi.fn(), consumeConfirmation: vi.fn() };
    const controller = new PublicController(service as never, abuse as never);
    await controller.tenant("my-shop");
    await controller.services("my-shop");
    await controller.locations("my-shop");
    await controller.availability("my-shop", { serviceId: id, locationId: id, from: "2026-01-01", to: "2026-01-02" });
    await controller.create("my-shop", "1234567890123456", { serviceId: id, locationId: id, startAt: "2026-01-01", holdToken: "h".repeat(43), customer: { firstName: "A", lastName: "B", email: "a@b.com", consent: true } }, "127.0.0.1");
    expect(service.createBooking).toHaveBeenCalled();
    expect(abuse.assertAllowed).toHaveBeenCalledTimes(2);
  });
  it("delegates rate-limited holds and one-use confirmations", async () => {
    const service = { createHold: vi.fn(), consumeConfirmation: vi.fn() };
    const controller = new PublicController(service as never, abuse as never);
    await controller.hold("my-shop", "1234567890123456", { serviceId: id, locationId: id, startAt: "2030-01-01T10:00:00Z" }, "127.0.0.1");
    await controller.confirmation("my-shop", "1234567890123456", { confirmationNonce: "c".repeat(43) }, "127.0.0.1");
    expect(service.createHold).toHaveBeenCalled();
    expect(service.consumeConfirmation).toHaveBeenCalled();
  });
  it("requires idempotency", async () => await expect(new PublicController({} as never, abuse as never).create("my-shop", undefined, {})).rejects.toBeInstanceOf(BadRequestException));
});
