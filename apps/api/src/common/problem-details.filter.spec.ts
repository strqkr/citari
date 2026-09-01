import { BadRequestException, type ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ProblemDetailsFilter } from "./problem-details.filter.js";
import { RateLimitExceededException } from "../security/abuse-protection.service.js";
function host() {
  const send = vi.fn();
  const type = vi.fn(() => ({ send }));
  const status = vi.fn(() => ({ type }));
  const header = vi.fn();
  const value = { switchToHttp: () => ({ getRequest: () => ({ url: "/bad", id: "request-1" }), getResponse: () => ({ status, header }) }) } as unknown as ArgumentsHost;
  return { value, status, type, send, header };
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
  it("adds Retry-After to throttled RFC 7807 responses", () => {
    const target = host();
    new ProblemDetailsFilter().catch(new RateLimitExceededException(300), target.value);
    expect(target.header).toHaveBeenCalledWith("Retry-After", "300");
    expect(target.send).toHaveBeenCalledWith(expect.objectContaining({ status: 429 }));
  });
});
