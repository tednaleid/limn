// ABOUTME: Applies the Editor's theme to an Obsidian view container as inline CSS variables.
// ABOUTME: In system mode the inline overrides are removed so Obsidian's own stylesheet takes over.

import type { Editor } from "@limn/core";
import { resolveTheme, deriveThemeVars, THEME_CSS_VARS } from "@limn/core";
import { resolveActiveThemeKey } from "@limn/web/theme/themes";

/**
 * Apply or clear inline theme CSS on a view container.
 * In "system" mode, remove inline properties so Obsidian's stylesheet takes over.
 * In "light" or "dark" mode, resolve the theme and set CSS vars as inline styles.
 */
export function applyThemeToContainer(el: HTMLElement, editor: Editor): void {
  const mode = editor.getTheme();
  if (mode === "system") {
    // Clear inline overrides, let Obsidian's CSS mapping take over
    for (const name of THEME_CSS_VARS) {
      el.style.removeProperty(name);
    }
    el.style.removeProperty("color");
    return;
  }
  // Resolve the active theme and apply derived CSS vars as inline styles
  const themeKey = resolveActiveThemeKey(
    mode, editor.getLightTheme(), editor.getDarkTheme(),
  );
  const effective: "light" | "dark" = themeKey.includes("light") || themeKey.includes("latte") ? "light" : "dark";
  const theme = resolveTheme(themeKey, effective);
  const vars = deriveThemeVars(theme);
  for (const key of THEME_CSS_VARS) {
    el.style.setProperty(key, vars[key]);
  }
  // Set color directly so buttons (which use `inherit`) get the right color.
  // This bypasses Obsidian's --text-color variable that shadows ours.
  el.style.color = vars["--text-color"];
}
