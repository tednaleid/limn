// ABOUTME: Derives CSS custom properties from a ThemeDefinition.
// ABOUTME: Computes 13 CSS variables for canvas chrome from theme colors.

import type { ThemeDefinition } from "./theme";
import { mix, lighten, toRgba } from "./color";

export interface DerivedThemeVars {
  "--canvas-bg": string;
  "--text-color": string;
  "--text-muted": string;
  "--selection-bg": string;
  "--selection-border": string;
  "--reparent-bg": string;
  "--reparent-border": string;
  "--editor-bg": string;
  "--editor-shadow": string;
  "--collapse-bg": string;
  "--collapse-border": string;
  "--collapse-text": string;
  "--edge-default": string;
}

/** The CSS custom property names set by deriveThemeVars. */
export const THEME_CSS_VARS: readonly (keyof DerivedThemeVars)[] = [
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
] as const;

/** Derive 13 CSS custom properties from a theme definition. */
export function deriveThemeVars(theme: ThemeDefinition): DerivedThemeVars {
  const { mode, background: bg, foreground: fg, branches } = theme;
  const isLight = mode === "light";

  const primary = branches[0] ?? bg;
  const accent = branches[3] ?? bg;

  const textMuted = mix(fg, bg, 0.55);
  const selectionBg = toRgba(primary, isLight ? 0.15 : 0.25);
  const reparentBg = toRgba(accent, isLight ? 0.15 : 0.20);
  const editorBg = lighten(bg, isLight ? 0.05 : 0.06);
  const collapseBg = mix(bg, fg, 0.15);
  const collapseBorder = mix(bg, fg, 0.30);

  return {
    "--canvas-bg": bg,
    "--text-color": fg,
    "--text-muted": textMuted,
    "--selection-bg": selectionBg,
    "--selection-border": primary,
    "--reparent-bg": reparentBg,
    "--reparent-border": accent,
    "--editor-bg": editorBg,
    "--editor-shadow": primary,
    "--collapse-bg": collapseBg,
    "--collapse-border": collapseBorder,
    "--collapse-text": textMuted,
    "--edge-default": mix(bg, fg, 0.25),
  };
}
