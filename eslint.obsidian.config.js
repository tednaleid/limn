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
// All obsidianmd rules with code-style implications are enabled. The scorecard
// scanner runs the full recommended preset; mirroring it locally surfaces
// regressions at `just lint-obsidian` time, not 10 days later on the scorecard.
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
      "obsidianmd/detach-leaves": "warn",
      "obsidianmd/editor-drop-paste": "warn",
      "obsidianmd/hardcoded-config-path": "warn",
      "obsidianmd/no-forbidden-elements": "warn",
      "obsidianmd/no-global-this": "warn",
      "obsidianmd/no-sample-code": "warn",
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/no-tfile-tfolder-cast": "warn",
      "obsidianmd/object-assign": "warn",
      "obsidianmd/platform": "warn",
      "obsidianmd/prefer-abstract-input-suggest": "warn",
      "obsidianmd/prefer-active-doc": "warn",
      "obsidianmd/prefer-get-language": "warn",
      "obsidianmd/prefer-window-timers": "warn",
      "obsidianmd/regex-lookbehind": "warn",
      "obsidianmd/sample-names": "warn",
    },
  },
  {
    files: ["**/__tests__/**", "**/*.test.*"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "obsidianmd/no-global-this": "off",
      "obsidianmd/prefer-window-timers": "off",
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "*.config.*"],
  },
);
