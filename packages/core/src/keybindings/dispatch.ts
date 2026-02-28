// ABOUTME: Key-to-action dispatch table for keyboard shortcuts.
// ABOUTME: Shared by web input handler and TestEditor for consistent behavior.

import type { Editor } from "../editor/Editor";

export interface Modifiers {
  meta?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
}

interface KeyBinding {
  key: string;
  modifiers?: Modifiers;
  mode: "nav" | "edit" | "both";
  action: (editor: Editor) => void;
}

function modifiersMatch(
  required: Modifiers | undefined,
  actual: Modifiers,
): boolean {
  const req = required ?? {};
  return (
    (req.meta ?? false) === (actual.meta ?? false) &&
    (req.shift ?? false) === (actual.shift ?? false) &&
    (req.ctrl ?? false) === (actual.ctrl ?? false) &&
    (req.alt ?? false) === (actual.alt ?? false)
  );
}

const bindings: KeyBinding[] = [
  // --- Nav mode ---
  {
    key: "Tab",
    modifiers: { shift: true },
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (!sel) return;
      const node = editor.getNode(sel);
      if (node.parentId === null) {
        // Root node: add a child to the left
        editor.addChild(sel, "", -1);
      } else {
        editor.detachToRoot(sel);
      }
    },
  },
  {
    key: "Tab",
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (!sel) return;
      const node = editor.getNode(sel);
      if (node.parentId === null) {
        // Root node: always add child to the right
        editor.addChild(sel, "", 1);
      } else {
        editor.addChild(sel);
      }
    },
  },
  {
    key: "Enter",
    modifiers: { meta: true },
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (sel) editor.openLink(sel);
    },
  },
  {
    key: "Enter",
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (sel) {
        editor.enterEditMode();
      } else {
        editor.addRoot();
      }
    },
  },
  {
    key: "Enter",
    modifiers: { shift: true },
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (sel) editor.addSibling(sel);
    },
  },
  {
    key: "Escape",
    mode: "nav",
    action: (editor) => {
      editor.deselect();
    },
  },
  {
    key: "Backspace",
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (sel) editor.deleteNode(sel);
    },
  },
  {
    key: " ",
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (sel) editor.toggleCollapse(sel);
    },
  },
  // Shift+arrows: pan canvas
  {
    key: "ArrowUp",
    modifiers: { shift: true },
    mode: "nav",
    action: (editor) => {
      const vp = editor.getViewportSize();
      editor.panCamera(0, (vp.height || 600) * 0.1);
    },
  },
  {
    key: "ArrowDown",
    modifiers: { shift: true },
    mode: "nav",
    action: (editor) => {
      const vp = editor.getViewportSize();
      editor.panCamera(0, -(vp.height || 600) * 0.1);
    },
  },
  {
    key: "ArrowLeft",
    modifiers: { shift: true },
    mode: "nav",
    action: (editor) => {
      const vp = editor.getViewportSize();
      editor.panCamera((vp.width || 800) * 0.1, 0);
    },
  },
  {
    key: "ArrowRight",
    modifiers: { shift: true },
    mode: "nav",
    action: (editor) => {
      const vp = editor.getViewportSize();
      editor.panCamera(-(vp.width || 800) * 0.1, 0);
    },
  },
  {
    key: "ArrowUp",
    mode: "nav",
    action: (editor) => {
      editor.navigateUp();
    },
  },
  {
    key: "ArrowDown",
    mode: "nav",
    action: (editor) => {
      editor.navigateDown();
    },
  },
  {
    key: "ArrowLeft",
    mode: "nav",
    action: (editor) => {
      editor.navigateLeft();
    },
  },
  {
    key: "ArrowRight",
    mode: "nav",
    action: (editor) => {
      editor.navigateRight();
    },
  },
  {
    key: "ArrowUp",
    modifiers: { alt: true },
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (sel) editor.moveNode(sel, "up");
    },
  },
  {
    key: "ArrowDown",
    modifiers: { alt: true },
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (sel) editor.moveNode(sel, "down");
    },
  },
  {
    key: "ArrowLeft",
    modifiers: { alt: true },
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (sel) editor.moveNode(sel, "left");
    },
  },
  {
    key: "ArrowRight",
    modifiers: { alt: true },
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (sel) editor.moveNode(sel, "right");
    },
  },
  // EasyMotion trigger
  {
    key: ";",
    mode: "nav",
    action: (editor) => {
      editor.enterEasyMotionMode();
    },
  },
  // Vim-style hjkl navigation (mirrors arrow keys)
  {
    key: "h",
    mode: "nav",
    action: (editor) => {
      editor.navigateLeft();
    },
  },
  {
    key: "j",
    mode: "nav",
    action: (editor) => {
      editor.navigateDown();
    },
  },
  {
    key: "k",
    mode: "nav",
    action: (editor) => {
      editor.navigateUp();
    },
  },
  {
    key: "l",
    mode: "nav",
    action: (editor) => {
      editor.navigateRight();
    },
  },
  {
    key: "h",
    modifiers: { shift: true },
    mode: "nav",
    action: (editor) => {
      const vp = editor.getViewportSize();
      editor.panCamera((vp.width || 800) * 0.1, 0);
    },
  },
  {
    key: "j",
    modifiers: { shift: true },
    mode: "nav",
    action: (editor) => {
      const vp = editor.getViewportSize();
      editor.panCamera(0, -(vp.height || 600) * 0.1);
    },
  },
  {
    key: "k",
    modifiers: { shift: true },
    mode: "nav",
    action: (editor) => {
      const vp = editor.getViewportSize();
      editor.panCamera(0, (vp.height || 600) * 0.1);
    },
  },
  {
    key: "l",
    modifiers: { shift: true },
    mode: "nav",
    action: (editor) => {
      const vp = editor.getViewportSize();
      editor.panCamera(-(vp.width || 800) * 0.1, 0);
    },
  },
  {
    key: "k",
    modifiers: { alt: true },
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (sel) editor.moveNode(sel, "up");
    },
  },
  {
    key: "j",
    modifiers: { alt: true },
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (sel) editor.moveNode(sel, "down");
    },
  },
  {
    key: "h",
    modifiers: { alt: true },
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (sel) editor.moveNode(sel, "left");
    },
  },
  {
    key: "l",
    modifiers: { alt: true },
    mode: "nav",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (sel) editor.moveNode(sel, "right");
    },
  },

  // --- Edit mode ---
  {
    key: "Escape",
    mode: "edit",
    action: (editor) => {
      editor.exitEditMode();
    },
  },
  {
    key: "Enter",
    mode: "edit",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (!sel) return;
      const node = editor.getNode(sel);
      editor.exitEditMode();
      // If the node was deleted (empty text), don't try to add a sibling
      if (editor.getSelectedId() !== sel) return;
      if (node.parentId === null) {
        // Root node: just exit edit mode, no sibling
        return;
      }
      editor.addSibling(sel);
    },
  },
  {
    key: "Tab",
    mode: "edit",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (!sel) return;
      const node = editor.getNode(sel);
      editor.exitEditMode();
      // If the node was deleted (empty text), don't try to add a child
      if (editor.getSelectedId() !== sel) return;
      if (node.parentId === null) {
        // Root node: always add child to the right
        editor.addChild(sel, "", 1);
      } else {
        editor.addChild(sel);
      }
    },
  },

  // --- Both modes ---
  {
    key: "z",
    modifiers: { meta: true },
    mode: "both",
    action: (editor) => {
      editor.undo();
    },
  },
  {
    key: "z",
    modifiers: { meta: true, shift: true },
    mode: "both",
    action: (editor) => {
      editor.redo();
    },
  },
  {
    key: "s",
    modifiers: { meta: true },
    mode: "both",
    action: (editor) => {
      editor.requestSave();
    },
  },
  {
    key: "o",
    modifiers: { meta: true },
    mode: "both",
    action: (editor) => {
      editor.requestOpen();
    },
  },
  {
    key: "e",
    modifiers: { meta: true, shift: true },
    mode: "both",
    action: (editor) => {
      editor.requestExport();
    },
  },
  {
    key: "=",
    modifiers: { meta: true },
    mode: "both",
    action: (editor) => {
      editor.zoomIn();
    },
  },
  {
    key: "-",
    modifiers: { meta: true },
    mode: "both",
    action: (editor) => {
      editor.zoomOut();
    },
  },
  {
    key: "0",
    modifiers: { meta: true },
    mode: "both",
    action: (editor) => {
      const vp = editor.getViewportSize();
      editor.zoomToFit(vp.width || 800, vp.height || 600);
    },
  },
  {
    key: "1",
    modifiers: { meta: true },
    mode: "both",
    action: (editor) => {
      const sel = editor.getSelectedId();
      if (sel) {
        const vp = editor.getViewportSize();
        editor.zoomToNode(sel, vp.width || 800, vp.height || 600);
      }
    },
  },
];

