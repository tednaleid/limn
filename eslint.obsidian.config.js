// ABOUTME: ESLint config that runs the Obsidian community scanner's rule set over the whole source tree.
// ABOUTME: Used by `just lint-obsidian`; a finding here is a finding on the plugin's scorecard.

import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// The scanner lints every package, not only the plugin: `packages/core` and
// `packages/web` are bundled into it. The preset reads the plugin manifest from
// the repository root at load time.
export default defineConfig(
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ["packages/*/src/**/*.{ts,tsx}"],
    rules: {
      "obsidianmd/ui/sentence-case": ["warn", { enforceCamelCaseLower: true }],
      // The scanner resolves every file against Obsidian's typings, where a
      // Document can reach the createEl helpers, so it reports these calls in
      // shared code too. Locally the web packages have no such typings and
      // obsidianmd/prefer-create-el stays silent, so this stands in for it.
      "no-restricted-syntax": ["warn", {
        selector: "CallExpression[arguments.length=1][callee.type='MemberExpression'][callee.property.name='createElement']",
        message: "Create elements with getHost().newElement(tag); the scorecard reports createElement (obsidianmd/prefer-create-el).",
      }],
    },
  },
  {
    // The host adapters are where newElement is implemented.
    files: ["packages/*/src/host/*.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // The preset treats end-to-end specs as tests and skips its Obsidian-runtime
    // rules there; the scanner applies them, so they are switched back on.
    files: ["packages/obsidian/e2e/**/*.ts"],
    rules: {
      "obsidianmd/prefer-file-manager-trash-file": "warn",
      "obsidianmd/prefer-active-doc": "warn",
      "obsidianmd/prefer-window-timers": "warn",
      "obsidianmd/prefer-instanceof": "warn",
      "obsidianmd/no-tfile-tfolder-cast": "warn",
    },
  },
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.obsidian-cache/**",
      "coverage/**",
      "packages/desktop/**",
      // Unit tests and tool configs are in no tsconfig project, so the typed
      // rules cannot parse them; the scanner does not lint them either.
      "**/__tests__/**",
      "**/*.test.*",
      "**/*.config.*",
      "**/*.conf.*",
      "**/*.{js,mjs,cjs}",
      "packages/*/scripts/**",
      "packages/web/e2e/**",
      "packages/web/public/**",
    ],
  },
);
