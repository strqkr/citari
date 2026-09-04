import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Operation = { operationId?: string; responses?: Record<string, unknown>; security?: unknown[] };
type Contract = { openapi: string; info: { version: string }; paths: Record<string, Record<string, Operation>>; components?: { schemas?: Record<string, unknown>; securitySchemes?: Record<string, unknown> } };

describe("committed OpenAPI contract", () => {
  it("is versioned, complete, stable, and free of secret-bearing paths", async () => {
    const contract = JSON.parse(await readFile(resolve("openapi/citari.v1.json"), "utf8")) as Contract;
    expect(contract.openapi).toMatch(/^3\./);
    expect(contract.info.version).toBe("1.0.0");
    expect(Object.keys(contract.paths).length).toBeGreaterThanOrEqual(50);
    expect(Object.keys(contract.components?.schemas ?? {}).length).toBeGreaterThanOrEqual(15);
    expect(contract.components?.securitySchemes).toHaveProperty("bearer");

    const operations = Object.entries(contract.paths).flatMap(([path, methods]) => {
      expect(path).toMatch(/^\/api\/v1\//);
      expect(path.toLowerCase()).not.toMatch(/\{.*token.*\}/);
      return Object.values(methods).filter((operation): operation is Operation => typeof operation === "object" && operation !== null && "operationId" in operation);
    });
    const operationIds = operations.map((operation) => operation.operationId);
    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(operations.every((operation) => Object.keys(operation.responses ?? {}).length > 0)).toBe(true);
    expect(contract.paths["/api/v1/bookings"]?.get?.security).toEqual([{ bearer: [] }]);
  });
});
