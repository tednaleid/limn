// ABOUTME: React hooks for binding Editor state to React components.
// ABOUTME: Uses useSyncExternalStore for efficient re-rendering on state changes.

import { createContext, useContext, useSyncExternalStore } from "react";
import type { Editor } from "@limn/core";

export const EditorContext = createContext<Editor | null>(null);

/** Get the Editor instance from context. Throws if not provided. */
export function useEditorInstance(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error("useEditorInstance must be used within EditorContext.Provider");
  return editor;
}

/**
 * Subscribe to Editor state changes and re-render when state changes.
 * Returns the Editor instance. Components using this hook will re-render
 * on any Editor state change.
 */
export function useEditor(): Editor {
  const editor = useEditorInstance();
  useSyncExternalStore(
    (cb) => editor.subscribe(cb),
    () => editor.getVersion(),
  );
  return editor;
}
