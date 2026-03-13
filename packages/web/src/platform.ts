// ABOUTME: Detects the user's platform once at import time.
// ABOUTME: Used to show platform-appropriate modifier key names.

import type { Platform } from "@limn/core";

export const PLATFORM: Platform =
  typeof navigator !== "undefined" &&
  /mac/i.test(
    (navigator as { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ?? navigator.platform ?? "",
  )
    ? "mac"
    : "other";
