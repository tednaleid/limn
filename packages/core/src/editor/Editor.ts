// ABOUTME: Core Editor class wrapping MindMapStore with selection, modes, and undo.
// ABOUTME: All state mutations flow through Editor; it is the sole source of truth.

import type { MindMapNode, TextMeasurer, MindMapMeta, Camera, Asset } from "../model/types";
import { MindMapStore } from "../store/MindMapStore";
import { deserialize, serialize } from "../serialization/serialization";
import type { MindMapFileFormat } from "../serialization/schema";
import {
  branchDirection,
  positionNewChild,
  positionNewSibling,
  relayoutAfterDelete,
  relayoutFromNode,
  resolveTreeOverlap,
} from "../layout/layout";

/** Snapshot of document state for undo/redo. */
interface HistoryEntry {
  label: string;
  nodes: Map<string, MindMapNode>;
  rootIds: string[];
  assets: Asset[];
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
  private camera: Camera = { x: 0, y: 0, zoom: 1 };

  // Drag state
  private dragging = false;
  private dragNodeId: string | null = null;
  private dragOffset = { x: 0, y: 0 };
  private dragMoved = false;
  private reparentTargetId: string | null = null;

  // Document metadata
  protected meta: MindMapMeta = { id: "default", version: 1, theme: "default" };

  // Asset registry (document state)
  private assets: Asset[] = [];

  // External action callbacks (set by web layer)
  private saveCallback: (() => void) | null = null;
  private openCallback: (() => void) | null = null;
  private exportCallback: (() => void) | null = null;

  // Undo/redo
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  // Change notification for reactive UI (useSyncExternalStore)
  private version = 0;
  private listeners: Set<() => void> = new Set();

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

  /** Get the depth of a node (0 = root, 1 = child of root, etc.). */
  getNodeDepth(id: string): number {
    let depth = 0;
    let node = this.store.getNode(id);
    while (node.parentId !== null) {
      depth++;
      node = this.store.getNode(node.parentId);
    }
    return depth;
  }

  /** Check if a node has visible children (not collapsed and has children). */
  hasVisibleChildren(id: string): boolean {
    const node = this.store.getNode(id);
    return node.children.length > 0 && !node.collapsed;
  }

  isEditing(): boolean {
    return this.editing;
  }

  get nodeCount(): number {
    return this.store.nodeCount;
  }

  getCamera(): Camera {
    return this.camera;
  }

  setCamera(x: number, y: number, zoom: number): void {
    this.camera = { x, y, zoom };
    this.notify();
  }

  // --- External action callbacks ---

  /** Register a callback for save requests (Cmd+S). */
  onSave(cb: () => void): void {
    this.saveCallback = cb;
  }

  /** Register a callback for open requests (Cmd+O). */
  onOpen(cb: () => void): void {
    this.openCallback = cb;
  }

  /** Request a save operation (called by dispatch on Cmd+S). */
  requestSave(): void {
    this.saveCallback?.();
  }

  /** Request a file open operation (called by dispatch on Cmd+O). */
  requestOpen(): void {
    this.openCallback?.();
  }

  /** Register a callback for export requests (Shift+Cmd+E). */
  onExport(cb: () => void): void {
    this.exportCallback = cb;
  }

  /** Request an export operation (called by dispatch on Shift+Cmd+E). */
  requestExport(): void {
    this.exportCallback?.();
  }

  // --- Subscription (for useSyncExternalStore) ---

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Returns a version number that increments on every state change. */
  getVersion(): number {
    return this.version;
  }

  /** Notify all subscribers that state has changed. */
  protected notify(): void {
    this.version++;
    for (const listener of this.listeners) {
      listener();
    }
  }

  // --- Selection ---

  select(nodeId: string): void {
    this.store.getNode(nodeId); // Validate exists
    this.selectedId = nodeId;
    this.notify();
  }

  deselect(): void {
    this.selectedId = null;
    this.editing = false;
    this.notify();
  }

  // --- Edit mode ---

  enterEditMode(): void {
    if (this.selectedId === null) return;
    this.editing = true;
    this.notify();
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
    this.notify();
  }

  // --- Mutations (all tracked for undo) ---

  addRoot(text = "", x = 0, y = 0): string {
    this.pushUndo("add-root");
    const id = this.store.addRoot(text, x, y);
    this.selectedId = id;
    this.editing = true;
    this.notify();
    return id;
  }

  addChild(parentId: string, text = ""): string {
    this.pushUndo("add-child");
    const id = this.store.addChild(parentId, text);
    positionNewChild(this.store, id);
    this.resolveOverlapForNode(id);
    this.selectedId = id;
    this.editing = true;
    this.notify();
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
    positionNewSibling(this.store, id, nodeId);
    this.resolveOverlapForNode(id);
    this.selectedId = id;
    this.editing = true;
    this.notify();
    return id;
  }

