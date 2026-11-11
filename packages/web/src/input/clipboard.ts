// ABOUTME: Copy, cut, and paste for a mind map: subtrees travel as Markdown bullet lists, images attach.
// ABOUTME: One handler for the web app and the Obsidian views, driven by the DOM clipboard events.

import { useEffect } from "react";
import type { Editor, PersistenceProvider } from "@limn/core";
import { attachImageFile, imageFileFromTransfer, pastedImageName } from "../assets/attachImage";
import { isForeignInput } from "./foreignInput";

export type ClipboardKind = "copy" | "cut" | "paste";

export interface ClipboardContext {
  editor: Editor;
  provider: PersistenceProvider;
  /** True when the page has a non-empty text selection, which copy and cut leave to the browser. */
  hasTextSelection: () => boolean;
  /** Returns false when the view is not the active one; all handling is then skipped. */
  isActive?: () => boolean;
}

export function handleClipboardEvent(kind: ClipboardKind, e: ClipboardEvent, ctx: ClipboardContext): void {
  const { editor } = ctx;
  if (ctx.isActive && !ctx.isActive()) return;

  if (kind === "paste") {
    // Image paste attaches even while a node is being edited or another input has focus.
    const file = imageFileFromTransfer(e.clipboardData);
    if (file) {
      e.preventDefault();
      const selectedId = editor.getSelectedId();
      attachImageFile(
        editor, ctx.provider, file, pastedImageName(file.type, new Date()),
        selectedId ? { nodeId: selectedId } : { x: 0, y: 0 },
      ).catch((err: unknown) => { console.error("Failed to attach image:", err); });
      return;
    }
  }

  if (editor.isEditing() || isForeignInput(e.target)) return;

  if (kind === "paste") {
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (text.trim() === "") return;
    e.preventDefault();
    editor.pasteMarkdown(text);
    return;
  }

  const selectedId = editor.getSelectedId();
  if (selectedId === null || ctx.hasTextSelection() || !e.clipboardData) return;
  e.clipboardData.setData("text/plain", editor.copyMarkdown(selectedId));
  e.preventDefault();
  if (kind === "cut") editor.deleteNode(selectedId);
}

/** Routes the document's copy, cut, and paste events to {@link handleClipboardEvent}. */
export function useClipboard(
  editor: Editor,
  provider: PersistenceProvider,
  doc: Document,
  isActive?: () => boolean,
): void {
  useEffect(() => {
    const ctx: ClipboardContext = {
      editor,
      provider,
      isActive,
      hasTextSelection: () => (doc.getSelection()?.toString() ?? "") !== "",
    };
    const kinds: ClipboardKind[] = ["copy", "cut", "paste"];
    const removers = kinds.map((kind) => {
      const listener = (e: ClipboardEvent) => handleClipboardEvent(kind, e, ctx);
      doc.addEventListener(kind, listener);
      return () => doc.removeEventListener(kind, listener);
    });
    return () => { for (const remove of removers) remove(); };
  }, [editor, provider, doc, isActive]);
}
