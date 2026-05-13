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
  readonly document: Document;
}

// Default host falls back to globals — used in unit tests where jsdom provides
// the DOM globals. Web/Obsidian adapters override via setHost() at startup.
const defaultHost: Host = {
  platform: "other",
  get document() {
    return globalThis.document;
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
