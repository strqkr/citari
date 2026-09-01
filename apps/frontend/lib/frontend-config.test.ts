import { afterEach, describe, expect, it, vi } from "vitest";

describe("frontend configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the real API in development by default", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    const { frontendConfig } = await import("./frontend-config");
    expect(frontendConfig.apiBaseUrl).toBe("http://localhost:8000");
  });

  it("ignores the removed mock-mode variable and keeps the real API", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "mock");
    const { frontendConfig } = await import("./frontend-config");
    expect(frontendConfig.apiBaseUrl).toBe("http://localhost:8000");
  });

  it("normalizes configured endpoints", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com/");
    vi.stubEnv("API_INTERNAL_BASE_URL", "http://api:3000/");
    const { frontendConfig } = await import("./frontend-config");
    expect(frontendConfig).toEqual({ apiBaseUrl: "https://api.example.com", apiInternalBaseUrl: "http://api:3000" });
  });
});
