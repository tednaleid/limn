// ABOUTME: DOM keyboard event handler that delegates to core dispatch.
// ABOUTME: Captures keydown events and calls preventDefault for handled keys.

import { useEffect } from "react";
import { dispatch } from "@mindforge/core";
import type { Editor, Modifiers } from "@mindforge/core";

/** Keys that should always be prevented from browser default behavior. */
const ALWAYS_PREVENT = new Set(["Tab"]);

/** Meta+key combos that conflict with browser defaults and must be prevented. */
const META_PREVENT = new Set(["=", "-", "0", "1", "s", "o"]);

/**
 * Hook that attaches a global keydown listener and routes events
 * through the core dispatch function.
 */
export function useKeyboardHandler(editor: Editor): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept if a non-canvas input element has focus
      // (e.g., a dialog text field, but NOT our edit textarea)
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        (target.tagName === "TEXTAREA" && !target.dataset.mindforgeEdit)
      ) {
        return;
      }

      const modifiers: Modifiers = {
        meta: e.metaKey,
        shift: e.shiftKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
      };

      const handled = dispatch(editor, e.key, modifiers);

      if (handled || ALWAYS_PREVENT.has(e.key) || (e.metaKey && META_PREVENT.has(e.key))) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor]);
}
