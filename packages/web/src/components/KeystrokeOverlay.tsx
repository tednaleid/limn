// ABOUTME: Presentational overlay showing current keystrokes as large kbd badges.
// ABOUTME: Positioned above the toolbar in the lower-left corner for demo visibility.

import { useKeystrokeOverlay } from "../input/useKeystrokeOverlay";

export function KeystrokeOverlay({ enabled }: { enabled: boolean }) {
  const { parts, opacity } = useKeystrokeOverlay(enabled);

  if (parts.length === 0 && opacity === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 56,
        left: 12,
        zIndex: 1000,
        pointerEvents: "none",
        userSelect: "none",
        display: "flex",
        alignItems: "center",
        gap: 8,
        opacity,
        transition: "opacity 200ms ease",
      }}
    >
      {parts.map((part, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {i > 0 && (
            <span style={{ fontSize: 32, color: "var(--text-muted)", lineHeight: 1 }}>+</span>
          )}
          <kbd
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 100,
              padding: "8px 20px",
              fontSize: 48,
              fontFamily: "inherit",
              fontWeight: 500,
              lineHeight: 1,
              borderRadius: 10,
              background: "var(--canvas-bg)",
              color: "var(--text-color)",
              border: "2px solid var(--collapse-border)",
            }}
          >
            {part}
          </kbd>
        </span>
      ))}
    </div>
  );
}
