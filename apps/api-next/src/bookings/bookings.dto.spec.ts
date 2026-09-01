import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateBookingDto, RescheduleBookingDto } from "./bookings.dto.js";
import { LoginDto, RefreshDto } from "../auth/auth.dto.js";
import { PublicCancelDto, PublicRescheduleDto } from "./tracking.dto.js";
const check = (Type: new () => object, values: object) => validate(Object.assign(new Type(), values));
describe("booking and auth DTO contracts", () => {
  it("accepts valid booking and session payloads", async () => { await expect(check(CreateBookingDto, { customerId: "550e8400-e29b-41d4-a716-446655440000", serviceId: "550e8400-e29b-41d4-a716-446655440001", locationId: "550e8400-e29b-41d4-a716-446655440002", startAt: "2030-01-01T10:00:00Z" })).resolves.toHaveLength(0); await expect(check(LoginDto, { email: "a@b.co", password: "password" })).resolves.toHaveLength(0); await expect(check(RefreshDto, { refreshToken: "x".repeat(32) })).resolves.toHaveLength(0); });
  it("rejects malformed identifiers, dates, versions and credentials", async () => { expect(await check(CreateBookingDto, { customerId: "x", serviceId: "x", locationId: "x", startAt: "today" })).not.toHaveLength(0); expect(await check(RescheduleBookingDto, { version: 0, startAt: "today" })).not.toHaveLength(0); expect(await check(LoginDto, { email: "bad", password: "short" })).not.toHaveLength(0); expect(await check(RefreshDto, { refreshToken: "short" })).not.toHaveLength(0); });
  it("validates public mutation payloads", async () => { await expect(check(PublicCancelDto, { version: 1, reason: "customer request" })).resolves.toHaveLength(0); await expect(check(PublicRescheduleDto, { version: 2, startAt: "2030-01-01T10:00:00Z" })).resolves.toHaveLength(0); expect(await check(PublicRescheduleDto, { version: 0, startAt: "later" })).not.toHaveLength(0); });
});
