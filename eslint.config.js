import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig(
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Promote the always-applicable obsidianmd rules into the main lint gate.
  // These have zero current violations, so any regression blocks at commit.
  // The remaining noisier obsidianmd rules live in eslint.obsidian.config.js
  // and run via `just lint-obsidian` until Phase 2 of the scorecard cleanup
  // closes the warnings.
  // obsidianmd rules with zero current violations are promoted to the main
  // lint gate. Any regression blocks at commit. The remaining typed/heavier
  // obsidianmd rules live in eslint.obsidian.config.js and run via
  // `just lint-obsidian`.
  {
    files: ["packages/**/*.{ts,tsx}"],
    plugins: { obsidianmd },
    rules: {
      "obsidianmd/no-global-this": "error",
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/no-tfile-tfolder-cast": "error",
      "obsidianmd/platform": "error",
      "obsidianmd/prefer-active-doc": "error",
      "obsidianmd/prefer-window-timers": "error",
    },
  },
  {
    files: ["**/__tests__/**", "**/*.test.*"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "obsidianmd/no-global-this": "off",
      "obsidianmd/prefer-window-timers": "off",
      "obsidianmd/prefer-active-doc": "off",
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "*.config.*"],
  },
);
