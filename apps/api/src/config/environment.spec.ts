import { describe, expect, it } from "vitest";
import { parseEnvironment } from "./environment.js";
const valid = { DATABASE_URL: "postgresql://user:pass@localhost:5432/citari", JWT_ISSUER: "https://issuer.test", JWT_AUDIENCE: "citari", JWT_SECRET: "x".repeat(32) };
describe("parseEnvironment", () => {
  it("validates and normalizes runtime configuration", () => {
    const result = parseEnvironment({ ...valid, PORT: "4000", CORS_ORIGINS: "https://one.test, https://two.test" });
    expect(result.PORT).toBe(4000);
    expect(result.corsOrigins).toEqual(["https://one.test", "https://two.test"]);
  });
  it("rejects weak secrets", () => expect(() => parseEnvironment({ ...valid, JWT_SECRET: "weak" })).toThrow());
});
