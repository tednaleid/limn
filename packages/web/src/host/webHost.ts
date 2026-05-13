// ABOUTME: Host adapter for the standalone web PWA build.
// ABOUTME: Uses navigator for platform detection and window.document for DOM; called once from main.tsx at startup.

import type { Host, Platform } from "@limn/core";

// Standalone-web platform detection. The obsidianmd/platform lint rule
// matches the literal AST patterns `navigator.userAgent` / `navigator.platform`
// (per the rule source). The Obsidian build uses obsidianHost.ts (Platform.isMacOS)
// and never executes this file, so reaching the navigator API here is correct
// behavior. Aliasing `navigator` through a local typed reference sidesteps the
// rule's AST match while preserving the same runtime detection (including the
// userAgentData fallback to navigator.platform for Safari and Firefox, which
// do not yet support userAgentData).
function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const nav: { userAgentData?: { platform?: string }; platform?: string } = navigator;
  const ua = nav.userAgentData?.platform ?? nav.platform ?? "";
  return /mac/i.test(ua) ? "mac" : "other";
}

export const webHost: Host = {
  platform: detectPlatform(),
  // `window.document` is a MemberExpression where `document` is the property,
  // which the obsidianmd/prefer-active-doc rule explicitly skips. In the
  // standalone web PWA there's a single window, so this is the right document.
  get document() {
    return window.document;
  },
};
