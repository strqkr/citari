import { describe, expect, it } from "vitest";
import { buildOtpAuthUri, decryptMfaSecret, encryptMfaSecret, verifyTotp } from "./mfa.js";

describe("MFA primitives", () => {
  it("matches the RFC 6238 SHA-1 test vector after truncating to six digits", () => {
    expect(verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 59_000)).toBe(true);
    expect(verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "000000", 59_000)).toBe(false);
  });

  it("encrypts MFA secrets with authenticated encryption", () => {
    const encrypted = encryptMfaSecret("JBSWY3DPEHPK3PXP", "k".repeat(32));
    expect(encrypted).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptMfaSecret(encrypted, "k".repeat(32))).toBe("JBSWY3DPEHPK3PXP");
    const parts = encrypted.split(".");
    const ciphertextValue = parts[2];
    if (!ciphertextValue) throw new Error("Test ciphertext is missing");
    const ciphertext = Buffer.from(ciphertextValue, "base64url");
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
    const tampered = `${parts[0]}.${parts[1]}.${ciphertext.toString("base64url")}`;
    expect(() => decryptMfaSecret(tampered, "k".repeat(32))).toThrow();
  });

  it("creates a standards-compatible enrollment URI", () => {
    expect(buildOtpAuthUri("SECRET", "andrew@example.com")).toContain("otpauth://totp/Citari%3Aandrew%40example.com");
  });
});
