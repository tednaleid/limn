// ABOUTME: Tests for theme CSS variable derivation.
// ABOUTME: Verifies derivation output structure and validates against current hardcoded themes.

import { describe, it, expect } from "vitest";
import { deriveThemeVars } from "../theme/derive";
import type { DerivedThemeVars } from "../theme/derive";
import { THEME_REGISTRY } from "../theme/theme";
import { parseHex } from "../theme/color";

const ALL_CSS_VARS: (keyof DerivedThemeVars)[] = [
  "--canvas-bg",
  "--text-color",
  "--text-muted",
  "--selection-bg",
  "--selection-border",
  "--reparent-bg",
  "--reparent-border",
  "--editor-bg",
  "--editor-shadow",
  "--collapse-bg",
  "--collapse-border",
  "--collapse-text",
  "--edge-default",
];

describe("deriveThemeVars", () => {
  it("returns all 13 CSS variables", () => {
    const vars = deriveThemeVars(THEME_REGISTRY["catppuccin-mocha"]!);
    for (const key of ALL_CSS_VARS) {
      expect(vars[key]).toBeDefined();
      expect(typeof vars[key]).toBe("string");
    }
  });

  it("canvas-bg matches theme background", () => {
    const theme = THEME_REGISTRY["dracula"]!;
    const vars = deriveThemeVars(theme);
    expect(vars["--canvas-bg"]).toBe(theme.background);
  });

  it("text-color matches theme foreground", () => {
    const theme = THEME_REGISTRY["nord"]!;
    const vars = deriveThemeVars(theme);
    expect(vars["--text-color"]).toBe(theme.foreground);
  });

  it("selection-border is the first branch color", () => {
    const theme = THEME_REGISTRY["catppuccin-latte"]!;
    const vars = deriveThemeVars(theme);
    expect(vars["--selection-border"]).toBe(theme.branches[0]);
  });

  it("reparent-border is the fourth branch color", () => {
    const theme = THEME_REGISTRY["catppuccin-latte"]!;
    const vars = deriveThemeVars(theme);
    expect(vars["--reparent-border"]).toBe(theme.branches[3]);
  });

  it("selection-bg contains rgba", () => {
    const vars = deriveThemeVars(THEME_REGISTRY["catppuccin-mocha"]!);
    expect(vars["--selection-bg"]).toMatch(/^rgba\(/);
  });

  it("light theme uses 0.15 alpha for selection-bg", () => {
    const vars = deriveThemeVars(THEME_REGISTRY["catppuccin-latte"]!);
    expect(vars["--selection-bg"]).toContain("0.15");
  });

  it("dark theme uses 0.25 alpha for selection-bg", () => {
    const vars = deriveThemeVars(THEME_REGISTRY["catppuccin-mocha"]!);
    expect(vars["--selection-bg"]).toContain("0.25");
  });

  it("editor-bg is lighter than canvas-bg", () => {
    const theme = THEME_REGISTRY["catppuccin-mocha"]!;
    const vars = deriveThemeVars(theme);
    const [bgR, bgG, bgB] = parseHex(theme.background);
    const [edR, edG, edB] = parseHex(vars["--editor-bg"]);
    // Lightening should increase at least one channel
    expect(edR + edG + edB).toBeGreaterThan(bgR + bgG + bgB);
  });

  it("works for all registered themes without errors", () => {
    for (const theme of Object.values(THEME_REGISTRY)) {
      expect(() => deriveThemeVars(theme)).not.toThrow();
    }
  });
});

describe("derivation produces values close to current hardcoded themes", () => {
  /** Check that two hex colors are within a reasonable distance (allow for
   *  different derivation from the old hand-picked values). */
  function hexDistance(a: string, b: string): number {
    const [r1, g1, b1] = parseHex(a);
    const [r2, g2, b2] = parseHex(b);
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  }

  it("classic-light canvas-bg matches old light theme", () => {
    const vars = deriveThemeVars(THEME_REGISTRY["classic-light"]!);
    // Old light: --canvas-bg: #f5f5f5
    expect(vars["--canvas-bg"]).toBe("#f5f5f5");
  });

  it("classic-light text-color matches old light theme", () => {
    const vars = deriveThemeVars(THEME_REGISTRY["classic-light"]!);
    // Old light: --text-color: #1f2937
    expect(vars["--text-color"]).toBe("#1f2937");
  });

  it("classic-dark canvas-bg matches old dark theme", () => {
    const vars = deriveThemeVars(THEME_REGISTRY["classic-dark"]!);
    // Old dark: --canvas-bg: #1a1a2e
    expect(vars["--canvas-bg"]).toBe("#1a1a2e");
  });

  it("classic-dark text-color matches old dark theme", () => {
    const vars = deriveThemeVars(THEME_REGISTRY["classic-dark"]!);
    // Old dark: --text-color: #e0e0e0
    expect(vars["--text-color"]).toBe("#e0e0e0");
  });

  it("classic-dark edge-default is close to old value", () => {
    const vars = deriveThemeVars(THEME_REGISTRY["classic-dark"]!);
    // Old dark: --edge-default: #555555
    // Derived: mix(#1a1a2e, #e0e0e0, 0.25)
    const dist = hexDistance(vars["--edge-default"], "#555555");
    expect(dist).toBeLessThan(40);
  });
});
