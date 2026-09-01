import { describe, expect, it } from "vitest";
import { createCustomerSchema, customerQuerySchema, updateCustomerSchema } from "./customers.schemas.js";

describe("customer schemas", () => {
  it("normalizes pagination", () => expect(customerQuerySchema.parse({ page: "3" })).toEqual({ page: 3, pageSize: 25 }));
  it("accepts an email contact", () => expect(createCustomerSchema.parse({ firstName: " Ana ", lastName: " Mora ", email: "ana@example.com" })).toMatchObject({ firstName: "Ana", lastName: "Mora" }));
  it("accepts a phone contact", () => expect(createCustomerSchema.parse({ firstName: "Ana", lastName: "Mora", phone: "+506 8888-8888" }).phone).toContain("506"));
  it("requires a valid contact", () => {
    expect(() => createCustomerSchema.parse({ firstName: "Ana", lastName: "Mora" })).toThrow();
    expect(() => createCustomerSchema.parse({ firstName: "Ana", lastName: "Mora", email: "invalid" })).toThrow();
  });
  it("rejects empty or unexpected updates", () => {
    expect(() => updateCustomerSchema.parse({})).toThrow();
    expect(() => createCustomerSchema.parse({ firstName: "Ana", lastName: "Mora", phone: "1", tenantId: "unsafe" })).toThrow();
  });
});
