import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "web",
    globals: true,
    environment: "node",
    exclude: ["dist/**", "node_modules/**"],
  },
});
