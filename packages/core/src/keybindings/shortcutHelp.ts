// ABOUTME: Static shortcut data for the help dialog.
// ABOUTME: Defines all keyboard and mouse shortcuts grouped by category.

export interface ShortcutEntry {
  keys: string[];        // each element = one kbd box, e.g. ["Cmd", "Z"]
  description: string;
  altKeys?: string[];    // alternate keys shown as "or" in keys column, e.g. ["h"]
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
      { keys: ["\u2190"], description: "Navigate left", altKeys: ["h"] },
      { keys: ["\u2192"], description: "Navigate right", altKeys: ["l"] },
      { keys: ["\u2191"], description: "Navigate up", altKeys: ["k"] },
      { keys: ["\u2193"], description: "Navigate down", altKeys: ["j"] },
      { keys: [";"], description: "EasyMotion jump" },
      { keys: ["Cmd", "Enter"], description: "Open link in selected node" },
      { keys: ["Escape"], description: "Deselect" },
    ],
  },
  {
    title: "Node Operations",
    type: "keyboard",
    entries: [
      { keys: ["Tab"], description: "Create child node" },
      { keys: ["Enter"], description: "Edit selected node (or create root)" },
      { keys: ["Shift", "Enter"], description: "Create sibling node" },
      { keys: ["Backspace"], description: "Delete node" },
      { keys: ["Space"], description: "Toggle collapse" },
    ],
  },
  {
    title: "Structure",
    type: "keyboard",
    entries: [
      { keys: ["Alt", "\u2191"], description: "Reorder up", altKeys: ["k"] },
      { keys: ["Alt", "\u2193"], description: "Reorder down", altKeys: ["j"] },
      { keys: ["Alt", "\u2190"], description: "Outdent", altKeys: ["h"] },
      { keys: ["Alt", "\u2192"], description: "Indent", altKeys: ["l"] },
      { keys: ["Shift", "Tab"], description: "Detach node to root" },
      { keys: ["Alt", ";"], description: "Reparent to target (EasyMotion)" },
    ],
  },
  {
    title: "Positioning",
    type: "keyboard",
    entries: [
      { keys: ["Ctrl", "\u2190"], description: "Nudge node", altKeys: ["h"] },
      { keys: ["Ctrl", "\u2192"], description: "Nudge node", altKeys: ["l"] },
      { keys: ["Ctrl", "\u2191"], description: "Nudge node", altKeys: ["k"] },
      { keys: ["Ctrl", "\u2193"], description: "Nudge node", altKeys: ["j"] },
      { keys: ["Ctrl", "Alt", "\u2190"], description: "Nudge node (fine)", altKeys: ["h"] },
      { keys: ["Ctrl", "Alt", "\u2192"], description: "Nudge node (fine)", altKeys: ["l"] },
      { keys: ["Ctrl", "Alt", "\u2191"], description: "Nudge node (fine)", altKeys: ["k"] },
      { keys: ["Ctrl", "Alt", "\u2193"], description: "Nudge node (fine)", altKeys: ["j"] },
      { keys: ["r"], description: "Reflow children to computed layout" },
    ],
  },
  {
    title: "Text Editing",
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
      { keys: ["Shift", "\u2190"], description: "Pan left", altKeys: ["h"] },
      { keys: ["Shift", "\u2192"], description: "Pan right", altKeys: ["l"] },
      { keys: ["Shift", "\u2191"], description: "Pan up", altKeys: ["k"] },
      { keys: ["Shift", "\u2193"], description: "Pan down", altKeys: ["j"] },
      { keys: ["Shift", "Alt", "\u2190"], description: "Pan left (fine)", altKeys: ["h"] },
      { keys: ["Shift", "Alt", "\u2192"], description: "Pan right (fine)", altKeys: ["l"] },
      { keys: ["Shift", "Alt", "\u2191"], description: "Pan up (fine)", altKeys: ["k"] },
      { keys: ["Shift", "Alt", "\u2193"], description: "Pan down (fine)", altKeys: ["j"] },
      { keys: ["Ctrl", "Shift", "K"], description: "Toggle keystroke overlay" },
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
