// ABOUTME: Tests for keyboard navigation index mapping in the hamburger menu.
// ABOUTME: Verifies that focusIndex correctly maps to menu items, theme mode row, and theme palettes.

import { describe, test, expect } from "vitest";
import { resolveThemeFocusTarget } from "../components/HamburgerMenu";

describe("resolveThemeFocusTarget", () => {
  // Typical setup: 9 menu items, showTheme=true, 4 light + 4 dark themes
  const MENU_COUNT = 9;
  const LIGHT_COUNT = 4;
  const DARK_COUNT = 4;

  test("indices below menuItemCount are regular menu items", () => {
    expect(resolveThemeFocusTarget(0, MENU_COUNT, true, LIGHT_COUNT, DARK_COUNT))
      .toEqual({ type: "menu-item", index: 0 });
    expect(resolveThemeFocusTarget(8, MENU_COUNT, true, LIGHT_COUNT, DARK_COUNT))
      .toEqual({ type: "menu-item", index: 8 });
  });

  test("index at menuItemCount is the theme mode row", () => {
    expect(resolveThemeFocusTarget(9, MENU_COUNT, true, LIGHT_COUNT, DARK_COUNT))
      .toEqual({ type: "theme-mode" });
  });

  test("indices after theme mode row are light theme palettes", () => {
    expect(resolveThemeFocusTarget(10, MENU_COUNT, true, LIGHT_COUNT, DARK_COUNT))
      .toEqual({ type: "theme-palette", mode: "light", offset: 0 });
    expect(resolveThemeFocusTarget(13, MENU_COUNT, true, LIGHT_COUNT, DARK_COUNT))
      .toEqual({ type: "theme-palette", mode: "light", offset: 3 });
  });

  test("indices after light themes are dark theme palettes", () => {
    expect(resolveThemeFocusTarget(14, MENU_COUNT, true, LIGHT_COUNT, DARK_COUNT))
      .toEqual({ type: "theme-palette", mode: "dark", offset: 0 });
    expect(resolveThemeFocusTarget(17, MENU_COUNT, true, LIGHT_COUNT, DARK_COUNT))
      .toEqual({ type: "theme-palette", mode: "dark", offset: 3 });
  });

  test("out-of-range index returns null", () => {
    expect(resolveThemeFocusTarget(18, MENU_COUNT, true, LIGHT_COUNT, DARK_COUNT))
      .toBeNull();
  });

  test("with showTheme=false, only menu items are valid", () => {
    expect(resolveThemeFocusTarget(8, MENU_COUNT, false, LIGHT_COUNT, DARK_COUNT))
      .toEqual({ type: "menu-item", index: 8 });
    expect(resolveThemeFocusTarget(9, MENU_COUNT, false, LIGHT_COUNT, DARK_COUNT))
      .toBeNull();
  });

  test("works with different menu item counts", () => {
    // e.g., 6 items when showShare=false
    expect(resolveThemeFocusTarget(6, 6, true, LIGHT_COUNT, DARK_COUNT))
      .toEqual({ type: "theme-mode" });
    expect(resolveThemeFocusTarget(7, 6, true, LIGHT_COUNT, DARK_COUNT))
      .toEqual({ type: "theme-palette", mode: "light", offset: 0 });
  });
});
