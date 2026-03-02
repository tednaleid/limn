// ABOUTME: Keyboard shortcuts help dialog component.
// ABOUTME: Shows all shortcuts grouped by category with kbd-style key badges.

import { useEffect, useCallback, useRef } from "react";
import { SHORTCUT_GROUPS } from "@limn/core";
import type { ShortcutEntry, ShortcutGroup } from "@limn/core";

export interface ShortcutsDialogProps {
  onClose: () => void;
}

const SCROLL_AMOUNT = 60;

export function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
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
          maxWidth: 560,
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
            Keyboard Shortcuts
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
        <div ref={bodyRef} tabIndex={-1} style={{ overflow: "auto", padding: "12px 20px 20px", outline: "none" }}>
          {SHORTCUT_GROUPS.map((group) => (
            <ShortcutSection key={group.title} group={group} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ShortcutSection({ group }: { group: ShortcutGroup }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-muted)",
          marginBottom: 8,
        }}
      >
        {group.title}
      </div>
      {group.entries.map((entry, i) => (
        <ShortcutRow
          key={i}
          entry={entry}
          isMouse={group.type === "mouse"}
        />
      ))}
    </div>
  );
}

function ShortcutRow({ entry, isMouse }: { entry: ShortcutEntry; isMouse: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "4px 0",
        gap: 12,
        fontSize: 13,
      }}
    >
      <div style={{ minWidth: 180, display: "flex", alignItems: "center", gap: 4 }}>
        {isMouse ? (
          <span style={{ color: "var(--text-muted)" }}>
            {entry.keys.join(" + ")}
          </span>
        ) : (
          <>
            {entry.keys.map((key, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {i > 0 && (
                  <span style={{ color: "var(--text-muted)", fontSize: 11 }}>+</span>
                )}
                <KbdBadge>{key}</KbdBadge>
              </span>
            ))}
            {entry.altKeys && (
              <>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>or</span>
                {entry.altKeys.map((key, i) => (
                  <KbdBadge key={i}>{key}</KbdBadge>
                ))}
              </>
            )}
          </>
        )}
      </div>
      <div style={{ flex: 1 }}>
        {entry.description}
      </div>
    </div>
  );
}

function KbdBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 24,
        height: 24,
        padding: "0 6px",
        borderRadius: 4,
        background: "var(--canvas-bg)",
        border: "1px solid var(--collapse-border)",
        fontSize: 12,
        fontWeight: 500,
        fontFamily: "inherit",
        color: "var(--text-color)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
