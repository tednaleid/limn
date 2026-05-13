// ABOUTME: Host adapter for the Obsidian plugin build.
// ABOUTME: Uses Obsidian's Platform API for OS detection and activeDocument for popout-safe DOM access.

import type { Host } from "@limn/core";
import { Platform } from "obsidian";

export const obsidianHost: Host = {
  platform: Platform.isMacOS ? "mac" : "other",
  // `activeDocument` is an Obsidian-provided global that resolves to the document
  // of the currently focused window (main or popout). Read fresh on each access
  // so DOM operations follow popout switches. Returning a getter rather than a
  // captured value is what makes the abstraction correct for Obsidian.
  get document() {
    return activeDocument;
  },
};
