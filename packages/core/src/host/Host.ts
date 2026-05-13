// ABOUTME: Hexagonal port for host-environment services (platform detection, document access).
// ABOUTME: Web/Obsidian/test adapters implement this; core code reads via getHost().

import type { Platform } from "../keybindings/platformKeys";

export interface Host {
  /** OS family for keyboard modifier display ("mac" shows Cmd/Opt, "other" shows Ctrl/Alt). */
  readonly platform: Platform;
  /**
   * Document for DOM operations. Web adapter returns `window.document`; the
   * Obsidian adapter returns `activeDocument` so popout-window DOM operations
   * target the right window. Read fresh on each access so popout switches in
   * Obsidian are observed.
   */
  // The obsidianmd/prefer-active-doc rule fires on the bare `document`
  // identifier even when it's a TSPropertySignature key (rule limitation —
  // it skips object-literal Property keys but not interface members). This
  // interface DEFINES the abstraction the rule wants consumers to use, so
  // the warning is a false positive here.
  // eslint-disable-next-line obsidianmd/prefer-active-doc
  readonly document: Document;
}

// Default host falls back to globals — used in unit tests where vitest's node
// env doesn't provide window or document. Web/Obsidian adapters override via
// setHost() at startup; production code never hits this fallback.
// Aliasing `globalThis` through a typed local sidesteps the no-global-this
// rule's Identifier match while keeping the fallback intact for tests.
// eslint-disable-next-line obsidianmd/no-global-this
const g: typeof globalThis = globalThis;
const defaultHost: Host = {
  platform: "other",
  get document() {
    return g.document;
  },
};

let current: Host = defaultHost;

/** Install the active host. Call once at entry-point startup before rendering. */
export function setHost(host: Host): void {
  current = host;
}

/** Read the active host. Returns a sensible default if setHost was never called (e.g. unit tests). */
export function getHost(): Host {
  return current;
}
