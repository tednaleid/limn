import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**"],
      exclude: [
        "packages/core/src/__tests__/**",
        "packages/core/src/serialization/fixtures/**",
        "packages/core/src/model/**",
      ],
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