  deleteNode(nodeId: string): void {
    this.pushUndo("delete-node");
    const node = this.store.getNode(nodeId);
    const parentId = node.parentId;
    this.selectFallbackAfterDelete(nodeId);
    this.store.deleteNode(nodeId);
    if (parentId !== null) {
      relayoutAfterDelete(this.store, parentId);
      this.resolveOverlapForNode(parentId);
    }
    this.notify();
  }

  setText(nodeId: string, text: string): void {
    this.pushUndo("set-text");
    this.store.setText(nodeId, text);
    this.notify();
  }

  toggleCollapse(nodeId: string): void {
    this.pushUndo("toggle-collapse");
    this.store.toggleCollapse(nodeId);
    relayoutFromNode(this.store, nodeId);
    this.resolveOverlapForNode(nodeId);
    this.notify();
  }

  reorderNode(nodeId: string, direction: "up" | "down"): void {
    this.pushUndo("reorder-node");
    this.store.reorderNode(nodeId, direction);
    this.notify();
  }

  setNodePosition(nodeId: string, x: number, y: number): void {
    this.pushUndo("set-position");
    this.store.setNodePosition(nodeId, x, y);
    this.notify();
  }

  // --- Image/asset management ---

  getAssets(): Asset[] {
    return this.assets;
  }

  setNodeImage(nodeId: string, asset: Asset, displayWidth: number, displayHeight: number): void {
    this.pushUndo("set-image");
    const node = this.store.getNode(nodeId);
    node.image = { assetId: asset.id, width: displayWidth, height: displayHeight };
    // Register asset if not already present
    if (!this.assets.some((a) => a.id === asset.id)) {
      this.assets.push({ ...asset });
    }
    this.notify();
  }

  removeNodeImage(nodeId: string): void {
    this.pushUndo("remove-image");
    const node = this.store.getNode(nodeId);
    delete node.image;
    this.notify();
  }

  // --- Spatial navigation ---

  navigateUp(): void {
    if (this.selectedId === null) return;
    const current = this.store.getNode(this.selectedId);
    const currentCenterY = current.y + current.height / 2;
    const visible = this.store.getVisibleNodes();

    let best: MindMapNode | null = null;
    let bestDist = Infinity;
    for (const node of visible) {
      if (node.id === this.selectedId) continue;
      const centerY = node.y + node.height / 2;
      if (centerY >= currentCenterY) continue; // Not above
      const dist = currentCenterY - centerY;
      if (dist < bestDist || (dist === bestDist && best !== null && node.x < best.x)) {
        best = node;
        bestDist = dist;
      }
    }

    if (best) {
      this.selectedId = best.id;
      this.notify();
    }
  }

  navigateDown(): void {
    if (this.selectedId === null) return;
    const current = this.store.getNode(this.selectedId);
    const currentCenterY = current.y + current.height / 2;
    const visible = this.store.getVisibleNodes();

    let best: MindMapNode | null = null;
    let bestDist = Infinity;
    for (const node of visible) {
      if (node.id === this.selectedId) continue;
      const centerY = node.y + node.height / 2;
      if (centerY <= currentCenterY) continue; // Not below
      const dist = centerY - currentCenterY;
      if (dist < bestDist || (dist === bestDist && best !== null && node.x < best.x)) {
        best = node;
        bestDist = dist;
      }
    }

    if (best) {
      this.selectedId = best.id;
      this.notify();
    }
  }

  navigateLeft(): void {
    if (this.selectedId === null) return;
    const current = this.store.getNode(this.selectedId);

    if (current.parentId === null) {
      // Root node: go to first left-side child
      const children = this.store.getChildren(this.selectedId);
      const leftChildren = children.filter((c) => c.x < current.x);
      if (leftChildren.length > 0) {
        if (current.collapsed) {
          this.toggleCollapse(this.selectedId);
        }
        this.selectedId = leftChildren[0].id;
        this.notify();
      }
      return;
    }

    // Non-root: direction depends on branch side
    const dir = branchDirection(this.store, this.selectedId);
    if (dir >= 0) {
      // Right-side branch: Left goes toward parent
      this.selectedId = current.parentId;
      this.notify();
    } else {
      // Left-side branch: Left goes toward children (deeper)
      const children = this.store.getChildren(this.selectedId);
      if (children.length > 0) {
        if (current.collapsed) {
          this.toggleCollapse(this.selectedId);
        }
        this.selectedId = children[0].id;
        this.notify();
      }
    }
  }

  navigateRight(): void {
    if (this.selectedId === null) return;
    const current = this.store.getNode(this.selectedId);

    if (current.parentId === null) {
      // Root node: go to first right-side child
      const children = this.store.getChildren(this.selectedId);
      const rightChildren = children.filter((c) => c.x >= current.x);
      if (rightChildren.length > 0) {
        if (current.collapsed) {
          this.toggleCollapse(this.selectedId);
        }
        this.selectedId = rightChildren[0].id;
        this.notify();
      }
      return;
    }

    // Non-root: direction depends on branch side
    const dir = branchDirection(this.store, this.selectedId);
    if (dir >= 0) {
      // Right-side branch: Right goes toward children (deeper)
      const children = this.store.getChildren(this.selectedId);
      if (children.length > 0) {
        if (current.collapsed) {
          this.toggleCollapse(this.selectedId);
        }
        this.selectedId = children[0].id;
        this.notify();
      }
    } else {
      // Left-side branch: Right goes toward parent
      this.selectedId = current.parentId;
      this.notify();
    }
  }

