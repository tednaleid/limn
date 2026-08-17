// ABOUTME: Plugin settings for Limn: how marked notes open and the theme for Markdown-backed maps.
// ABOUTME: mergeSettings validates saved data; the Settings UI lives in LimnSettingTab.ts.

import { DEFAULT_LIGHT_THEME, DEFAULT_DARK_THEME } from "@limn/core";

export type OpenMarkedNotesAs = "mindmap" | "markdown";

export interface LimnSettings {
  openMarkedNotesAs: OpenMarkedNotesAs;
  themeMode: string;
  lightTheme: string;
  darkTheme: string;
}

export const DEFAULT_SETTINGS: LimnSettings = {
  openMarkedNotesAs: "mindmap",
  themeMode: "system",
  lightTheme: DEFAULT_LIGHT_THEME,
  darkTheme: DEFAULT_DARK_THEME,
};

export const THEME_MODES: ReadonlySet<string> = new Set(["system", "light", "dark"]);

/** Saved plugin data merged over the defaults; values of the wrong shape are dropped. */
export function mergeSettings(saved: unknown): LimnSettings {
  const settings = { ...DEFAULT_SETTINGS };
  if (typeof saved !== "object" || saved === null) return settings;
  const data = saved as Record<string, unknown>;
  if (data.openMarkedNotesAs === "mindmap" || data.openMarkedNotesAs === "markdown") {
    settings.openMarkedNotesAs = data.openMarkedNotesAs;
  }
  if (typeof data.themeMode === "string" && THEME_MODES.has(data.themeMode)) settings.themeMode = data.themeMode;
  if (typeof data.lightTheme === "string") settings.lightTheme = data.lightTheme;
  if (typeof data.darkTheme === "string") settings.darkTheme = data.darkTheme;
  return settings;
}
