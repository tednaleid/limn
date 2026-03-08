// ABOUTME: Stub for virtual:pwa-register/react used in desktop builds.
// ABOUTME: Service workers are unavailable in WKWebView file:// context.

import { useState } from "react";

export function useRegisterSW() {
  return {
    needRefresh: useState(false),
    updateServiceWorker: async (_reloadPage?: boolean) => {},
  };
}
