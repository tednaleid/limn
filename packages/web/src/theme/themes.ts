// ABOUTME: Theme application and resolution for the web layer.
// ABOUTME: Delegates to core's theme registry and derivation engine.

import {
  resolveTheme,
} from "@limn/core";
import type { ThemeKey } from "@limn/core";
import { deriveThemeVars } from "@limn/core";

/**
 * Resolve the OS color scheme preference to "light" or "dark".
 */
export function resolveSystemMode(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Resolve the effective theme key given mode and user preferences.
 * "system" resolves to OS preference; "light"/"dark" use the corresponding theme key.
 */
export function resolveActiveThemeKey(
  mode: string,
  lightTheme: ThemeKey,
  darkTheme: ThemeKey,
): ThemeKey {
  const effective = mode === "light" ? "light" : mode === "dark" ? "dark" : resolveSystemMode();
  return effective === "light" ? lightTheme : darkTheme;
}

/**
 * Apply a theme to the document by setting CSS custom properties on <html>.
 * Sets data-theme attribute for SVG export to read.
 */
export function applyThemeByKey(themeKey: ThemeKey): void {
  const el = document.documentElement;
  el.setAttribute("data-theme", themeKey);

  const effective: "light" | "dark" = themeKey.includes("light") || themeKey.includes("latte") ? "light" : "dark";
  const theme = resolveTheme(themeKey, effective);
  const vars = deriveThemeVars(theme);
  for (const [key, value] of Object.entries(vars)) {
    el.style.setProperty(key, value);
  }
}

/**
 * Convenience: resolve mode + preferences and apply the theme.
 */
export function applyThemeFromMeta(
  mode: string,
  lightTheme: ThemeKey,
  darkTheme: ThemeKey,
): void {
  const key = resolveActiveThemeKey(mode, lightTheme, darkTheme);
  applyThemeByKey(key);
}

