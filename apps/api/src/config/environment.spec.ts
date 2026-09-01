import { describe, expect, it } from "vitest";
import { parseEnvironment } from "./environment.js";
const valid = { DATABASE_URL: "postgresql://user:pass@localhost:5432/citari", JWT_ISSUER: "https://issuer.test", JWT_AUDIENCE: "citari", JWT_SECRET: "x".repeat(32), MFA_ENCRYPTION_KEY: "m".repeat(32), NOTIFICATION_ENCRYPTION_KEY: "n".repeat(32), APP_PUBLIC_URL: "https://app.test" };
describe("parseEnvironment", () => {
  it("validates and normalizes runtime configuration", () => {
    const result = parseEnvironment({ ...valid, PORT: "4000", CORS_ORIGINS: "https://one.test, https://two.test" });
    expect(result.PORT).toBe(4000);
    expect(result.corsOrigins).toEqual(["https://one.test", "https://two.test"]);
  });
  it("rejects weak secrets", () => expect(() => parseEnvironment({ ...valid, JWT_SECRET: "weak" })).toThrow());
  it("requires a complete SMTP configuration in production", () => {
    expect(() => parseEnvironment({ ...valid, NODE_ENV: "production" })).toThrow();
    expect(parseEnvironment({ ...valid, NODE_ENV: "production", MAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.test", SMTP_USER: "user", SMTP_PASSWORD: "secret", MAIL_FROM: "notify@test.co" }).MAIL_TRANSPORT).toBe("smtp");
  });
});
