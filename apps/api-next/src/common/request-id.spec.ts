import { describe, expect, it } from "vitest";
import { resolveRequestId } from "./request-id.js";
describe("resolveRequestId", () => {
  it("preserves safe upstream identifiers", () => expect(resolveRequestId("edge_01:a-b.c")).toBe("edge_01:a-b.c"));
  it.each(["bad value", "bad\nvalue", "x".repeat(101)])("replaces unsafe identifier %s", (value) => expect(resolveRequestId(value)).toMatch(/^[0-9a-f-]{36}$/));
  it("replaces multi-value headers", () => expect(resolveRequestId(["a", "b"])).toMatch(/^[0-9a-f-]{36}$/));
});
