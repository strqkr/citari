import { describe, expect, it } from "vitest";
import { businessHourSchema, createCategorySchema, createLocationSchema, createServiceSchema, paginationSchema, replaceBusinessHoursSchema, updateCategorySchema } from "./catalog.schemas.js";

describe("catalog schemas", () => {
  it("normalizes pagination and enforces its limits", () => {
    expect(paginationSchema.parse({ page: "2", pageSize: "50", active: "false" })).toEqual({ page: 2, pageSize: 50, active: false });
    expect(() => paginationSchema.parse({ page: 0, pageSize: 101 })).toThrow();
  });
  it("trims categories and rejects empty updates", () => {
    expect(createCategorySchema.parse({ name: "  Salud " }).name).toBe("Salud");
    expect(() => updateCategorySchema.parse({})).toThrow();
    expect(() => createCategorySchema.parse({ name: "x", unexpected: true })).toThrow();
  });
  it("validates production service constraints", () => {
    const result = createServiceSchema.parse({ categoryId: "f9dd70d0-0f7b-497c-9d02-302859f65f1e", name: "Consulta", durationMinutes: 30, currency: "crc", price: 12500 });
    expect(result.currency).toBe("CRC");
    expect(() => createServiceSchema.parse({ ...result, durationMinutes: 0 })).toThrow();
    expect(() => createServiceSchema.parse({ ...result, currency: "COLON" })).toThrow();
  });
  it("validates locations", () => {
    expect(createLocationSchema.parse({ name: " Central ", isMain: true }).name).toBe("Central");
    expect(() => createLocationSchema.parse({ name: "" })).toThrow();
  });
  it("requires coherent opening windows", () => {
    expect(businessHourSchema.parse({ dayOfWeek: 1, openTime: "08:00", closeTime: "17:00" }).isClosed).toBe(false);
    expect(businessHourSchema.parse({ dayOfWeek: 0, isClosed: true })).toEqual({ dayOfWeek: 0, isClosed: true });
    expect(() => businessHourSchema.parse({ dayOfWeek: 1, openTime: "17:00", closeTime: "08:00" })).toThrow();
    expect(() => businessHourSchema.parse({ dayOfWeek: 7, isClosed: true })).toThrow();
    expect(() => replaceBusinessHoursSchema.parse({ hours: [{ dayOfWeek: 1, isClosed: true }, { dayOfWeek: 1, isClosed: true }] })).toThrow();
  });
});
