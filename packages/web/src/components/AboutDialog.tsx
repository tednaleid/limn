// ABOUTME: About dialog component showing app description, features, and version info.
// ABOUTME: Modeled after ShortcutsDialog with same overlay/modal/keyboard pattern.

import { useEffect, useCallback, useRef } from "react";

export interface AboutDialogProps {
  onClose: () => void;
}

const SCROLL_AMOUNT = 60;

export function AboutDialog({ onClose }: AboutDialogProps) {
  const handleClose = useCallback(() => onClose(), [onClose]);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Focus the scrollable body on mount so screen readers and scroll work
  useEffect(() => {
    bodyRef.current?.focus();
  }, []);

  // Escape closes; j/k, arrows, space scroll (capture phase, before canvas handler)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
        return;
      }

      const body = bodyRef.current;
      if (!body) return;

      let delta = 0;
      switch (e.key) {
        case "j":
        case "ArrowDown":
          delta = SCROLL_AMOUNT;
          break;
        case "k":
        case "ArrowUp":
          delta = -SCROLL_AMOUNT;
          break;
        case " ":
          delta = e.shiftKey ? -body.clientHeight * 0.8 : body.clientHeight * 0.8;
          break;
        default:
          return;
      }

      e.preventDefault();
      e.stopPropagation();
      body.scrollBy({ top: delta });
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleClose]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.3)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={handleClose}
    >
      <div
        style={{
          maxWidth: 400,
          width: "90%",
          maxHeight: "80%",
          background: "var(--editor-bg)",
          border: "1px solid var(--collapse-border)",
          borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          color: "var(--text-color)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "16px 20px 12px",
            borderBottom: "1px solid var(--collapse-border)",
          }}
        >
          <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>
            About
          </span>
          <button
            onClick={handleClose}
            style={{
              width: 28,
              height: 28,
              border: "none",
              borderRadius: 6,
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 18,
            }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div ref={bodyRef} tabIndex={-1} style={{ overflow: "auto", padding: "16px 20px 20px", outline: "none" }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Limn</div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 16 }}>
            limn /lim/ verb — to outline in clear sharp detail
          </div>
          <div style={{ fontSize: 14, marginBottom: 16 }}>
            A keyboard-first mind map that runs entirely in your browser.
          </div>
          <ul style={{ fontSize: 14, margin: "0 0 16px 0", paddingLeft: 20, lineHeight: 1.6 }}>
            <li>All data stays on your device (IndexedDB). Nothing is sent to a server.</li>
            <li>Works offline as an installable progressive web app.</li>
            <li>Save and open .limn files for portable, durable storage.</li>
            <li>Also available as an Obsidian plugin.</li>
          </ul>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Source:{" "}
            <a
              href="https://github.com/tednaleid/limn"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--text-muted)" }}
            >
              github.com/tednaleid/limn
            </a>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            v{__APP_VERSION__} ({__GIT_SHA__})
          </div>
        </div>
      </div>
    </div>
  );
}
