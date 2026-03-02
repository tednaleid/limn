// ABOUTME: Displays the current filename and a brief flash message (e.g. "Saved") after actions.
// ABOUTME: Positioned at the top center of the viewport.

import { useEffect, useState } from "react";

export interface FlashMessage {
  message: string;
  isError?: boolean;
}

interface FileStatusBarProps {
  filename: string | null;
  flash: FlashMessage | null;
  onFlashDone: () => void;
}

export function FileStatusBar({ filename, flash, onFlashDone }: FileStatusBarProps) {
  const [visible, setVisible] = useState<FlashMessage | null>(null);

  useEffect(() => {
    if (!flash) return;
    setVisible(flash);
    const timer = setTimeout(() => {
      setVisible(null);
      onFlashDone();
    }, 2000);
    return () => clearTimeout(timer);
  }, [flash, onFlashDone]);

  if (!filename && !visible) return null;

  return (
    <div style={containerStyle}>
      {filename && <span style={filenameStyle}>{filename}</span>}
      {visible && <span style={visible.isError ? errorStyle : savedStyle}>{visible.message}</span>}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: "fixed",
  top: 12,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "var(--editor-bg)",
  borderRadius: 8,
  padding: "4px 12px",
  fontSize: 13,
  color: "var(--text-muted)",
  pointerEvents: "none",
  userSelect: "none",
};

const filenameStyle: React.CSSProperties = {
  maxWidth: 300,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const savedStyle: React.CSSProperties = {
  color: "var(--selection-border)",
  fontSize: 12,
  fontWeight: 500,
};

const errorStyle: React.CSSProperties = {
  color: "#e53e3e",
  fontSize: 12,
  fontWeight: 500,
};
