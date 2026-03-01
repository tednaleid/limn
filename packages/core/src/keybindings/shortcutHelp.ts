// ABOUTME: Static shortcut data for the help dialog.
// ABOUTME: Defines all keyboard and mouse shortcuts grouped by category.

export interface ShortcutEntry {
  keys: string[];        // each element = one kbd box, e.g. ["Cmd", "Z"]
  description: string;
  altKeys?: string[];    // vim alternates shown in parens, e.g. ["h/j/k/l"]
}

export interface ShortcutGroup {
  title: string;
  type: "keyboard" | "mouse";  // mouse entries render as plain text, not kbd boxes
  entries: ShortcutEntry[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    type: "keyboard",
    entries: [
      { keys: ["Arrows"], description: "Navigate between nodes", altKeys: ["h/j/k/l"] },
      { keys: ["Tab"], description: "Create child node" },
      { keys: ["Enter"], description: "Edit selected node (or create root)" },
      { keys: ["Shift", "Enter"], description: "Create sibling node" },
      { keys: ["Cmd", "Enter"], description: "Open link in selected node" },
      { keys: ["Backspace"], description: "Delete node" },
      { keys: ["Space"], description: "Toggle collapse" },
      { keys: [";"], description: "EasyMotion jump" },
      { keys: ["Alt", "Up/Down"], description: "Reorder among siblings", altKeys: ["Alt+k/j"] },
      { keys: ["Alt", "Left/Right"], description: "Indent / Outdent", altKeys: ["Alt+h/l"] },
      { keys: ["Shift", "Tab"], description: "Detach node to root" },
      { keys: ["Escape"], description: "Deselect" },
    ],
  },
  {
    title: "Editing",
    type: "keyboard",
    entries: [
      { keys: ["Enter"], description: "Exit edit, create sibling" },
      { keys: ["Tab"], description: "Exit edit, create child" },
      { keys: ["Shift", "Enter"], description: "Insert newline" },
      { keys: ["Escape"], description: "Exit edit mode" },
    ],
  },
  {
    title: "Global",
    type: "keyboard",
    entries: [
      { keys: ["Cmd", "Z"], description: "Undo" },
      { keys: ["Cmd", "Shift", "Z"], description: "Redo" },
      { keys: ["Cmd", "S"], description: "Save" },
      { keys: ["Cmd", "Shift", "S"], description: "Save As" },
      { keys: ["Cmd", "O"], description: "Open file" },
      { keys: ["Cmd", "Shift", "E"], description: "Export SVG" },
      { keys: ["Cmd", "="], description: "Zoom in" },
      { keys: ["Cmd", "-"], description: "Zoom out" },
      { keys: ["Cmd", "0"], description: "Zoom to fit" },
      { keys: ["Cmd", "1"], description: "Zoom to selected node" },
      { keys: ["Shift", "Arrows"], description: "Pan canvas", altKeys: ["Shift+h/j/k/l"] },
    ],
  },
  {
    title: "Mouse",
    type: "mouse",
    entries: [
      { keys: ["Click node"], description: "Select node" },
      { keys: ["Double-click node"], description: "Enter edit mode" },
      { keys: ["Double-click canvas"], description: "Create root node" },
      { keys: ["Cmd", "Click link"], description: "Open link in new tab" },
      { keys: ["Drag node"], description: "Move node (reparent on drop)" },
    ],
  },
];
