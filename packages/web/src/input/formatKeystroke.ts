// ABOUTME: Pure formatting logic for keystroke overlay display.
// ABOUTME: Converts raw key names to presentable badge parts with consistent modifier ordering.

const MODIFIER_ORDER = ["Control", "Alt", "Shift", "Meta"] as const;
const MODIFIER_SET = new Set<string>(MODIFIER_ORDER);

const KEY_DISPLAY: Record<string, string> = {
  Control: "Ctrl",
  Alt: "Opt",
  Shift: "Shift",
  Meta: "Cmd",
  ArrowUp: "\u2191",
  ArrowDown: "\u2193",
  ArrowLeft: "\u2190",
  ArrowRight: "\u2192",
  " ": "Space",
  Escape: "Esc",
  Backspace: "Backspace",
  Tab: "Tab",
  Enter: "Enter",
  Delete: "Delete",
};

/**
 * Convert a set of currently-held raw key names into an ordered array of
 * display strings suitable for rendering as kbd badges.
 *
 * Modifiers appear first in Ctrl/Opt/Shift/Cmd order, followed by the
 * base key. Single character keys are uppercased. When only modifiers
 * are held, "..." is appended as the final part.
 */
export function formatKeystrokeParts(held: Set<string>): string[] {
  if (held.size === 0) return [];

  const parts: string[] = [];
  let hasNonModifier = false;

  // Add modifiers in canonical order
  for (const mod of MODIFIER_ORDER) {
    if (held.has(mod)) {
      parts.push(KEY_DISPLAY[mod] ?? mod);
    }
  }

  // Add non-modifier keys
  for (const key of held) {
    if (MODIFIER_SET.has(key)) continue;
    hasNonModifier = true;
    const display = KEY_DISPLAY[key];
    if (display) {
      parts.push(display);
    } else if (key.length === 1) {
      parts.push(key.toUpperCase());
    } else {
      parts.push(key);
    }
  }

  // Modifier-only: append ellipsis
  if (!hasNonModifier) {
    parts.push("...");
  }

  return parts;
}
