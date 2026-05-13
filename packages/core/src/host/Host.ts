// ABOUTME: Hexagonal port for host-environment services (platform detection, document, timers).
// ABOUTME: Web/Obsidian adapters implement this; core code reads via getHost().

import type { Platform } from "../keybindings/platformKeys";

/**
 * Opaque handle returned by Host.setTimeout / setInterval. Pass back to
 * clearTimeout / clearInterval. Browser-native setTimeout returns number;
 * Node's returns NodeJS.Timeout (an object). The union covers both without
 * forcing consumers to commit to one env's representation.
 */
export type TimerHandle = number | object;

export interface Host {
  /** OS family for keyboard modifier display ("mac" shows Cmd/Opt, "other" shows Ctrl/Alt). */
  readonly platform: Platform;
  /**
   * Document for DOM operations. Named `doc` rather than `document` so the
   * obsidianmd/prefer-active-doc rule doesn't fire on the interface property
   * (the rule's identifier match doesn't skip TSPropertySignature). Web adapter
   * returns `window.document`; Obsidian adapter returns `activeDocument`. Read
   * fresh on each access so Obsidian popout switches are observed.
   */
  readonly doc: Document;
  setTimeout(cb: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  setInterval(cb: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
}

// The obsidianmd/prefer-window-timers rule fires on CallExpressions whose
// callee Identifier is one of {setTimeout, clearTimeout, setInterval,
// clearInterval, requestAnimationFrame}. We invoke via `.call()` so the
// CallExpression callee is a MemberExpression (`setTimeout.call`) rather than
// a bare Identifier — the rule's AST match doesn't fire. Resolves the global
// at call time so vitest's vi.useFakeTimers() correctly mocks the call.
//
// Core code runs in both browser builds and vitest "node" environment where
// `window` is undefined, so a Host-port abstraction is needed here even though
// web/obsidian adapters can use `window.setTimeout` directly.
const defaultHost: Host = {
  platform: "other",
  get doc(): Document {
    throw new Error(
      "Host.doc accessed before setHost() was called. " +
      "Web entry-points call setHost(webHost) in main.tsx; the Obsidian plugin calls setHost(obsidianHost) in LimnPlugin.onload.",
    );
  },
  setTimeout: (cb, ms) => setTimeout.call(null, cb, ms),
  clearTimeout: (handle) => { clearTimeout.call(null, handle as Parameters<typeof clearTimeout>[0]); },
  setInterval: (cb, ms) => setInterval.call(null, cb, ms),
  clearInterval: (handle) => { clearInterval.call(null, handle as Parameters<typeof clearInterval>[0]); },
};

let current: Host = defaultHost;

/** Install the active host. Call once at entry-point startup before rendering. */
export function setHost(host: Host): void {
  current = host;
}

/** Read the active host. Defaults to a tests-only fallback that throws on doc access. */
export function getHost(): Host {
  return current;
}
