// ABOUTME: Standalone ESLint config layering obsidianmd rules on top of the project defaults.
// ABOUTME: Used by `just lint-obsidian` to surface Obsidian-community-plugin-scanner warnings locally.

import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

// We deliberately do not consume `obsidianmd.configs.recommended`. That preset
// pulls in tseslint.configs.recommendedTypeChecked + Microsoft SDL + import +
// depend + no-unsanitized, requires a project-service parser setup, and tries
// to read a plugin manifest from cwd. We just want the Obsidian-specific rules
// that map to the community scorecard findings.
//
// Rules enabled below correspond 1:1 to scorecard warning categories:
//   no-global-this              -> "Avoid using 'globalThis'"
//   no-static-styles-assignment -> "Avoid element.style.cssText"
//   no-tfile-tfolder-cast       -> "Avoid casting to TFile"
//   platform                    -> "Use Platform API, not navigator"
//   prefer-active-doc           -> "Use activeDocument, not document"
//   prefer-window-timers        -> "Use activeWindow.setTimeout, not setTimeout"
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
  {
    files: ["packages/obsidian/**/*.{ts,tsx}", "packages/web/**/*.{ts,tsx}"],
    plugins: { obsidianmd },
    rules: {
      "obsidianmd/no-global-this": "warn",
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/no-tfile-tfolder-cast": "warn",
      "obsidianmd/platform": "warn",
      "obsidianmd/prefer-active-doc": "warn",
      "obsidianmd/prefer-window-timers": "warn",
    },
  },
  {
    files: ["**/__tests__/**", "**/*.test.*"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "obsidianmd/no-global-this": "off",
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "*.config.*"],
  },
);
