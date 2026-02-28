import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "core",
    globals: true,
    environment: "node",
    exclude: ["dist/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/__tests__/**", "src/serialization/fixtures/**"],
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
});
