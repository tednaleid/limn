// ABOUTME: Theme definitions and registry for Limn color schemes.
// ABOUTME: Each theme bundles canvas colors and a 14-color branch palette.

/*
 * Converting a terminal color scheme to a Limn theme:
 *
 * 1. Source the ANSI-16 palette from the terminal theme (colors 0-15:
 *    black, red, green, yellow, blue, magenta, cyan, white,
 *    then bright variants of each).
 * 2. Set `background` to the terminal theme's background color.
 * 3. Set `foreground` to the terminal theme's foreground color.
 * 4. Set `mode` to "light" if background is light, "dark" if dark.
 * 5. Build the `branches` array (14 colors):
 *    - Start with all 16 ANSI colors.
 *    - For dark themes: remove ANSI 0 (black) and ANSI 8 (bright black).
 *    - For light themes: remove ANSI 7 (white) and ANSI 15 (bright white).
 *    - Reorder the remaining 14 for good visual assignment.
 *      Suggested order: blue, red, green, yellow/orange, magenta, cyan,
 *      then their bright variants, yielding maximum hue diversity
 *      for the first few roots.
 * 6. Verify contrast: all 14 branch colors should be legible on the
 *    theme's background. Well-designed terminal themes already ensure this.
 */

export interface ThemeDefinition {
  readonly name: string;
  readonly mode: "light" | "dark";
  readonly background: string;
  readonly foreground: string;
  readonly branches: readonly string[];
}

/** Theme key used in file meta and the registry. */
export type ThemeKey = string;

// --- Theme registry ---

// ANSI order reference: 0=black 1=red 2=green 3=yellow 4=blue 5=magenta 6=cyan 7=white
//                        8=brBlack 9=brRed 10=brGreen 11=brYellow 12=brBlue 13=brMagenta 14=brCyan 15=brWhite
// Dark themes drop 0,8; Light themes drop 7,15.
// Reorder for branch assignment: blue, red, green, yellow, magenta, cyan, then bright variants.

const catppuccinMocha: ThemeDefinition = {
  name: "Catppuccin Mocha",
  mode: "dark",
  background: "#1e1e2e",
  foreground: "#cdd6f4",
  // ANSI palette: 1=red #f38ba8, 2=green #a6e3a1, 3=yellow #f9e2af,
  //   4=blue #89b4fa, 5=magenta #cba6f7, 6=cyan #94e2d5, 7=white #bac2de,
  //   9=brRed #f38ba8, 10=brGreen #a6e3a1, 11=brYellow #f9e2af,
  //   12=brBlue #89dcfe, 13=brMagenta #f5c2e7, 14=brCyan #94e2d5, 15=brWhite #a6adc8
  // Reordered: blue, red, green, yellow, magenta, cyan, white,
  //            brBlue, brRed, brGreen, brYellow, brMagenta, brCyan, brWhite
  branches: [
    "#89b4fa", "#f38ba8", "#a6e3a1", "#f9e2af", "#cba6f7", "#94e2d5", "#bac2de",
    "#89dcfe", "#eba0ac", "#a6e3a1", "#f9e2af", "#f5c2e7", "#94e2d5", "#a6adc8",
  ],
};

const catppuccinLatte: ThemeDefinition = {
  name: "Catppuccin Latte",
  mode: "light",
  background: "#eff1f5",
  foreground: "#4c4f69",
  // ANSI palette: 0=black #5c5f77, 1=red #d20f39, 2=green #40a02b, 3=yellow #df8e1d,
  //   4=blue #1e66f5, 5=magenta #8839ef, 6=cyan #179299, 8=brBlack #6c6f85,
  //   9=brRed #d20f39, 10=brGreen #40a02b, 11=brYellow #df8e1d,
  //   12=brBlue #1e66f5, 13=brMagenta #8839ef, 14=brCyan #179299
  // Drop 7 (white #acb0be) and 15 (brWhite #bcc0cc)
  branches: [
    "#1e66f5", "#d20f39", "#40a02b", "#df8e1d", "#8839ef", "#179299", "#5c5f77",
    "#1e66f5", "#d20f39", "#40a02b", "#df8e1d", "#8839ef", "#179299", "#6c6f85",
  ],
};

const solarizedDark: ThemeDefinition = {
  name: "Solarized Dark",
  mode: "dark",
  background: "#002b36",
  foreground: "#839496",
  // ANSI: 1=red #dc322f, 2=green #859900, 3=yellow #b58900, 4=blue #268bd2,
  //   5=magenta #d33682, 6=cyan #2aa198, 7=white #eee8d5,
  //   9=brRed #cb4b16, 10=brGreen #586e75, 11=brYellow #657b83,
  //   12=brBlue #839496, 13=brMagenta #6c71c4, 14=brCyan #93a1a1, 15=brWhite #fdf6e3
  // Drop 0 (#073642) and 8 (#002b36). Using Solarized accent colors for bright slots.
  branches: [
    "#268bd2", "#dc322f", "#859900", "#b58900", "#d33682", "#2aa198", "#eee8d5",
    "#6c71c4", "#cb4b16", "#586e75", "#657b83", "#839496", "#93a1a1", "#fdf6e3",
  ],
};

