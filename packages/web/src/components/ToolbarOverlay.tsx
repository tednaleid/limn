// ABOUTME: Fixed toolbar overlay in the lower-left corner with zoom and undo/redo controls.
// ABOUTME: Styled to match HamburgerMenu chrome; subscribes to Editor for live state updates.

import { useState, useEffect } from "react";
import { useEditor } from "../hooks/useEditor";

export function ToolbarOverlay() {
  const editor = useEditor();
  const [, forceRender] = useState(0);

  useEffect(() => editor.subscribe(() => forceRender((n) => n + 1)), [editor]);

  const camera = editor.getCamera();
  const zoomPercent = Math.round(camera.zoom * 100);
  const canUndo = editor.canUndo();
  const canRedo = editor.canRedo();

  const handleZoomOut = () => editor.zoomOut();
  const handleZoomIn = () => editor.zoomIn();
  const handleResetZoom = () => {
    const cam = editor.getCamera();
    editor.setCamera(cam.x, cam.y, 1);
  };
  const handleUndo = () => { if (canUndo) editor.undo(); };
  const handleRedo = () => { if (canRedo) editor.redo(); };

  return (
    <div style={{ position: "fixed", bottom: 12, left: 12, zIndex: 1000, display: "flex", gap: 8 }}>
      {/* Zoom controls */}
      <div style={groupStyle}>
        <ToolbarButton onClick={handleZoomOut} label="Zoom out">
          <MinusIcon />
        </ToolbarButton>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleResetZoom}
          style={{
            ...buttonBaseStyle,
            width: "auto",
            padding: "0 4px",
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
            color: "var(--text-muted)",
            minWidth: 42,
          }}
          title="Reset zoom to 100%"
        >
          {zoomPercent}%
        </button>
        <ToolbarButton onClick={handleZoomIn} label="Zoom in">
          <PlusIcon />
        </ToolbarButton>
      </div>

      {/* Undo/redo controls */}
      <div style={groupStyle}>
        <ToolbarButton onClick={handleUndo} label="Undo" disabled={!canUndo}>
          <UndoIcon />
        </ToolbarButton>
        <ToolbarButton onClick={handleRedo} label="Redo" disabled={!canRedo}>
          <RedoIcon />
        </ToolbarButton>
      </div>
    </div>
  );
}

const groupStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  background: "var(--editor-bg)",
  border: "1px solid var(--collapse-border)",
  borderRadius: 8,
  padding: 2,
  gap: 2,
};

const buttonBaseStyle: React.CSSProperties = {
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
};

function ToolbarButton({ onClick, label, disabled, children }: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className="toolbar-btn"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        ...buttonBaseStyle,
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

// --- Inline SVG icons ---

function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="4" y1="8" x2="12" y2="8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="8" y1="4" x2="8" y2="12" />
      <line x1="4" y1="8" x2="12" y2="8" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h6a3 3 0 0 1 0 6H8" />
      <polyline points="6,3 4,6 6,9" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6H6a3 3 0 0 0 0 6h2" />
      <polyline points="10,3 12,6 10,9" />
    </svg>
  );
}
