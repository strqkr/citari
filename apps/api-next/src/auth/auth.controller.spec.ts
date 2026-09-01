import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AuthController } from "./auth.controller.js";
describe("AuthController", () => {
  it("returns the authenticated principal", () => {
    const principal = { userId: "user" };
    expect(new AuthController().me({ principal } as never)).toBe(principal);
  });
  it("rejects a missing authentication context", () => expect(() => new AuthController().me({} as never)).toThrow(UnauthorizedException));
});
