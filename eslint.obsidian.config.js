// ABOUTME: Standalone ESLint config layering obsidianmd rules on top of the project defaults.
// ABOUTME: Used by `just lint-obsidian` to surface Obsidian-community-plugin-scanner warnings locally.

import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import sdl from "@microsoft/eslint-plugin-sdl";
import importPlugin from "eslint-plugin-import";
import noUnsanitized from "eslint-plugin-no-unsanitized";

// We deliberately do not consume `obsidianmd.configs.recommended`. That preset
// requires reading a plugin manifest from cwd at config-load time, which fails
// in our monorepo where the manifest lives in `packages/obsidian/`. Instead we
// mirror the scorecard scanner's rule set explicitly below.
//
// The scanner enables the full obsidianmd recommended preset:
//   - All "plugin" rules (don't need type info)
//   - 5 "typed" rules (need parserServices) — enabled below via projectService
//   - @microsoft/sdl: no-document-write, no-inner-html
//   - import/no-nodejs-modules (off if manifest.isDesktopOnly = true; our
//     manifest is false, so this fires)
//   - no-restricted-globals: app (warn), fetch (error), localStorage (error)
//   - no-restricted-imports: axios, node-fetch, got, ofetch, ky, superagent,
//     moment (all error)
//   - core JS rules: no-eval, no-implied-eval, no-implicit-globals, no-alert
//
// Files are scanned across the whole source tree (not just the bundled output),
// so `packages/core` is included alongside `packages/obsidian` and
// `packages/web`. Tests get a narrower rule set since they're not shipped.
export default defineConfig(
  ...tseslint.configs.strict,
  // Typed linting (strictTypeChecked) only applies to source files in a
  // tsconfig project. Tests are excluded from packages/core/tsconfig.json
  // and would crash projectService, so we scope all typed parsing to
  // packages/*/src/**.
  {
    files: ["packages/*/src/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**", "**/*.test.*"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        // Obsidian-provided globals available at runtime in plugins.
        activeDocument: "readonly",
        activeWindow: "readonly",
        createDiv: "readonly",
        createEl: "readonly",
        createFragment: "readonly",
        createSpan: "readonly",
        createSvg: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["packages/*/src/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**", "**/*.test.*"],
    plugins: {
      obsidianmd,
      "@microsoft/sdl": sdl,
      import: importPlugin,
      "no-unsanitized": noUnsanitized,
    },
    rules: {
      // obsidianmd "plugin" rules (no type info needed)
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
      "obsidianmd/ui/sentence-case": ["warn", { enforceCamelCaseLower: true }],
      // obsidianmd typed rules (require parserServices)
      "obsidianmd/no-plugin-as-component": "warn",
      "obsidianmd/no-unsupported-api": "warn",
      "obsidianmd/no-view-references-in-plugin": "warn",
      "obsidianmd/prefer-file-manager-trash-file": "warn",
      "obsidianmd/prefer-instanceof": "warn",
      // Microsoft SDL DOM safety
      "@microsoft/sdl/no-document-write": "error",
      "@microsoft/sdl/no-inner-html": "error",
      // XSS hardening
      "no-unsanitized/property": "error",
      "no-unsanitized/method": "error",
      // Disallow Node-only imports — manifest.isDesktopOnly is false, so the
      // plugin must run on mobile too.
      "import/no-nodejs-modules": "warn",
      // Obsidian's preferred wrappers for these globals.
      "no-restricted-globals": [
        "warn",
        {
          name: "fetch",
          message: "Use the built-in `requestUrl` function instead of `fetch` for network requests in Obsidian.",
        },
        {
          name: "localStorage",
          message: "Prefer `App#saveLocalStorage` / `App#loadLocalStorage` for vault-scoped storage.",
        },
      ],
      "no-restricted-imports": [
        "warn",
        {
          name: "axios",
          message: "Use the built-in `requestUrl` function instead of `axios`.",
        },
        {
          name: "superagent",
          message: "Use the built-in `requestUrl` function instead of `superagent`.",
        },
        {
          name: "got",
          message: "Use the built-in `requestUrl` function instead of `got`.",
        },
        {
          name: "ofetch",
          message: "Use the built-in `requestUrl` function instead of `ofetch`.",
        },
        {
          name: "ky",
          message: "Use the built-in `requestUrl` function instead of `ky`.",
        },
        {
          name: "node-fetch",
          message: "Use the built-in `requestUrl` function instead of `node-fetch`.",
        },
        {
          name: "moment",
          message: "The 'moment' package is bundled with Obsidian. Import it from 'obsidian' instead.",
        },
      ],
      // Core JS rules from the scorecard scanner.
      "no-alert": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-implicit-globals": "error",
    },
  },
  {
    files: ["**/__tests__/**", "**/*.test.*"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "obsidianmd/no-global-this": "off",
      "obsidianmd/prefer-window-timers": "off",
      "no-restricted-globals": "off",
    },
  },
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "*.config.*",
      // Build/test runner configs live outside src/ and are not in any
      // tsconfig project, so typed linting cannot parse them.
      "packages/*/vite.config.*",
      "packages/*/vitest.config.*",
      "packages/*/esbuild.config.*",
    ],
  },
);
