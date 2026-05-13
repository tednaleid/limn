// ABOUTME: Hexagonal port for host-environment services (platform detection, etc).
// ABOUTME: Web/Obsidian/test adapters implement this; core code reads via getHost().

import type { Platform } from "../keybindings/platformKeys";

export interface Host {
  /** OS family for keyboard modifier display ("mac" shows Cmd/Opt, "other" shows Ctrl/Alt). */
  readonly platform: Platform;
}

const defaultHost: Host = { platform: "other" };

let current: Host = defaultHost;

/** Install the active host. Call once at entry-point startup before rendering. */
export function setHost(host: Host): void {
  current = host;
}

/** Read the active host. Returns a sensible default if setHost was never called (e.g. unit tests). */
export function getHost(): Host {
  return current;
}
