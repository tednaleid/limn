// ABOUTME: Core Editor class wrapping MindMapStore with selection, modes, and undo.
// ABOUTME: All state mutations flow through Editor; it is the sole source of truth.

import type { MindMapNode, TextMeasurer, MindMapMeta } from "../model/types";
import { MindMapStore } from "../store/MindMapStore";
import { deserialize, serialize } from "../serialization/serialization";
import type { MindMapFileFormat } from "../serialization/schema";

/** Snapshot of document state for undo/redo. */
interface HistoryEntry {
  label: string;
  nodes: Map<string, MindMapNode>;
  rootIds: string[];
}

/** Stub text measurer that estimates from character count. */
export const stubTextMeasurer: TextMeasurer = {
  measure(text: string) {
    const lines = text.split("\n");
    const maxLineLen = Math.max(...lines.map((l) => l.length), 0);
    return { width: Math.max(maxLineLen * 8 + 16, 100), height: lines.length * 20 + 12 };
  },
  reflow(text: string, maxWidth: number) {
    const charWidth = 8;
    const charsPerLine = Math.floor((maxWidth - 16) / charWidth);
    const lines = text.split("\n");
    let totalLines = 0;
    for (const line of lines) {
      totalLines += Math.max(1, Math.ceil(line.length / charsPerLine));
    }
    return { width: maxWidth, height: totalLines * 20 + 12 };
  },
};

export class Editor {
  protected store: MindMapStore;
  protected textMeasurer: TextMeasurer;

  // Session state (not tracked by undo)
  private selectedId: string | null = null;
  private editing = false;

  // Document metadata
  protected meta: MindMapMeta = { id: "default", version: 1, theme: "default" };

  // Undo/redo
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  constructor(textMeasurer: TextMeasurer = stubTextMeasurer) {
    this.store = new MindMapStore();
    this.textMeasurer = textMeasurer;
  }

  // --- State access ---

  getNode(id: string): MindMapNode {
    return this.store.getNode(id);
  }

  getChildren(id: string): MindMapNode[] {
    return this.store.getChildren(id);
  }

  getParent(id: string): MindMapNode | null {
    return this.store.getParent(id);
  }

  getRoots(): MindMapNode[] {
    return this.store.getRoots();
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  isCollapsed(id: string): boolean {
    return this.store.getNode(id).collapsed;
  }

  getVisibleNodes(): MindMapNode[] {
    return this.store.getVisibleNodes();
  }

  isEditing(): boolean {
    return this.editing;
  }

  get nodeCount(): number {
    return this.store.nodeCount;
  }

  // --- Selection ---

  select(nodeId: string): void {
    this.store.getNode(nodeId); // Validate exists
    this.selectedId = nodeId;
  }

  deselect(): void {
    this.selectedId = null;
    this.editing = false;
  }

  // --- Edit mode ---

  enterEditMode(): void {
    if (this.selectedId === null) return;
    this.editing = true;
  }

  exitEditMode(): void {
    if (!this.editing) return;
    this.editing = false;

    // Empty node cleanup: if the node has empty text, delete it
    if (this.selectedId !== null) {
      const node = this.store.getNode(this.selectedId);
      if (node.text === "") {
        const nodeToDelete = this.selectedId;
        this.selectFallbackAfterDelete(nodeToDelete);
        this.store.deleteNode(nodeToDelete);
      }
    }
  }

  // --- Mutations (all tracked for undo) ---

  addRoot(text = "", x = 0, y = 0): string {
    this.pushUndo("add-root");
    const id = this.store.addRoot(text, x, y);
    this.selectedId = id;
    this.editing = true;
    return id;
  }

  addChild(parentId: string, text = ""): string {
    this.pushUndo("add-child");
    const id = this.store.addChild(parentId, text);
    this.positionNewChild(id, parentId);
    this.selectedId = id;
    this.editing = true;
    return id;
  }

  addSibling(nodeId: string, text = ""): string | null {
    const node = this.store.getNode(nodeId);
    if (node.parentId === null) return null; // No-op on roots
    this.pushUndo("add-sibling");
    const parentId = node.parentId;
    const siblings = this.store.getNode(parentId).children;
    const index = siblings.indexOf(nodeId) + 1;
    const id = this.store.insertChild(parentId, index, text);
    this.positionNewSibling(id, nodeId);
    this.selectedId = id;
    this.editing = true;
    return id;
  }

  deleteNode(nodeId: string): void {
    this.pushUndo("delete-node");
    this.selectFallbackAfterDelete(nodeId);
    this.store.deleteNode(nodeId);
  }

  setText(nodeId: string, text: string): void {
    this.pushUndo("set-text");
    this.store.setText(nodeId, text);
  }

  toggleCollapse(nodeId: string): void {
    this.pushUndo("toggle-collapse");
    this.store.toggleCollapse(nodeId);
  }

  reorderNode(nodeId: string, direction: "up" | "down"): void {
    this.pushUndo("reorder-node");
    this.store.reorderNode(nodeId, direction);
  }

  setNodePosition(nodeId: string, x: number, y: number): void {
    this.pushUndo("set-position");
    this.store.setNodePosition(nodeId, x, y);
  }

  // --- Undo/redo ---

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push(this.captureState("redo"));
    this.restoreState(entry);
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push(this.captureState("undo"));
    this.restoreState(entry);
  }

