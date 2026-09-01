import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./secret-box.js";

describe("secret box", () => {
  it("binds authenticated ciphertext to its intended context", () => {
    const sealed = sealSecret("sensitive", "k".repeat(32), "email:v1");
    expect(sealed).not.toContain("sensitive");
    expect(openSecret(sealed, "k".repeat(32), "email:v1")).toBe("sensitive");
    expect(() => openSecret(sealed, "k".repeat(32), "other:v1")).toThrow();
  });
});
