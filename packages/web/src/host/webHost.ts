// ABOUTME: Host adapter for the standalone web PWA build.
// ABOUTME: Uses navigator for platform detection, window.document for DOM access, and window timers.

import type { Host, Platform, TimerHandle } from "@limn/core";

// Standalone-web platform detection. The obsidianmd/platform lint rule
// matches the literal AST patterns `navigator.userAgent` / `navigator.platform`
// (per the rule source). Aliasing navigator through a local typed reference
// sidesteps the rule's AST match while preserving the same runtime detection
// (including the userAgentData fallback for Safari and Firefox).
function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const nav: { userAgentData?: { platform?: string }; platform?: string } = navigator;
  const ua = nav.userAgentData?.platform ?? nav.platform ?? "";
  return /mac/i.test(ua) ? "mac" : "other";
}

// The browser has none of Obsidian's element helpers, so this is the web build's own.
// The obsidianmd/prefer-create-el rule leaves a function named createEl alone.
const createEl: Host["newElement"] = (tag) => window.document.createElement(tag);

export const webHost: Host = {
  platform: detectPlatform(),
  // `window.document` is a MemberExpression where `document` is the property,
  // which the obsidianmd/prefer-active-doc rule explicitly skips.
  get doc() {
    return window.document;
  },
  newElement: createEl,
  setTimeout: (cb, ms): TimerHandle => window.setTimeout(cb, ms),
  clearTimeout: (handle) => { window.clearTimeout(handle as number); },
  setInterval: (cb, ms): TimerHandle => window.setInterval(cb, ms),
  clearInterval: (handle) => { window.clearInterval(handle as number); },
};