  // --- Serialization ---

  loadJSON(data: MindMapFileFormat): void {
    this.store = deserialize(data);
    this.meta = { ...data.meta, version: data.version };
    this.selectedId = null;
    this.editing = false;
    this.undoStack = [];
    this.redoStack = [];
  }

  toJSON(): MindMapFileFormat {
    return serialize(this.store, this.meta);
  }

  // --- Private helpers ---

  private pushUndo(label: string): void {
    this.undoStack.push(this.captureState(label));
    this.redoStack = []; // Clear redo on new mutation
  }

  private captureState(label: string): HistoryEntry {
    const nodes = new Map<string, MindMapNode>();
    for (const node of this.store.getAllNodes()) {
      nodes.set(node.id, { ...node, children: [...node.children] });
    }
    return {
      label,
      nodes,
      rootIds: [...this.store.getRoots().map((n) => n.id)],
    };
  }

  private restoreState(entry: HistoryEntry): void {
    const newStore = new MindMapStore();
    for (const node of entry.nodes.values()) {
      newStore.loadNode({ ...node, children: [...node.children] });
    }
    for (const rootId of entry.rootIds) {
      newStore.addRootId(rootId);
    }
    this.store = newStore;

    // Fix selection if selected node no longer exists
    if (this.selectedId !== null && !entry.nodes.has(this.selectedId)) {
      this.selectedId = null;
      this.editing = false;
    }
  }

  private selectFallbackAfterDelete(nodeId: string): void {
    if (this.selectedId !== nodeId) return;

    const node = this.store.getNode(nodeId);
    if (node.parentId !== null) {
      const siblings = this.store.getNode(node.parentId).children;
      const idx = siblings.indexOf(nodeId);
      if (siblings.length > 1) {
        // Previous sibling, or next if first
        const fallbackIdx = idx > 0 ? idx - 1 : 1;
        this.selectedId = siblings[fallbackIdx] ?? node.parentId;
      } else {
        this.selectedId = node.parentId;
      }
    } else {
      // Root node: select nearest remaining root by position
      const roots = this.store.getRoots();
      const otherRoots = roots.filter((r) => r.id !== nodeId);
      if (otherRoots.length > 0) {
        otherRoots.sort(
          (a, b) =>
            Math.abs(a.x - node.x) +
            Math.abs(a.y - node.y) -
            (Math.abs(b.x - node.x) + Math.abs(b.y - node.y)),
        );
        this.selectedId = otherRoots[0].id;
      } else {
        this.selectedId = null;
      }
    }
    this.editing = false;
  }

  /** Simple heuristic: position child to the right of parent */
  private positionNewChild(childId: string, parentId: string): void {
    const parent = this.store.getNode(parentId);
    const siblings = this.store.getChildren(parentId);
    const childIndex = siblings.findIndex((s) => s.id === childId);
    const gap = 52; // height + padding

    if (siblings.length === 1) {
      // Only child: same y as parent
      this.store.setNodePosition(childId, parent.x + 250, parent.y);
    } else {
      // Stack below last sibling
      const prevSibling = siblings[childIndex - 1];
      if (prevSibling) {
        this.store.setNodePosition(
          childId,
          prevSibling.x,
          prevSibling.y + gap,
        );
      } else {
        this.store.setNodePosition(childId, parent.x + 250, parent.y);
      }
    }
  }

  /** Simple heuristic: position sibling below the reference node */
  private positionNewSibling(siblingId: string, referenceId: string): void {
    const ref = this.store.getNode(referenceId);
    const gap = 52;
    this.store.setNodePosition(siblingId, ref.x, ref.y + gap);
  }
}
