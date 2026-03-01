// ABOUTME: Tests for SVG export theme CSS embedding.
// ABOUTME: Verifies that buildThemeStyleBlock produces correct CSS variable definitions.

import { describe, test, expect } from "vitest";
import { buildThemeStyleBlock } from "../export/svg";
import { THEMES } from "../theme/themes";

describe("buildThemeStyleBlock", () => {
  test("light theme contains all CSS variable definitions", () => {
    const css = buildThemeStyleBlock(THEMES["light"]);
    expect(css).toContain("svg {");
    expect(css).toContain("--canvas-bg: #f5f5f5");
    expect(css).toContain("--text-color: #1f2937");
    expect(css).toContain("--text-muted: #6b7280");
    expect(css).toContain("--edge-default: #c4c4c4");
  });

  test("dark theme contains all CSS variable definitions", () => {
    const css = buildThemeStyleBlock(THEMES["dark"]);
    expect(css).toContain("svg {");
    expect(css).toContain("--canvas-bg: #1a1a2e");
    expect(css).toContain("--text-color: #e0e0e0");
    expect(css).toContain("--edge-default: #555555");
  });

  test("every theme property is present in output", () => {
    const theme = THEMES["light"];
    const css = buildThemeStyleBlock(theme);
    for (const [key, value] of Object.entries(theme)) {
      expect(css).toContain(`${key}: ${value}`);
    }
  });
});
