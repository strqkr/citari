import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "./prisma.service.js";
describe("PrismaService.withTenant", () => {
  it("sets the exact RLS tenant setting transaction-locally", async () => {
    const execute = vi.fn().mockResolvedValue(1);
    const transaction = vi.fn(async (callback: (tx: object) => Promise<unknown>) => callback({ $executeRaw: execute }));
    const operation = vi.fn().mockResolvedValue("result");
    const result = await PrismaService.prototype.withTenant.call({ $transaction: transaction }, "tenant-id", operation);
    expect(result).toBe("result");
    const template = execute.mock.calls[0]?.[0] as TemplateStringsArray;
    expect(template.join("?")).toBe("SELECT set_config('app.tenant_id', ?, true)");
    expect(execute.mock.calls[0]?.[1]).toBe("tenant-id");
    expect(operation).toHaveBeenCalledAfter(execute);
  });
});