  // --- Drag ---

  isDragging(): boolean {
    return this.dragging;
  }

  getReparentTarget(): string | null {
    return this.reparentTargetId;
  }

  startDrag(nodeId: string, worldX: number, worldY: number): void {
    if (this.editing) {
      this.exitEditMode();
    }
    this.pushUndo("drag");
    const node = this.store.getNode(nodeId);
    this.selectedId = nodeId;
    this.dragging = true;
    this.dragNodeId = nodeId;
    this.dragOffset = { x: worldX - node.x, y: worldY - node.y };
    this.dragMoved = false;
    this.reparentTargetId = null;
    this.notify();
  }

  updateDrag(worldX: number, worldY: number): void {
    if (!this.dragging || this.dragNodeId === null) return;

    const node = this.store.getNode(this.dragNodeId);
    const newX = worldX - this.dragOffset.x;
    const newY = worldY - this.dragOffset.y;
    const dx = newX - node.x;
    const dy = newY - node.y;

    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;

    this.dragMoved = true;

    // Move the node and its entire subtree
    this.moveSubtree(this.dragNodeId, dx, dy);

    // Check for reparent proximity
    this.reparentTargetId = this.findReparentTarget(this.dragNodeId);

    this.notify();
  }

  endDrag(): void {
    if (!this.dragging || this.dragNodeId === null) {
      this.dragging = false;
      this.dragNodeId = null;
      this.reparentTargetId = null;
      return;
    }

    const nodeId = this.dragNodeId;

    if (this.reparentTargetId !== null) {
      // Reparent the node
      this.store.moveNode(nodeId, this.reparentTargetId);
    }

    if (!this.dragMoved && this.reparentTargetId === null) {
      // No movement and no reparent: pop the undo entry (no-op drag)
      this.undoStack.pop();
    }

    this.dragging = false;
    this.dragNodeId = null;
    this.reparentTargetId = null;
    this.notify();
  }

  /** Move a node and all its descendants by a delta. */
  private moveSubtree(nodeId: string, dx: number, dy: number): void {
    const node = this.store.getNode(nodeId);
    this.store.setNodePosition(nodeId, node.x + dx, node.y + dy);
    for (const childId of node.children) {
      this.moveSubtree(childId, dx, dy);
    }
  }

  /** Find the nearest non-descendant node within reparent proximity. */
  private findReparentTarget(draggedId: string): string | null {
    const dragged = this.store.getNode(draggedId);
    const draggedCenterX = dragged.x + dragged.width / 2;
    const draggedCenterY = dragged.y + dragged.height / 2;

    const PROXIMITY_THRESHOLD = 100;
    let bestId: string | null = null;
    let bestDist = PROXIMITY_THRESHOLD;

    for (const node of this.store.getVisibleNodes()) {
      if (node.id === draggedId) continue;
      // Cannot reparent to own descendant
      if (this.store.isDescendant(node.id, draggedId)) continue;
      // Cannot reparent to current parent (already there)
      if (node.id === dragged.parentId) continue;

      // Distance from dragged node center to potential parent's edge center
      const edgeX = draggedCenterX < node.x + node.width / 2
        ? node.x                    // approach from left
        : node.x + node.width;     // approach from right
      const edgeY = node.y + node.height / 2;

      const dist = Math.hypot(draggedCenterX - edgeX, draggedCenterY - edgeY);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = node.id;
      }
    }

    return bestId;
  }

  // --- Undo/redo ---

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push(this.captureState("redo"));
    this.restoreState(entry);
    this.notify();
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push(this.captureState("undo"));
    this.restoreState(entry);
    this.notify();
  }

  // --- Serialization ---

  loadJSON(data: MindMapFileFormat): void {
    this.store = deserialize(data);
    this.meta = { ...data.meta, version: data.version };
    this.camera = data.camera ?? { x: 0, y: 0, zoom: 1 };
    this.assets = (data.assets ?? []).map((a) => ({ ...a }));
    this.selectedId = null;
    this.editing = false;
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  toJSON(): MindMapFileFormat {
    const data = serialize(this.store, this.meta);
    data.assets = this.assets.map((a) => ({ ...a }));
    return data;
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
      assets: this.assets.map((a) => ({ ...a })),
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
    this.assets = entry.assets.map((a) => ({ ...a }));

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

  /** Find the root of a node and resolve cross-tree overlap. */
  private resolveOverlapForNode(nodeId: string): void {
    // Walk up to root
    let rootId = nodeId;
    let node = this.store.getNode(rootId);
    while (node.parentId !== null) {
      rootId = node.parentId;
      node = this.store.getNode(rootId);
    }
    resolveTreeOverlap(this.store, rootId);
  }
}
