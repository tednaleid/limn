// ABOUTME: Non-blocking banner shown when a new service worker version is available.
// ABOUTME: Prompts user to reload for the latest version.

import { useRegisterSW } from "virtual:pwa-register/react";

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#1e40af",
        color: "#fff",
        padding: "8px 16px",
        borderRadius: 8,
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
        zIndex: 9999,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      <span>A new version is available.</span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: "#fff",
          color: "#1e40af",
          border: "none",
          borderRadius: 4,
          padding: "4px 12px",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        Reload
      </button>
    </div>
  );
}
