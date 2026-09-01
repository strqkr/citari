import { BadRequestException, type ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ProblemDetailsFilter } from "./problem-details.filter.js";
function host() {
  const send = vi.fn();
  const type = vi.fn(() => ({ send }));
  const status = vi.fn(() => ({ type }));
  const value = { switchToHttp: () => ({ getRequest: () => ({ url: "/bad", id: "request-1" }), getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
  return { value, status, type, send };
}
describe("ProblemDetailsFilter", () => {
  it("serializes safe RFC 7807 client errors", () => {
    const target = host();
    new ProblemDetailsFilter().catch(new BadRequestException(["first", "second"]), target.value);
    expect(target.status).toHaveBeenCalledWith(400);
    expect(target.type).toHaveBeenCalledWith("application/problem+json");
    expect(target.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400, instance: "/bad", requestId: "request-1" }));
  });
  it("does not leak unexpected exceptions", () => {
    const target = host();
    new ProblemDetailsFilter().catch(new Error("secret"), target.value);
    expect(target.send).toHaveBeenCalledWith(expect.objectContaining({ status: 500, detail: "An unexpected error occurred." }));
  });
});
