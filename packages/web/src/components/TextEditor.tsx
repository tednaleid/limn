// ABOUTME: Absolutely-positioned textarea overlay for editing node text.
// ABOUTME: Zoom-aware positioning; delegates key events to core dispatch.

import { useEffect, useRef, useCallback } from "react";
import { dispatch, ROOT_FONT_SIZE } from "@limn/core";
import type { Editor, MindMapNode, Camera } from "@limn/core";

const PADDING_X = 10;
const PADDING_Y = 6;
const FONT_SIZE = 14;
// The DomTextMeasurer adds a buffer to node.width for SVG text rendering.
// The textarea is DOM-based and doesn't need it, so we subtract it here.
const SVG_TEXT_BUFFER = 4;

interface TextEditorProps {
  editor: Editor;
  node: MindMapNode;
  camera: Camera;
  branchColor?: string;
}

export function TextEditor({ editor, node, camera, branchColor }: TextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Position the textarea at the node's screen location, then use CSS
  // transform: scale(zoom) to match how SVG scales text. This ensures
  // the textarea renders at the same base font size (14px) as the SVG
  // text, avoiding hinting differences between e.g. 14px and 24.78px.
  const left = node.x * camera.zoom + camera.x;
  const top = node.y * camera.zoom + camera.y;
  const width = node.width - SVG_TEXT_BUFFER;
  const height = node.height;

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
        transform: `scale(${camera.zoom})`,
        transformOrigin: "0 0",
        padding: `${PADDING_Y}px ${PADDING_X}px`,
        fontSize: `${node.parentId === null ? ROOT_FONT_SIZE : FONT_SIZE}px`,
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontWeight: node.parentId === null ? 600 : 400,
        lineHeight: `${Math.round((node.parentId === null ? ROOT_FONT_SIZE : FONT_SIZE) * (20 / 14))}px`,
        border: "none",
        borderRadius: `${6}px`,
        outline: "none",
        boxShadow: `0 0 0 ${2}px ${branchColor ?? "var(--editor-shadow)"}`,
        background: "var(--editor-bg)",
        color: branchColor ?? "var(--text-color)",
        resize: "none",
        overflow: "hidden",
        boxSizing: "border-box",
        zIndex: 10,
      }}
    />
  );
}
