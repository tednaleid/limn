// ABOUTME: Presentational overlay showing current keystrokes as large kbd badges.
// ABOUTME: Positioned above the toolbar in the lower-left corner for demo visibility.

import { useKeystrokeOverlay } from "../input/useKeystrokeOverlay";

const badgeStyle: React.CSSProperties = {
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
};

const plusStyle: React.CSSProperties = {
  fontSize: 32,
  color: "var(--text-muted)",
  lineHeight: 1,
};

function BadgeGroup({ parts, showLeadingPlus }: { parts: string[]; showLeadingPlus: boolean }) {
  return (
    <>
      {parts.map((part, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(showLeadingPlus || i > 0) && <span style={plusStyle}>+</span>}
          <kbd style={badgeStyle}>{part}</kbd>
        </span>
      ))}
    </>
  );
}

export function KeystrokeOverlay({ enabled }: { enabled: boolean }) {
  const { stableParts, transientParts, transientOpacity } = useKeystrokeOverlay(enabled);

  if (stableParts.length === 0 && transientParts.length === 0) return null;

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
      }}
    >
      <BadgeGroup parts={stableParts} showLeadingPlus={false} />
      {transientParts.length > 0 && (
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            opacity: transientOpacity,
            transition: "opacity 200ms ease",
          }}
        >
          <BadgeGroup parts={transientParts} showLeadingPlus={stableParts.length > 0} />
        </span>
      )}
    </div>
  );
}
