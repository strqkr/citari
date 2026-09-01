import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseInput, tenantIdFrom } from "./domain-http.js";

describe("domain HTTP helpers", () => {
  it("extracts only the authenticated tenant", () => expect(tenantIdFrom({ principal: { userId: "user", tenantId: "tenant" } } as never)).toBe("tenant"));
  it("rejects a missing tenant", () => expect(() => tenantIdFrom({ principal: { userId: "user" } } as never)).toThrow(UnauthorizedException));
  it("returns parsed input", () => expect(parseInput(z.object({ count: z.coerce.number() }), { count: "2" })).toEqual({ count: 2 }));
  it("returns structured validation errors", () => {
    try { parseInput(z.object({ name: z.string().min(1) }), { name: "" }); } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({ message: "Request validation failed", errors: [{ field: "name" }] });
    }
  });
});
