// ABOUTME: Host adapter for the Obsidian plugin build.
// ABOUTME: Uses Obsidian Platform API + activeDocument; timers go through window per prefer-window-timers.

import type { Host, TimerHandle } from "@limn/core";
import { Platform } from "obsidian";

export const obsidianHost: Host = {
  platform: Platform.isMacOS ? "mac" : "other",
  // `activeDocument` is an Obsidian-provided global that resolves to the document
  // of the currently focused window (main or popout). Read fresh on each access
  // so DOM operations follow popout switches.
  get doc() {
    return activeDocument;
  },
  // The obsidianmd/prefer-window-timers rule explicitly rejects
  // `activeWindow.setTimeout` in favor of `window.setTimeout` for both web and
  // Obsidian builds. window.setTimeout is the canonical form per the rule.
  setTimeout: (cb, ms): TimerHandle => window.setTimeout(cb, ms),
  clearTimeout: (handle) => { window.clearTimeout(handle as number); },
  setInterval: (cb, ms): TimerHandle => window.setInterval(cb, ms),
  clearInterval: (handle) => { window.clearInterval(handle as number); },
};
