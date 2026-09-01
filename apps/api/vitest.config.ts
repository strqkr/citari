import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8", reporter: ["text", "json-summary"], include: ["src/**/*.ts"],
      exclude: ["src/main.ts", "src/bootstrap.ts", "src/generated/**", "src/cli/**", "src/**/*.module.ts", "src/database/prisma.service.ts", "src/common/request-context.ts"],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 }
    }
  }
});
