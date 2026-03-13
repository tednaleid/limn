// ABOUTME: Platform-aware key display name mapping.
// ABOUTME: Translates raw key names to user-facing labels for Mac vs Windows/Linux.

export type Platform = "mac" | "other";

/** Platform-independent key display names (same on all platforms). */
const COMMON_DISPLAY: Record<string, string> = {
  ArrowUp: "\u2191",
  ArrowDown: "\u2193",
  ArrowLeft: "\u2190",
  ArrowRight: "\u2192",
  " ": "Space",
  Escape: "Esc",
  Control: "Ctrl",
};

/** Mac-specific modifier translations. */
const MAC_DISPLAY: Record<string, string> = {
  Meta: "Cmd",
  Cmd: "Cmd",
  Alt: "Opt",
};

/** Windows/Linux modifier translations. */
const OTHER_DISPLAY: Record<string, string> = {
  Meta: "Ctrl",
  Cmd: "Ctrl",
};

/**
 * Translate a raw key name to a platform-appropriate display string.
 *
 * Handles both DOM key names (e.g. "Meta", "Control") from the keystroke
 * overlay and shortcut help data names (e.g. "Cmd", "Alt").
 */
export function displayKey(key: string, platform: Platform): string {
  const platformMap = platform === "mac" ? MAC_DISPLAY : OTHER_DISPLAY;
  return platformMap[key] ?? COMMON_DISPLAY[key] ?? key;
}
