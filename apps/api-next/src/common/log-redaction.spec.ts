import { describe, expect, it } from "vitest";
import { redactSensitiveUrl } from "./log-redaction.js";

describe("redactSensitiveUrl", () => {
  it("removes tracking credentials while retaining action paths", () => {
    expect(redactSensitiveUrl("/api/v1/public/tracking/tenant.secret/reschedule?x=1")).toBe("/api/v1/public/tracking/[REDACTED]/reschedule?x=1");
  });

  it("leaves ordinary routes unchanged", () => {
    expect(redactSensitiveUrl("/api/v1/bookings?page=1")).toBe("/api/v1/bookings?page=1");
  });
});
