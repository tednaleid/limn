// ABOUTME: Pure formatting logic for keystroke overlay display.
// ABOUTME: Converts raw key names to presentable badge parts with consistent modifier ordering.

import { displayKey } from "@limn/core";
import type { Platform } from "@limn/core";
import { PLATFORM } from "../platform";

const MODIFIER_ORDER = ["Control", "Alt", "Shift", "Meta"] as const;
const MODIFIER_SET = new Set<string>(MODIFIER_ORDER);

/**
 * Convert a set of currently-held raw key names into an ordered array of
 * display strings suitable for rendering as kbd badges.
 *
 * Modifiers appear first in Ctrl/Opt/Shift/Cmd order, followed by the
 * base key. Single character keys are kept lowercase to avoid implying
 * a capital letter. When only modifiers are held, just the modifiers
 * are returned (no ellipsis).
 */
export function formatKeystrokeParts(
  held: Set<string>,
  platform: Platform = PLATFORM,
): string[] {
  if (held.size === 0) return [];

  const parts: string[] = [];

  // Add modifiers in canonical order
  for (const mod of MODIFIER_ORDER) {
    if (held.has(mod)) {
      parts.push(displayKey(mod, platform));
    }
  }

  // Add non-modifier keys
  for (const key of held) {
    if (MODIFIER_SET.has(key)) continue;
    parts.push(displayKey(key, platform));
  }

  return parts;
}
