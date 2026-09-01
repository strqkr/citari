import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdminService } from "./admin.service.js";
const actor = { userId: "u", globalRole: "SUPER_ADMIN" as const };
describe("AdminService", () => {
  it("lists, reads, creates and changes tenant state with audit", async () => {
    const tenant = { id: "t", name: "Tenant", slug: "tenant", status: "ACTIVE" };
    const tx = { tenant: { create: vi.fn().mockResolvedValue(tenant), findUnique: vi.fn().mockResolvedValue({ status: "SUSPENDED" }), update: vi.fn().mockResolvedValue(tenant) }, auditEvent: { create: vi.fn().mockResolvedValue({}) } };
    const prisma = { tenant: { findMany: vi.fn().mockResolvedValue([tenant]), count: vi.fn().mockResolvedValue(1), findUnique: vi.fn().mockResolvedValueOnce(tenant).mockResolvedValueOnce(null) }, $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)) };
    const service = new AdminService(prisma as never);
    await expect(service.list({ page: 1, pageSize: 25, status: "ACTIVE", search: "ten" })).resolves.toMatchObject({ pagination: { total: 1 } });
    await expect(service.get("t")).resolves.toEqual(tenant);
    await expect(service.create({ name: "Tenant", slug: "tenant", timezone: "UTC", locale: "es-CR", currency: "CRC" }, actor)).resolves.toEqual(tenant);
    await expect(service.setStatus("t", "ACTIVE", { reason: "Verified company" }, actor)).resolves.toEqual(tenant);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(2);
  });
  it("rejects missing and duplicate tenants", async () => {
    const prisma = { tenant: { findUnique: vi.fn().mockResolvedValue({ id: "used" }) } };
    await expect(new AdminService(prisma as never).create({ name: "Tenant", slug: "tenant", timezone: "UTC", locale: "es-CR", currency: "CRC" }, actor)).rejects.toBeInstanceOf(ConflictException);
    prisma.tenant.findUnique.mockResolvedValue(null as never);
    await expect(new AdminService(prisma as never).get("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
