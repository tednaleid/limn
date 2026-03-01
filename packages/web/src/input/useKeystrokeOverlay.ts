// ABOUTME: React hook that passively observes keyboard events for the keystroke overlay.
// ABOUTME: Tracks held keys and manages fade timing independently of useKeyboardHandler.

import { useState, useEffect, useRef, useCallback } from "react";
import { formatKeystrokeParts } from "./formatKeystroke";

/** Delay before released keys start fading (ms). */
const FADE_DELAY_MS = 20;
/** Duration of the CSS opacity fade (ms). Must match the transition in KeystrokeOverlay. */
const FADE_DURATION_MS = 800;

/** The Ctrl+Shift+K toggle combo -- skip displaying it in the overlay. */
function isToggleCombo(held: Set<string>): boolean {
  return held.size === 3 && held.has("Control") && held.has("Shift") && held.has("K");
}

export interface KeystrokeOverlayState {
  /** Parts for keys currently held (always full opacity). */
  stableParts: string[];
  /** Parts for keys recently released (subject to fade). */
  transientParts: string[];
  /** Opacity for transient parts (1 → 0). */
  transientOpacity: number;
}

/**
 * Hook that passively listens to keydown/keyup on window and returns
 * stable (held) and transient (fading) key parts for the keystroke overlay.
 *
 * When a non-modifier key is released while modifiers are still held,
 * only the non-modifier portion fades -- modifiers stay visible.
 * When all keys are released, everything fades.
 */
export function useKeystrokeOverlay(enabled: boolean): KeystrokeOverlayState {
  const [stableParts, setStableParts] = useState<string[]>([]);
  const [transientParts, setTransientParts] = useState<string[]>([]);
  const [transientOpacity, setTransientOpacity] = useState(0);
  const heldRef = useRef<Set<string>>(new Set());
  const stableRef = useRef<string[]>([]);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimers = useCallback(() => {
    if (fadeTimerRef.current !== null) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (cleanupTimerRef.current !== null) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
  }, []);

  const startFade = useCallback(() => {
    cancelTimers();
    fadeTimerRef.current = setTimeout(() => {
      setTransientOpacity(0);
      // Remove transient parts from DOM after CSS transition completes
      cleanupTimerRef.current = setTimeout(() => {
        setTransientParts([]);
      }, FADE_DURATION_MS);
    }, FADE_DELAY_MS);
  }, [cancelTimers]);

  useEffect(() => {
    if (!enabled) {
      heldRef.current.clear();
      stableRef.current = [];
      setStableParts([]);
      setTransientParts([]);
      setTransientOpacity(0);
      cancelTimers();
      return;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;

      let key = e.key;
      // macOS Alt normalization: Alt+letter produces unicode chars, use base letter
      if (e.altKey && e.code.startsWith("Key")) {
        key = e.code.slice(3).toLowerCase();
      }

      heldRef.current.add(key);

      if (isToggleCombo(heldRef.current)) {
        stableRef.current = [];
        setStableParts([]);
        setTransientParts([]);
        setTransientOpacity(0);
        cancelTimers();
        return;
      }

      cancelTimers();
      const parts = formatKeystrokeParts(heldRef.current);
      stableRef.current = parts;
      setStableParts(parts);
      setTransientParts([]);
      setTransientOpacity(1);
    }

    function handleKeyUp(e: KeyboardEvent) {
      let key = e.key;
      if (e.altKey && e.code.startsWith("Key")) {
        key = e.code.slice(3).toLowerCase();
      }

      heldRef.current.delete(key);
      // Also remove the raw e.key in case it was added under a different normalization
      heldRef.current.delete(e.key);

      const newStable = formatKeystrokeParts(heldRef.current);
      const oldStable = stableRef.current;
      const fading = oldStable.filter((p) => !newStable.includes(p));

      stableRef.current = newStable;
      setStableParts(newStable);
      setTransientParts(fading);
      setTransientOpacity(1);
      startFade();
    }

    function handleBlur() {
      const oldStable = stableRef.current;
      heldRef.current.clear();
      stableRef.current = [];
      setStableParts([]);
      setTransientParts(oldStable);
      setTransientOpacity(1);
      startFade();
    }

    window.addEventListener("keydown", handleKeyDown, { passive: true });
    window.addEventListener("keyup", handleKeyUp, { passive: true });
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      cancelTimers();
    };
  }, [enabled, cancelTimers, startFade]);

  return { stableParts, transientParts, transientOpacity };
}
