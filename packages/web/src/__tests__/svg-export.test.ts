// ABOUTME: Tests for SVG export theme CSS embedding.
// ABOUTME: Verifies that buildThemeStyleBlock produces correct CSS variable definitions.

import { describe, test, expect } from "vitest";
import { buildThemeStyleBlock } from "../export/svg";
import { deriveThemeVars, resolveTheme } from "@limn/core";

describe("buildThemeStyleBlock", () => {
  test("catppuccin-latte theme contains all CSS variable definitions", () => {
    const theme = resolveTheme("catppuccin-latte", "light");
    const vars = deriveThemeVars(theme);
    const css = buildThemeStyleBlock(vars);
    expect(css).toContain("svg {");
    expect(css).toContain("--canvas-bg:");
    expect(css).toContain("--text-color:");
    expect(css).toContain("--text-muted:");
    expect(css).toContain("--edge-default:");
  });

  test("catppuccin-mocha theme contains all CSS variable definitions", () => {
    const theme = resolveTheme("catppuccin-mocha", "dark");
    const vars = deriveThemeVars(theme);
    const css = buildThemeStyleBlock(vars);
    expect(css).toContain("svg {");
    expect(css).toContain("--canvas-bg:");
    expect(css).toContain("--text-color:");
    expect(css).toContain("--edge-default:");
  });

  test("every derived variable is present in output", () => {
    const theme = resolveTheme("catppuccin-latte", "light");
    const vars = deriveThemeVars(theme);
    const css = buildThemeStyleBlock(vars);
    for (const [key, value] of Object.entries(vars)) {
      expect(css).toContain(`${key}: ${value}`);
    }
  });
});
