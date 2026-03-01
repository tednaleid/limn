// ABOUTME: React hook that passively observes keyboard events for the keystroke overlay.
// ABOUTME: Tracks held keys and manages fade timing independently of useKeyboardHandler.

import { useState, useEffect, useRef, useCallback } from "react";
import { formatKeystrokeParts } from "./formatKeystroke";

const HOLD_MS = 800;

/** The Ctrl+Shift+K toggle combo -- skip displaying it in the overlay. */
function isToggleCombo(held: Set<string>): boolean {
  return held.size === 3 && held.has("Control") && held.has("Shift") && held.has("K");
}

export interface KeystrokeOverlayState {
  parts: string[];
  opacity: number;
}

/**
 * Hook that passively listens to keydown/keyup on window and returns
 * formatted key parts + opacity for the keystroke overlay.
 * Completely independent of useKeyboardHandler.
 */
export function useKeystrokeOverlay(enabled: boolean): KeystrokeOverlayState {
  const [parts, setParts] = useState<string[]>([]);
  const [opacity, setOpacity] = useState(0);
  const heldRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startDecay = useCallback(() => {
    cancelTimer();
    timerRef.current = setTimeout(() => {
      setOpacity(0);
    }, HOLD_MS);
  }, [cancelTimer]);

  useEffect(() => {
    if (!enabled) {
      heldRef.current.clear();
      setParts([]);
      setOpacity(0);
      cancelTimer();
      return;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;

      let key = e.key;
      // macOS Alt normalization: Alt+letter produces unicode chars, use base letter
      if (e.altKey && e.code.startsWith("Key")) {
        key = e.code.slice(3).toUpperCase();
      }

      heldRef.current.add(key);

      if (isToggleCombo(heldRef.current)) {
        setParts([]);
        setOpacity(0);
        return;
      }

      cancelTimer();
      setParts(formatKeystrokeParts(heldRef.current));
      setOpacity(1);
    }

    function handleKeyUp(e: KeyboardEvent) {
      let key = e.key;
      if (e.altKey && e.code.startsWith("Key")) {
        key = e.code.slice(3).toUpperCase();
      }

      heldRef.current.delete(key);
      // Also remove the raw e.key in case it was added under a different normalization
      heldRef.current.delete(e.key);

      if (heldRef.current.size === 0) {
        startDecay();
      } else {
        setParts(formatKeystrokeParts(heldRef.current));
      }
    }

    function handleBlur() {
      heldRef.current.clear();
      startDecay();
    }

    window.addEventListener("keydown", handleKeyDown, { passive: true });
    window.addEventListener("keyup", handleKeyUp, { passive: true });
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      cancelTimer();
    };
  }, [enabled, cancelTimer, startDecay]);

  return { parts, opacity };
}
