// ABOUTME: Host adapter for the standalone web PWA build.
// ABOUTME: Uses navigator for platform detection; called once from main.tsx at startup.

import type { Host, Platform } from "@limn/core";

// This file is the deliberate navigator-using adapter for the standalone web
// PWA. The Obsidian build uses obsidianHost.ts and never bundles this file,
// so the obsidianmd/platform rule is intentionally not applied here (see
// eslint.obsidian.config.js ignores).
function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return /mac/i.test(ua) ? "mac" : "other";
}

export const webHost: Host = {
  platform: detectPlatform(),
};
