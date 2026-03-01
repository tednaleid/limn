// ABOUTME: Tests for the theme registry and resolution.
// ABOUTME: Verifies theme structure, branch count, and lookup behavior.

import { describe, it, expect } from "vitest";
import {
  THEME_REGISTRY,
  BRANCH_COUNT,
  DEFAULT_LIGHT_THEME,
  DEFAULT_DARK_THEME,
  resolveTheme,
  getThemesByMode,
} from "../theme/theme";
describe("theme registry", () => {
  it("has 8 themes", () => {
    expect(Object.keys(THEME_REGISTRY)).toHaveLength(8);
  });

  it("every theme has exactly 14 branch colors", () => {
    for (const theme of Object.values(THEME_REGISTRY)) {
      expect(theme.branches).toHaveLength(BRANCH_COUNT);
    }
  });

  it("every theme has a non-empty name", () => {
    for (const theme of Object.values(THEME_REGISTRY)) {
      expect(theme.name.length).toBeGreaterThan(0);
    }
  });

  it("every theme has valid hex background and foreground", () => {
    const hexPattern = /^#[0-9a-f]{6}$/;
    for (const theme of Object.values(THEME_REGISTRY)) {
      expect(theme.background).toMatch(hexPattern);
      expect(theme.foreground).toMatch(hexPattern);
    }
  });

  it("every branch color is a valid hex string", () => {
    const hexPattern = /^#[0-9a-f]{6}$/;
    for (const theme of Object.values(THEME_REGISTRY)) {
      for (const color of theme.branches) {
        expect(color).toMatch(hexPattern);
      }
    }
  });

  it("has at least 3 light themes and 5 dark themes", () => {
    const { light, dark } = getThemesByMode();
    expect(light.length).toBeGreaterThanOrEqual(3);
    expect(dark.length).toBeGreaterThanOrEqual(5);
  });
});

describe("resolveTheme", () => {
  it("returns a known theme by key", () => {
    const theme = resolveTheme("dracula", "dark");
    expect(theme.name).toBe("Dracula");
  });

  it("falls back to default light theme for unknown key", () => {
    const theme = resolveTheme("nonexistent", "light");
    expect(theme).toBe(THEME_REGISTRY[DEFAULT_LIGHT_THEME]);
  });

  it("falls back to default dark theme for unknown key", () => {
    const theme = resolveTheme("nonexistent", "dark");
    expect(theme).toBe(THEME_REGISTRY[DEFAULT_DARK_THEME]);
  });
});

describe("getThemesByMode", () => {
  it("groups themes correctly", () => {
    const { light, dark } = getThemesByMode();
    for (const key of light) {
      expect(THEME_REGISTRY[key]!.mode).toBe("light");
    }
    for (const key of dark) {
      expect(THEME_REGISTRY[key]!.mode).toBe("dark");
    }
  });

  it("covers all themes", () => {
    const { light, dark } = getThemesByMode();
    expect(light.length + dark.length).toBe(Object.keys(THEME_REGISTRY).length);
  });
});

describe("default themes exist", () => {
  it("default light theme is in registry", () => {
    expect(THEME_REGISTRY[DEFAULT_LIGHT_THEME]).toBeDefined();
    expect(THEME_REGISTRY[DEFAULT_LIGHT_THEME]!.mode).toBe("light");
  });

  it("default dark theme is in registry", () => {
    expect(THEME_REGISTRY[DEFAULT_DARK_THEME]).toBeDefined();
    expect(THEME_REGISTRY[DEFAULT_DARK_THEME]!.mode).toBe("dark");
  });
});