/**
 * Dispatch a key event to the appropriate Editor action.
 * Returns true if the key was handled, false otherwise.
 */
export function dispatch(
  editor: Editor,
  key: string,
  modifiers: Modifiers = {},
): boolean {
  const mode = editor.isEditing() ? "edit" : "nav";
  // Normalize single-character keys to lowercase so bindings stay consistent
  // (browser sends uppercase when Shift is held, e.g., "H" for Shift+h)
  const normalizedKey = key.length === 1 ? key.toLowerCase() : key;
  const hasModifiers = modifiers.meta || modifiers.ctrl || modifiers.alt;

  // EasyMotion mode intercepts unmodified single-char keys and Escape
  if (editor.isEasyMotionActive() && !hasModifiers) {
    if (normalizedKey === "Escape") {
      editor.exitEasyMotionMode();
      return true;
    }
    if (normalizedKey.length === 1 && !modifiers.shift) {
      editor.handleEasyMotionKey(normalizedKey);
      return true;
    }
  }

  for (const binding of bindings) {
    if (binding.key !== normalizedKey) continue;
    if (binding.mode !== mode && binding.mode !== "both") continue;
    if (!modifiersMatch(binding.modifiers, modifiers)) continue;

    binding.action(editor);
    return true;
  }

  return false;
}
