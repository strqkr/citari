import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["lib/frontend-config.ts", "lib/api.ts", "lib/resource.ts"],
      thresholds: { statements: 70, branches: 65, functions: 70, lines: 70 }
    }
  }
});