const solarizedLight: ThemeDefinition = {
  name: "Solarized Light",
  mode: "light",
  background: "#fdf6e3",
  foreground: "#657b83",
  // Drop 7 (#eee8d5) and 15 (#fdf6e3)
  branches: [
    "#268bd2", "#dc322f", "#859900", "#b58900", "#d33682", "#2aa198", "#073642",
    "#6c71c4", "#cb4b16", "#586e75", "#002b36", "#839496", "#93a1a1", "#657b83",
  ],
};

const dracula: ThemeDefinition = {
  name: "Dracula",
  mode: "dark",
  background: "#282a36",
  foreground: "#f8f8f2",
  // ANSI: 1=red #ff5555, 2=green #50fa7b, 3=yellow #f1fa8c, 4=blue #bd93f9,
  //   5=magenta #ff79c6, 6=cyan #8be9fd, 7=white #f8f8f2,
  //   9=brRed #ff6e6e, 10=brGreen #69ff94, 11=brYellow #ffffa5,
  //   12=brBlue #d6acff, 13=brMagenta #ff92df, 14=brCyan #a4ffff, 15=brWhite #ffffff
  // Drop 0 (#21222c) and 8 (#6272a4)
  branches: [
    "#bd93f9", "#ff5555", "#50fa7b", "#f1fa8c", "#ff79c6", "#8be9fd", "#f8f8f2",
    "#d6acff", "#ff6e6e", "#69ff94", "#ffffa5", "#ff92df", "#a4ffff", "#ffffff",
  ],
};

const nord: ThemeDefinition = {
  name: "Nord",
  mode: "dark",
  background: "#2e3440",
  foreground: "#d8dee9",
  // ANSI: 1=red #bf616a, 2=green #a3be8c, 3=yellow #ebcb8b, 4=blue #5e81ac,
  //   5=magenta #b48ead, 6=cyan #88c0d0, 7=white #e5e9f0,
  //   9=brRed #bf616a, 10=brGreen #a3be8c, 11=brYellow #ebcb8b,
  //   12=brBlue #81a1c1, 13=brMagenta #b48ead, 14=brCyan #8fbcbb, 15=brWhite #eceff4
  // Drop 0 (#3b4252) and 8 (#4c566a)
  branches: [
    "#5e81ac", "#bf616a", "#a3be8c", "#ebcb8b", "#b48ead", "#88c0d0", "#e5e9f0",
    "#81a1c1", "#bf616a", "#a3be8c", "#ebcb8b", "#b48ead", "#8fbcbb", "#eceff4",
  ],
};

const classicLight: ThemeDefinition = {
  name: "Classic Light",
  mode: "light",
  background: "#f5f5f5",
  foreground: "#1f2937",
  // The original Limn 8-color palette, expanded to 14.
  // First 8 match BRANCH_PALETTE from palette.ts. Remaining 6 are darker/muted variants.
  branches: [
    "#4285f4", "#ea4335", "#34a853", "#ff6d01", "#a142f4", "#46bdc6", "#5c5f77",
    "#3367d6", "#c62828", "#2e7d32", "#e65100", "#7b1fa2", "#00838f", "#6c6f85",
  ],
};

const classicDark: ThemeDefinition = {
  name: "Classic Dark",
  mode: "dark",
  background: "#1a1a2e",
  foreground: "#e0e0e0",
  // The original Limn 8-color palette with brighter variants for dark background.
  branches: [
    "#60a5fa", "#f87171", "#4ade80", "#fb923c", "#c084fc", "#67e8f9", "#e5e7eb",
    "#93c5fd", "#fca5a5", "#86efac", "#fdba74", "#d8b4fe", "#a5f3fc", "#f3f4f6",
  ],
};

/** All registered themes, keyed by theme key. */
export const THEME_REGISTRY: Readonly<Record<ThemeKey, ThemeDefinition>> = {
  "catppuccin-mocha": catppuccinMocha,
  "catppuccin-latte": catppuccinLatte,
  "solarized-dark": solarizedDark,
  "solarized-light": solarizedLight,
  "dracula": dracula,
  "nord": nord,
  "classic-light": classicLight,
  "classic-dark": classicDark,
};

export const DEFAULT_LIGHT_THEME: ThemeKey = "catppuccin-latte";
export const DEFAULT_DARK_THEME: ThemeKey = "catppuccin-mocha";

/** Number of branch colors in every theme. */
export const BRANCH_COUNT = 14;

/** Look up a theme by key, falling back to the appropriate default. */
export function resolveTheme(key: ThemeKey, mode: "light" | "dark"): ThemeDefinition {
  const theme = THEME_REGISTRY[key];
  if (theme) return theme;
  const fallback = mode === "light" ? DEFAULT_LIGHT_THEME : DEFAULT_DARK_THEME;
  // Fallback keys are compile-time constants guaranteed to be in the registry
  const fallbackTheme = THEME_REGISTRY[fallback];
  if (!fallbackTheme) throw new Error(`Missing default theme: ${fallback}`);
  return fallbackTheme;
}

/** Get all theme keys grouped by mode. */
export function getThemesByMode(): { light: ThemeKey[]; dark: ThemeKey[] } {
  const light: ThemeKey[] = [];
  const dark: ThemeKey[] = [];
  for (const [key, theme] of Object.entries(THEME_REGISTRY)) {
    if (theme.mode === "light") light.push(key);
    else dark.push(key);
  }
  return { light, dark };
}
