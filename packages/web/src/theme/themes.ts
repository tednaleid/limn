// ABOUTME: Theme definitions mapping semantic names to color values.
// ABOUTME: Adding a new theme is just adding an object to THEMES.

export interface Theme {
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

const light: Theme = {
  "--canvas-bg": "#f5f5f5",
  "--text-color": "#1f2937",
  "--text-muted": "#6b7280",
  "--selection-bg": "rgba(59, 130, 246, 0.15)",
  "--selection-border": "#3b82f6",
  "--reparent-bg": "rgba(245, 158, 11, 0.15)",
  "--reparent-border": "#f59e0b",
  "--editor-bg": "#ffffff",
  "--editor-shadow": "#3b82f6",
  "--collapse-bg": "#e5e7eb",
  "--collapse-border": "#9ca3af",
  "--collapse-text": "#6b7280",
  "--edge-default": "#c4c4c4",
};

const dark: Theme = {
  "--canvas-bg": "#1a1a2e",
  "--text-color": "#e0e0e0",
  "--text-muted": "#9ca3af",
  "--selection-bg": "rgba(96, 165, 250, 0.25)",
  "--selection-border": "#60a5fa",
  "--reparent-bg": "rgba(251, 191, 36, 0.2)",
  "--reparent-border": "#fbbf24",
  "--editor-bg": "#2a2a3e",
  "--editor-shadow": "#60a5fa",
  "--collapse-bg": "#374151",
  "--collapse-border": "#6b7280",
  "--collapse-text": "#9ca3af",
  "--edge-default": "#555555",
};

export const THEMES: Record<string, Theme> = { light, dark };

/** Apply a named theme by setting CSS custom properties on <html>. */
export function applyTheme(name: string): void {
  const el = document.documentElement;
  el.setAttribute("data-theme", name);

  // If the name is a known theme, set its CSS variables directly.
  // This ensures themes work even without a matching CSS rule.
  const theme = THEMES[name];
  if (theme) {
    for (const [key, value] of Object.entries(theme)) {
      el.style.setProperty(key, value);
    }
  }
}

/** Resolve "system" or "default" to "light" or "dark" based on OS preference. */
export function resolveThemeName(name: string): string {
  if (name === "system" || name === "default") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return name;
}
