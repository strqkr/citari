import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { TenantController } from "./tenant.controller.js";
describe("TenantController", () => {
  it("rejects requests without a tenant", async () => await expect(new TenantController({} as never).current({ principal: { userId: "u" } } as never)).rejects.toBeInstanceOf(ForbiddenException));
  it("runs reads inside the tenant transaction", async () => {
    const tenant = { id: "tenant", name: "Citari" };
    const findUnique = vi.fn().mockResolvedValue(tenant);
    const withTenant = vi.fn(async (_id, operation) => operation({ tenant: { findUnique } }));
    await expect(new TenantController({ withTenant } as never).current({ principal: { userId: "u", tenantId: "tenant" } } as never)).resolves.toEqual(tenant);
    expect(withTenant).toHaveBeenCalledWith("tenant", expect.any(Function));
  });
  it("hides unavailable tenants", async () => {
    const withTenant = vi.fn().mockResolvedValue(null);
    await expect(new TenantController({ withTenant } as never).current({ principal: { userId: "u", tenantId: "tenant" } } as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
