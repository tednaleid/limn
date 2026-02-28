// ABOUTME: Displays the current filename and a brief "Saved" indicator after saves.
// ABOUTME: Positioned at the top center of the viewport.

import { useEffect, useState } from "react";

interface FileStatusBarProps {
  filename: string | null;
  saveFlash: boolean;
  onSaveFlashDone: () => void;
}

export function FileStatusBar({ filename, saveFlash, onSaveFlashDone }: FileStatusBarProps) {
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!saveFlash) return;
    setShowSaved(true);
    const timer = setTimeout(() => {
      setShowSaved(false);
      onSaveFlashDone();
    }, 2000);
    return () => clearTimeout(timer);
  }, [saveFlash, onSaveFlashDone]);

  if (!filename && !showSaved) return null;

  return (
    <div style={containerStyle}>
      {filename && <span style={filenameStyle}>{filename}</span>}
      {showSaved && <span style={savedStyle}>Saved</span>}
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
