// ABOUTME: Absolutely-positioned textarea overlay for editing node text.
// ABOUTME: Zoom-aware positioning; delegates key events to core dispatch.

import { useEffect, useRef, useCallback } from "react";
import { dispatch, ROOT_FONT_SIZE } from "@limn/core";
import type { Editor, MindMapNode, Camera } from "@limn/core";

const PADDING_X = 10;
const PADDING_Y = 6;
const FONT_SIZE = 14;

interface TextEditorProps {
  editor: Editor;
  node: MindMapNode;
  camera: Camera;
}

export function TextEditor({ editor, node, camera }: TextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Position the textarea to overlay the node, accounting for camera transform
  const left = node.x * camera.zoom + camera.x;
  const top = node.y * camera.zoom + camera.y;
  const width = node.width * camera.zoom;
  const height = node.height * camera.zoom;

  // Focus the textarea on mount
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      // Place cursor at end of text
      el.selectionStart = el.value.length;
      el.selectionEnd = el.value.length;
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Shift+Enter: insert newline (let browser handle it)
      if (e.key === "Enter" && e.shiftKey) {
        return;
      }

      // Keys handled by dispatch: Enter, Tab, Escape
      if (e.key === "Enter" || e.key === "Tab" || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        dispatch(editor, e.key, {
          meta: e.metaKey,
          shift: e.shiftKey,
          ctrl: e.ctrlKey,
          alt: e.altKey,
        });
        return;
      }

      // Cmd+Z / Cmd+Shift+Z for undo/redo
      if (e.key === "z" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        dispatch(editor, e.key, {
          meta: e.metaKey,
          shift: e.shiftKey,
          ctrl: e.ctrlKey,
          alt: e.altKey,
        });
        return;
      }
    },
    [editor],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      editor.setText(node.id, e.target.value);
    },
    [editor, node.id],
  );

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      data-limn-edit="true"
      value={node.text}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      style={{
        position: "absolute",
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        minHeight: `${height}px`,
        padding: `${PADDING_Y * camera.zoom}px ${PADDING_X * camera.zoom}px`,
        fontSize: `${(node.parentId === null ? ROOT_FONT_SIZE : FONT_SIZE) * camera.zoom}px`,
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontWeight: node.parentId === null ? 600 : 400,
        lineHeight: `${Math.round((node.parentId === null ? ROOT_FONT_SIZE : FONT_SIZE) * (20 / 14)) * camera.zoom}px`,
        border: "none",
        borderRadius: `${6 * camera.zoom}px`,
        outline: "none",
        boxShadow: `0 0 0 ${2 * camera.zoom}px var(--editor-shadow)`,
        background: "var(--editor-bg)",
        color: "var(--text-color)",
        resize: "none",
        overflow: "hidden",
        boxSizing: "border-box",
        zIndex: 10,
      }}
    />
  );
}
