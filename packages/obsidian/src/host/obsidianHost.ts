// ABOUTME: Host adapter for the Obsidian plugin build.
// ABOUTME: Uses Obsidian's Platform API for OS detection; installed in LimnPlugin.onload.

import type { Host } from "@limn/core";
import { Platform } from "obsidian";

export const obsidianHost: Host = {
  platform: Platform.isMacOS ? "mac" : "other",
};
