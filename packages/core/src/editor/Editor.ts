// ABOUTME: Core Editor class wrapping MindMapStore with selection, modes, and undo.
// ABOUTME: All state mutations flow through Editor; it is the sole source of truth.

import type { MindMapNode, NodeStyle, TextMeasurer, MindMapMeta, Camera, Asset } from "../model/types";
import { MindMapStore } from "../store/MindMapStore";
import { deserialize, serialize, toMarkdown as storeToMarkdown } from "../serialization/serialization";
import type { MindMapFileFormat, MindMapFileNode } from "../serialization/schema";
import {
  branchDirection,
  centerChildren,
  positionNewChild,
  positionNewSibling,
  reflowSubtree,
  relayoutAfterDelete,
  relayoutFromNode,
  resolveTreeOverlap,
} from "../layout/layout";
import { nextBranchColor } from "../theme/palette";

export const ROOT_FONT_SIZE = 16;

/** Weight applied to cross-axis distance in spatial fallback navigation.
 *  Higher values strongly prefer nodes aligned on the primary axis. */
const CROSS_AXIS_WEIGHT = 10;

/** Snapshot of document state for undo/redo. */
interface HistoryEntry {
  label: string;
  nodes: Map<string, MindMapNode>;
  rootIds: string[];
  assets: Asset[];
}

/** Stub text measurer that estimates from character count. */
export const stubTextMeasurer: TextMeasurer = {
  measure(text: string, style?: NodeStyle) {
    const scale = (style?.fontSize ?? 14) / 14;
    const charWidth = Math.round(8 * scale);
    const lineHeight = Math.round(20 * scale);
    const paddingY = Math.round(6 * scale);
    const lines = text.split("\n");
    const maxLineLen = Math.max(...lines.map((l) => l.length), 0);
    return { width: Math.max(maxLineLen * charWidth + 16, 100), height: lines.length * lineHeight + paddingY * 2 };
  },
  reflow(text: string, maxWidth: number, style?: NodeStyle) {
    const scale = (style?.fontSize ?? 14) / 14;
    const charWidth = Math.round(8 * scale);
    const lineHeight = Math.round(20 * scale);
    const paddingY = Math.round(6 * scale);
    const charsPerLine = Math.floor((maxWidth - 16) / charWidth);
    const lines = text.split("\n");
    let totalLines = 0;
    for (const line of lines) {
      totalLines += Math.max(1, Math.ceil(line.length / charsPerLine));
    }
    return { width: maxWidth, height: totalLines * lineHeight + paddingY * 2 };
  },
};

/** Generate easymotion labels for a distance-sorted list of node IDs.
 *  Returns a Map from label string to node ID. Nodes earlier in the array
 *  (closer) get shorter labels. */
export function generateEasyMotionLabels(nodeIds: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const n = nodeIds.length;
  if (n === 0) return result;

  // Number of prefix letters needed for double-char labels
  const P = n <= 26 ? 0 : Math.min(26, Math.ceil((n - 26) / 25));
  const singleCount = 26 - P;

  // Single-char labels: skip the first P letters (reserved as prefixes)
  let nodeIdx = 0;
  for (let i = 0; i < singleCount && nodeIdx < n; i++) {
    const label = String.fromCharCode(97 + P + i); // 'a' + P + i
    const id = nodeIds[nodeIdx++];
    if (id !== undefined) result.set(label, id);
  }

  // Double-char labels: each prefix letter followed by a-z
  for (let p = 0; p < P && nodeIdx < n; p++) {
    const prefix = String.fromCharCode(97 + p); // 'a' + p
    for (let s = 0; s < 26 && nodeIdx < n; s++) {
      const label = prefix + String.fromCharCode(97 + s);
      const id = nodeIds[nodeIdx++];
      if (id !== undefined) result.set(label, id);
    }
  }

  return result;
}

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
  private dragReordered = false;
  private reparentTargetId: string | null = null;

  // Width resize state
  private resizingWidth = false;
  private resizeNodeId: string | null = null;
  private resizeStartWidth = 0;
  private resizeChanged = false;

  // Image resize state
  private resizingImage = false;
  private imageResizeNodeId: string | null = null;
  private imageAspectRatio = 1;
  private imageResizeChanged = false;

  // EasyMotion state
  private easyMotionActive = false;
  private easyMotionByLabel = new Map<string, string>();  // label -> nodeId
  private easyMotionByNode = new Map<string, string>();   // nodeId -> label
  private easyMotionBuffer = "";
  private easyMotionPrefixes = new Set<string>();

  // Viewport dimensions (set by web layer for zoom-to-fit)
  private viewportWidth = 0;
  private viewportHeight = 0;

  // Document metadata
  protected meta: MindMapMeta = { id: "default", version: 1, theme: "default" };

  // External action callbacks (set by web layer)
  private saveCallback: (() => void) | null = null;
  private openCallback: (() => void) | null = null;
  private exportCallback: (() => void) | null = null;

  // Undo/redo
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private lastUndoLabel: string | null = null;

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

  /** Walk up ancestors returning the first style.color found, or undefined. */
  getBranchColor(id: string): string | undefined {
    let node = this.store.getNode(id);
    while (true) {
      if (node.style?.color) return node.style.color;
      if (node.parentId === null) return undefined;
      node = this.store.getNode(node.parentId);
    }
  }

  /** Set a node's branch color. */
  setNodeColor(id: string, color: string): void {
    const node = this.store.getNode(id);
    node.style = { ...node.style, color };
    this.notify();
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

  getTheme(): string {
    return this.meta.theme;
  }

  setCamera(x: number, y: number, zoom: number): void {
    this.camera = { x, y, zoom };
    this.notify();
  }

  /** Zoom in by a fixed step, clamped to [MIN_ZOOM, MAX_ZOOM]. */
  zoomIn(): void {
    const newZoom = Math.min(3, this.camera.zoom * 1.25);
    this.camera = { ...this.camera, zoom: newZoom };
    this.notify();
  }

  /** Zoom out by a fixed step, clamped to [MIN_ZOOM, MAX_ZOOM]. */
  zoomOut(): void {
    const newZoom = Math.max(0.1, this.camera.zoom / 1.25);
    this.camera = { ...this.camera, zoom: newZoom };
    this.notify();
  }

  /** Zoom to fit all visible nodes in the given viewport dimensions. */
  zoomToFit(viewportWidth: number, viewportHeight: number): void {
    const visible = this.store.getVisibleNodes();
    if (visible.length === 0) {
      this.camera = { x: 0, y: 0, zoom: 1 };
      this.notify();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of visible) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const padding = 40;
    const zoom = Math.min(
      3,
      Math.max(0.1, Math.min(
        (viewportWidth - padding * 2) / contentW,
        (viewportHeight - padding * 2) / contentH,
      )),
    );
    const x = (viewportWidth - contentW * zoom) / 2 - minX * zoom;
    const y = (viewportHeight - contentH * zoom) / 2 - minY * zoom;
    this.camera = { x, y, zoom };
    this.notify();
  }

  /** Center and zoom to a specific node in the given viewport dimensions. */
  zoomToNode(nodeId: string, viewportWidth: number, viewportHeight: number): void {
    const node = this.store.getNode(nodeId);
    const zoom = this.camera.zoom;
    const x = viewportWidth / 2 - (node.x + node.width / 2) * zoom;
    const y = viewportHeight / 2 - (node.y + node.height / 2) * zoom;
    this.camera = { x, y, zoom };
    this.notify();
  }

  /** Set viewport dimensions (called by web layer on mount/resize). */
  setViewportSize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  /** Get stored viewport dimensions. */
  getViewportSize(): { width: number; height: number } {
    return { width: this.viewportWidth, height: this.viewportHeight };
  }

  /** Pan the camera by a delta in screen pixels. */
  panCamera(dx: number, dy: number): void {
    this.camera = { ...this.camera, x: this.camera.x + dx, y: this.camera.y + dy };
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

  // --- EasyMotion ---

  isEasyMotionActive(): boolean {
    return this.easyMotionActive;
  }

  getEasyMotionLabel(nodeId: string): string | undefined {
    return this.easyMotionByNode.get(nodeId);
  }

  getEasyMotionBuffer(): string {
    return this.easyMotionBuffer;
  }

  enterEasyMotionMode(): void {
    const visible = this.store.getVisibleNodes();
    const selectedId = this.selectedId;

    // Filter out the selected node
    const candidates = selectedId
      ? visible.filter((n) => n.id !== selectedId)
      : visible;

    if (candidates.length === 0) return;

    // Sort by distance from reference point
    let refX: number;
    let refY: number;
    if (selectedId) {
      const sel = this.store.getNode(selectedId);
      refX = sel.x + sel.width / 2;
      refY = sel.y + sel.height / 2;
    } else {
      // Use viewport center in world coordinates
      refX = (this.viewportWidth / 2 - this.camera.x) / this.camera.zoom;
      refY = (this.viewportHeight / 2 - this.camera.y) / this.camera.zoom;
    }

    candidates.sort((a, b) => {
      const da = Math.hypot(a.x + a.width / 2 - refX, a.y + a.height / 2 - refY);
      const db = Math.hypot(b.x + b.width / 2 - refX, b.y + b.height / 2 - refY);
      return da - db;
    });

    const nodeIds = candidates.map((n) => n.id);
    const labelToNode = generateEasyMotionLabels(nodeIds);

    this.easyMotionByLabel = labelToNode;
    this.easyMotionByNode = new Map<string, string>();
    for (const [label, id] of labelToNode) {
      this.easyMotionByNode.set(id, label);
    }

    // Collect single-char prefixes (letters that start double-char labels)
    this.easyMotionPrefixes = new Set<string>();
    for (const label of labelToNode.keys()) {
      if (label.length === 2) {
        this.easyMotionPrefixes.add(label.charAt(0));
      }
    }

    this.easyMotionBuffer = "";
    this.easyMotionActive = true;
    this.notify();
  }

  exitEasyMotionMode(): void {
    this.easyMotionActive = false;
    this.easyMotionByLabel = new Map();
    this.easyMotionByNode = new Map();
    this.easyMotionPrefixes = new Set();
    this.easyMotionBuffer = "";
    this.notify();
  }

  handleEasyMotionKey(key: string): void {
    if (!this.easyMotionActive) return;

    if (this.easyMotionBuffer === "") {
      // First character
      const nodeId = this.easyMotionByLabel.get(key);
      if (nodeId) {
        // Single-char label match: select and exit
        this.select(nodeId);
        this.exitEasyMotionMode();
        return;
      }
      if (this.easyMotionPrefixes.has(key)) {
        // Valid prefix: buffer it and wait for second char
        this.easyMotionBuffer = key;
        this.notify();
        return;
      }
      // Invalid key: cancel
      this.exitEasyMotionMode();
    } else {
      // Second character after prefix
      const fullLabel = this.easyMotionBuffer + key;
      const nodeId = this.easyMotionByLabel.get(fullLabel);
      if (nodeId) {
        this.select(nodeId);
        this.exitEasyMotionMode();
        return;
      }
      // Invalid combo: cancel
      this.exitEasyMotionMode();
    }
  }

  // --- Edit mode ---

  enterEditMode(): void {
    if (this.selectedId === null) return;
    this.remeasureNode(this.selectedId);
    this.editing = true;
    this.notify();
  }

  exitEditMode(): void {
    if (!this.editing) return;
    this.editing = false;

    // Empty node cleanup: if the node has empty text, delete it
    if (this.selectedId !== null) {
      const node = this.store.getNode(this.selectedId);
      if (node.text === "" && !node.image) {
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
    // Auto-assign a branch color from the palette
    const existingColors = this.store.getRoots()
      .filter((r) => r.id !== id)
      .map((r) => r.style?.color)
      .filter((c): c is string => c !== undefined);
    const node = this.store.getNode(id);
    node.style = { ...node.style, color: nextBranchColor(existingColors) };
    this.remeasureNode(id);
    this.selectedId = id;
    this.editing = true;
    this.ensureNodeVisible(id);
    this.notify();
    return id;
  }

  addChild(parentId: string, text = ""): string {
    this.pushUndo("add-child");
    const parent = this.store.getNode(parentId);
    if (parent.collapsed) {
      this.store.toggleCollapse(parentId);
      relayoutFromNode(this.store, parentId);
    }
    const id = this.store.addChild(parentId, text);
    this.remeasureNode(id);
    positionNewChild(this.store, id);
    this.resolveOverlapForNode(id);
    this.selectedId = id;
    this.editing = true;
    this.ensureNodeVisible(id);
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
    this.remeasureNode(id);
    positionNewSibling(this.store, id, nodeId);
    this.resolveOverlapForNode(id);
    this.selectedId = id;
    this.editing = true;
    this.ensureNodeVisible(id);
    this.notify();
    return id;
  }

  detachToRoot(nodeId: string): void {
    const node = this.store.getNode(nodeId);
    if (node.parentId === null) return; // Already a root
    this.pushUndo("detach-to-root");
    this.store.detachToRoot(nodeId);
    this.resolveOverlapForNode(nodeId);
    this.notify();
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
    const squashLabel = `set-text:${nodeId}`;
    if (this.lastUndoLabel !== squashLabel) {
      this.pushUndo(squashLabel);
    }
    this.store.setText(nodeId, text);
    this.remeasureNode(nodeId);
    this.notify();
  }

  toggleCollapse(nodeId: string): void {
    this.pushUndo("toggle-collapse");
    this.store.toggleCollapse(nodeId);
    relayoutFromNode(this.store, nodeId);
    // Only resolve cross-tree overlap when expanding (tree grows).
    // Collapsing shrinks the tree, so pushing other trees away is unwanted.
    if (!this.store.getNode(nodeId).collapsed) {
      this.resolveOverlapForNode(nodeId);
    }
    this.notify();
  }

  reorderNode(nodeId: string, direction: "up" | "down"): void {
    this.pushUndo("reorder-node");
    this.store.reorderNode(nodeId, direction);
    relayoutFromNode(this.store, nodeId);
    this.notify();
  }

  /** Structural move: reorder, overflow to parent's sibling, outdent, or indent. */
  moveNode(nodeId: string, direction: "up" | "down" | "left" | "right"): void {
    const node = this.store.getNode(nodeId);
    if (node.parentId === null) return; // No-op on root nodes

    if (direction === "up" || direction === "down") {
      this.moveNodeVertical(nodeId, direction);
    } else {
      this.moveNodeHorizontal(nodeId, direction);
    }
  }

  private moveNodeVertical(nodeId: string, direction: "up" | "down"): void {
    const node = this.store.getNode(nodeId);
    if (node.parentId === null) return;

    const parent = this.store.getNode(node.parentId);
    const idx = parent.children.indexOf(nodeId);

    const atBoundary = direction === "up" ? idx === 0 : idx === parent.children.length - 1;

    if (!atBoundary) {
      // Simple reorder within siblings
      this.reorderNode(nodeId, direction);
      return;
    }

    // Overflow: move to parent's adjacent sibling
    const grandparentId = parent.parentId;
    if (grandparentId === null) return; // Parent is root, no overflow target

    const grandparent = this.store.getNode(grandparentId);
    const parentIdx = grandparent.children.indexOf(parent.id);

    const targetIdx = direction === "up" ? parentIdx - 1 : parentIdx + 1;
    const targetParentId = grandparent.children[targetIdx];
    if (targetParentId === undefined) return; // No adjacent sibling

    this.pushUndo("move-node");
    const insertIndex = direction === "up"
      ? this.store.getNode(targetParentId).children.length // Last child
      : 0; // First child
    this.store.moveNode(nodeId, targetParentId, insertIndex);
    positionNewChild(this.store, nodeId);
    reflowSubtree(this.store, nodeId);
    relayoutFromNode(this.store, nodeId);
    // Re-layout old parent too
    relayoutFromNode(this.store, parent.id);
    this.notify();
  }

  private moveNodeHorizontal(nodeId: string, direction: "left" | "right"): void {
    const node = this.store.getNode(nodeId);
    if (node.parentId === null) return;

    const dir = branchDirection(this.store, nodeId);
    // On right-side branch: left = outdent, right = indent
    // On left-side branch: right = outdent, left = indent
    const isOutdent = (dir === 1 && direction === "left") || (dir === -1 && direction === "right");

    if (isOutdent) {
      this.outdentNode(nodeId);
    } else {
      this.indentNode(nodeId);
    }
  }

  private outdentNode(nodeId: string): void {
    const node = this.store.getNode(nodeId);
    if (node.parentId === null) return;

    const parent = this.store.getNode(node.parentId);
    const grandparentId = parent.parentId;
    if (grandparentId === null) return; // Can't outdent direct children of root

    const grandparent = this.store.getNode(grandparentId);
    const parentIdx = grandparent.children.indexOf(parent.id);

    this.pushUndo("move-node");
    this.store.moveNode(nodeId, grandparentId, parentIdx + 1);
    positionNewChild(this.store, nodeId);
    reflowSubtree(this.store, nodeId);
    relayoutFromNode(this.store, nodeId);
    // Re-layout old parent too
    relayoutFromNode(this.store, parent.id);
    this.notify();
  }

  private indentNode(nodeId: string): void {
    const node = this.store.getNode(nodeId);
    if (node.parentId === null) return;

    const parent = this.store.getNode(node.parentId);
    const idx = parent.children.indexOf(nodeId);
    if (idx <= 0) return; // No previous sibling to indent into

    const prevSiblingId = parent.children[idx - 1];
    if (prevSiblingId === undefined) return;

    this.pushUndo("move-node");
    this.store.moveNode(nodeId, prevSiblingId);
    positionNewChild(this.store, nodeId);
    reflowSubtree(this.store, nodeId);
    relayoutFromNode(this.store, nodeId);
    // Re-layout old parent too
    relayoutFromNode(this.store, parent.id);
    this.notify();
  }

  setNodePosition(nodeId: string, x: number, y: number): void {
    this.pushUndo("set-position");
    this.store.setNodePosition(nodeId, x, y);
    this.notify();
  }

  // --- Image/asset management ---

  getAssets(): Asset[] {
    return this.store.getAssets();
  }

  setNodeImage(nodeId: string, asset: Asset, displayWidth: number, displayHeight: number): void {
    this.pushUndo("set-image");
    this.store.setNodeImage(nodeId, asset, displayWidth, displayHeight);
    this.remeasureNode(nodeId);
    this.notify();
  }

  removeNodeImage(nodeId: string): void {
    this.pushUndo("remove-image");
    this.store.removeNodeImage(nodeId);
    this.remeasureNode(nodeId);
    this.notify();
  }

  // --- Spatial navigation ---

  navigateUp(): void {
    if (this.selectedId === null) { this.selectNearestToViewportCenter(); return; }
    const current = this.store.getNode(this.selectedId);
    const currentCenterY = current.y + current.height / 2;

    let best: MindMapNode | null = null;

    // Root nodes use spatial search directly (siblings can be anywhere on the canvas)
    if (current.parentId !== null) {
      // Navigate among siblings for non-root nodes
      const siblings = this.store.getSiblings(this.selectedId);
      let bestCenterY = -Infinity;
      for (const sib of siblings) {
        if (sib.id === this.selectedId) continue;
        const sibCenterY = sib.y + sib.height / 2;
        if (sibCenterY >= currentCenterY) continue; // Not above
        if (sibCenterY > bestCenterY) {
          best = sib;
          bestCenterY = sibCenterY;
        }
      }
    }

    if (!best) best = this.spatialFallback("up");
    if (best) {
      this.selectedId = best.id;
      this.notify();
    }
  }

  navigateDown(): void {
    if (this.selectedId === null) { this.selectNearestToViewportCenter(); return; }
    const current = this.store.getNode(this.selectedId);
    const currentCenterY = current.y + current.height / 2;

    let best: MindMapNode | null = null;

    // Root nodes use spatial search directly (siblings can be anywhere on the canvas)
    if (current.parentId !== null) {
      // Navigate among siblings for non-root nodes
      const siblings = this.store.getSiblings(this.selectedId);
      let bestCenterY = Infinity;
      for (const sib of siblings) {
        if (sib.id === this.selectedId) continue;
        const sibCenterY = sib.y + sib.height / 2;
        if (sibCenterY <= currentCenterY) continue; // Not below
        if (sibCenterY < bestCenterY) {
          best = sib;
          bestCenterY = sibCenterY;
        }
      }
    }

    if (!best) best = this.spatialFallback("down");
    if (best) {
      this.selectedId = best.id;
      this.notify();
    }
  }

  /** Find the child nearest in y to the current node's center. */
  private nearestChildByY(children: MindMapNode[], parentCenterY: number): MindMapNode | null {
    let best: MindMapNode | null = null;
    let bestDist = Infinity;
    for (const child of children) {
      const dist = Math.abs(child.y + child.height / 2 - parentCenterY);
      if (dist < bestDist) {
        best = child;
        bestDist = dist;
      }
    }
    return best;
  }

  /** Spatial fallback: find the nearest visible node in the given direction
   *  using a weighted distance score (primaryAxisDist + crossAxisDist * CROSS_AXIS_WEIGHT). */
  private spatialFallback(direction: "up" | "down" | "left" | "right"): MindMapNode | null {
    if (this.selectedId === null) return null;
    const current = this.store.getNode(this.selectedId);
    const cx = current.x + current.width / 2;
    const cy = current.y + current.height / 2;

    let best: MindMapNode | null = null;
    let bestScore = Infinity;

    for (const node of this.store.getVisibleNodes()) {
      if (node.id === this.selectedId) continue;
      const nx = node.x + node.width / 2;
      const ny = node.y + node.height / 2;

      let inDirection: boolean;
      let score: number;

      switch (direction) {
        case "up":
          inDirection = ny < cy;
          score = (cy - ny) + Math.abs(nx - cx) * CROSS_AXIS_WEIGHT;
          break;
        case "down":
          inDirection = ny > cy;
          score = (ny - cy) + Math.abs(nx - cx) * CROSS_AXIS_WEIGHT;
          break;
        case "left":
          inDirection = nx < cx;
          score = (cx - nx) + Math.abs(ny - cy) * CROSS_AXIS_WEIGHT;
          break;
        case "right":
          inDirection = nx > cx;
          score = (nx - cx) + Math.abs(ny - cy) * CROSS_AXIS_WEIGHT;
          break;
      }

      if (inDirection && score < bestScore) {
        best = node;
        bestScore = score;
      }
    }

    return best;
  }

  navigateLeft(): void {
    if (this.selectedId === null) { this.selectNearestToViewportCenter(); return; }
    const current = this.store.getNode(this.selectedId);
    const currentCenterY = current.y + current.height / 2;

    if (current.parentId === null) {
      // Root node: go to nearest left-side child by y
      const leftChildren = this.store.getChildren(this.selectedId).filter((c) => c.x < current.x);
      const target = this.nearestChildByY(leftChildren, currentCenterY);
      if (target) {
        if (current.collapsed) {
          this.toggleCollapse(this.selectedId);
        }
        this.selectedId = target.id;
        this.notify();
      } else {
        // No left children: spatial fallback
        const fallback = this.spatialFallback("left");
        if (fallback) {
          this.selectedId = fallback.id;
          this.notify();
        }
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
      const target = this.nearestChildByY(children, currentCenterY);
      if (target) {
        if (current.collapsed) {
          this.toggleCollapse(this.selectedId);
        }
        this.selectedId = target.id;
        this.notify();
      } else {
        // Left-side leaf: spatial fallback
        const fallback = this.spatialFallback("left");
        if (fallback) {
          this.selectedId = fallback.id;
          this.notify();
        }
      }
    }
  }

  navigateRight(): void {
    if (this.selectedId === null) { this.selectNearestToViewportCenter(); return; }
    const current = this.store.getNode(this.selectedId);
    const currentCenterY = current.y + current.height / 2;

    if (current.parentId === null) {
      // Root node: go to nearest right-side child by y
      const rightChildren = this.store.getChildren(this.selectedId).filter((c) => c.x >= current.x);
      const target = this.nearestChildByY(rightChildren, currentCenterY);
      if (target) {
        if (current.collapsed) {
          this.toggleCollapse(this.selectedId);
        }
        this.selectedId = target.id;
        this.notify();
      } else {
        // No right children: spatial fallback
        const fallback = this.spatialFallback("right");
        if (fallback) {
          this.selectedId = fallback.id;
          this.notify();
        }
      }
      return;
    }

    // Non-root: direction depends on branch side
    const dir = branchDirection(this.store, this.selectedId);
    if (dir >= 0) {
      // Right-side branch: Right goes toward children (deeper)
      const children = this.store.getChildren(this.selectedId);
      const target = this.nearestChildByY(children, currentCenterY);
      if (target) {
        if (current.collapsed) {
          this.toggleCollapse(this.selectedId);
        }
        this.selectedId = target.id;
        this.notify();
      } else {
        // Right-side leaf: spatial fallback
        const fallback = this.spatialFallback("right");
        if (fallback) {
          this.selectedId = fallback.id;
          this.notify();
        }
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
    this.dragReordered = false;
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

    // Check for sibling reorder (non-root nodes only)
    if (node.parentId !== null) {
      this.checkDragReorder(this.dragNodeId);
    }

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
      // Reparent the node and reposition entire subtree as child of target
      const oldX = this.store.getNode(nodeId).x;
      const oldY = this.store.getNode(nodeId).y;
      this.store.moveNode(nodeId, this.reparentTargetId);
      positionNewChild(this.store, nodeId);
      const newNode = this.store.getNode(nodeId);
      const dx = newNode.x - oldX;
      const dy = newNode.y - oldY;
      for (const childId of newNode.children) {
        this.moveSubtree(childId, dx, dy);
      }
      reflowSubtree(this.store, nodeId);
      relayoutFromNode(this.store, nodeId);
    } else if (this.dragMoved) {
      // Reflow children if node was dragged to the other side of its root
      reflowSubtree(this.store, nodeId);
      // Snap to correct layout position after sibling reorder
      if (this.dragReordered) {
        relayoutFromNode(this.store, nodeId);
      }
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

  /** Check if the dragged node has crossed an adjacent sibling and swap if so. */
  private checkDragReorder(draggedId: string): void {
    const dragged = this.store.getNode(draggedId);
    if (dragged.parentId === null) return;

    const parent = this.store.getNode(dragged.parentId);
    const draggedCenterY = dragged.y + dragged.height / 2;
    let didSwap = false;

    // While-loop handles fast drags past multiple siblings
    let swapped = true;
    while (swapped) {
      swapped = false;
      const idx = parent.children.indexOf(draggedId);
      if (idx === -1) break;

      // Check sibling below
      const belowId = parent.children[idx + 1];
      if (belowId !== undefined) {
        const below = this.store.getNode(belowId);
        const belowCenterY = below.y + below.height / 2;
        if (draggedCenterY > belowCenterY) {
          parent.children[idx + 1] = draggedId;
          parent.children[idx] = belowId;
          swapped = true;
          didSwap = true;
          continue;
        }
      }

      // Check sibling above
      const aboveId = idx > 0 ? parent.children[idx - 1] : undefined;
      if (aboveId !== undefined) {
        const above = this.store.getNode(aboveId);
        const aboveCenterY = above.y + above.height / 2;
        if (draggedCenterY < aboveCenterY) {
          parent.children[idx - 1] = draggedId;
          parent.children[idx] = aboveId;
          swapped = true;
          didSwap = true;
          continue;
        }
      }
    }

    if (!didSwap) return;

    this.dragReordered = true;

    // Reposition non-dragged siblings: save dragged position, re-center, restore dragged
    const savedX = dragged.x;
    const savedY = dragged.y;
    centerChildren(this.store, dragged.parentId);
    const afterCenter = this.store.getNode(draggedId);
    const dx = savedX - afterCenter.x;
    const dy = savedY - afterCenter.y;
    if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
      this.moveSubtree(draggedId, dx, dy);
    }
  }

  /** Move a node and all its descendants by a delta. */
  private moveSubtree(nodeId: string, dx: number, dy: number): void {
    const node = this.store.getNode(nodeId);
    this.store.setNodePosition(nodeId, node.x + dx, node.y + dy);
    for (const childId of node.children) {
      this.moveSubtree(childId, dx, dy);
    }
  }

  /** Find a reparent target: the node whose bounding box contains the dragged node's center. */
  private findReparentTarget(draggedId: string): string | null {
    const dragged = this.store.getNode(draggedId);
    const draggedCenterX = dragged.x + dragged.width / 2;
    const draggedCenterY = dragged.y + dragged.height / 2;

    for (const node of this.store.getVisibleNodes()) {
      if (node.id === draggedId) continue;
      // Cannot reparent to own descendant
      if (this.store.isDescendant(node.id, draggedId)) continue;
      // Cannot reparent to current parent (already there)
      if (node.id === dragged.parentId) continue;

      // Check if dragged node's center is within this node's bounding box
      if (
        draggedCenterX >= node.x &&
        draggedCenterX <= node.x + node.width &&
        draggedCenterY >= node.y &&
        draggedCenterY <= node.y + node.height
      ) {
        return node.id;
      }
    }

    return null;
  }

  // --- Width resize ---

  private static MIN_NODE_WIDTH = 60;

  isResizingWidth(): boolean {
    return this.resizingWidth;
  }

  startWidthResize(nodeId: string): void {
    this.pushUndo("resize-width");
    const node = this.store.getNode(nodeId);
    this.resizingWidth = true;
    this.resizeNodeId = nodeId;
    this.resizeStartWidth = node.width;
    this.resizeChanged = false;
    this.notify();
  }

  updateWidthResize(newWidth: number): void {
    if (!this.resizingWidth || this.resizeNodeId === null) return;
    const clampedWidth = Math.max(Editor.MIN_NODE_WIDTH, newWidth);
    this.store.setNodeWidth(this.resizeNodeId, clampedWidth);
    this.remeasureNode(this.resizeNodeId);
    this.resizeChanged = true;
    this.notify();
  }

  endWidthResize(): void {
    if (!this.resizingWidth) return;

    if (!this.resizeChanged) {
      // No-op resize: pop the undo entry
      this.undoStack.pop();
    }

    this.resizingWidth = false;
    this.resizeNodeId = null;
    this.notify();
  }

  // --- Image resize ---

  private static MIN_IMAGE_WIDTH = 40;

  isResizingImage(): boolean {
    return this.resizingImage;
  }

  startImageResize(nodeId: string): void {
    const node = this.store.getNode(nodeId);
    if (!node.image) return;
    this.pushUndo("resize-image");
    this.resizingImage = true;
    this.imageResizeNodeId = nodeId;
    this.imageAspectRatio = node.image.height / node.image.width;
    this.imageResizeChanged = false;
    this.notify();
  }

  updateImageResize(newWidth: number): void {
    if (!this.resizingImage || this.imageResizeNodeId === null) return;
    const node = this.store.getNode(this.imageResizeNodeId);
    if (!node.image) return;
    const clampedWidth = Math.max(Editor.MIN_IMAGE_WIDTH, Math.round(newWidth));
    const newHeight = Math.round(clampedWidth * this.imageAspectRatio);
    node.image = { ...node.image, width: clampedWidth, height: newHeight };
    this.imageResizeChanged = true;
    this.notify();
  }

  endImageResize(): void {
    if (!this.resizingImage) return;

    if (!this.imageResizeChanged) {
      this.undoStack.pop();
    }

    this.resizingImage = false;
    this.imageResizeNodeId = null;
    this.notify();
  }

  // --- Undo/redo ---

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push(this.captureState("redo"));
    this.restoreState(entry);
    this.lastUndoLabel = null;
    this.notify();
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push(this.captureState("undo"));
    this.restoreState(entry);
    this.lastUndoLabel = null;
    this.notify();
  }

  // --- Serialization ---

  loadJSON(data: MindMapFileFormat): void {
    this.store = deserialize(data);
    this.store.setAssets((data.assets ?? []).map((a) => ({ ...a })));
    this.meta = { ...data.meta, version: data.version };
    this.camera = data.camera ?? { x: 0, y: 0, zoom: 1 };
    this.selectedId = null;
    this.editing = false;
    this.undoStack = [];
    this.redoStack = [];
    this.lastUndoLabel = null;
    this.notify();
  }

  /**
   * Import roots from another mind map file, adding them alongside existing content.
   * All IDs are remapped to avoid collisions. Positions are offset so the first
   * imported root lands at (offsetX, offsetY).
   */
  importRoots(data: MindMapFileFormat, offsetX: number, offsetY: number): void {
    this.pushUndo("import-roots");

    // Compute bounding box origin of imported data to calculate offsets
    let minX = Infinity;
    let minY = Infinity;
    const visitForBounds = (node: MindMapFileNode) => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      for (const child of node.children) visitForBounds(child);
    };
    for (const root of data.roots) visitForBounds(root);
    const dx = offsetX - (isFinite(minX) ? minX : 0);
    const dy = offsetY - (isFinite(minY) ? minY : 0);

    // Generate new IDs for all imported nodes to avoid collisions
    const idMap = new Map<string, string>();
    let counter = 0;
    const assignIds = (fileNode: MindMapFileNode) => {
      idMap.set(fileNode.id, `import${Date.now()}_${counter++}`);
      for (const child of fileNode.children) assignIds(child);
    };
    for (const root of data.roots) assignIds(root);

    let firstRootId: string | null = null;

    const loadNode = (fileNode: MindMapFileNode, parentId: string | null) => {
      const newId = idMap.get(fileNode.id) ?? fileNode.id;
      if (firstRootId === null && parentId === null) firstRootId = newId;

      this.store.loadNode({
        id: newId,
        parentId,
        text: fileNode.text,
        x: fileNode.x + dx,
        y: fileNode.y + dy,
        width: fileNode.width,
        height: fileNode.height,
        children: fileNode.children.map((c) => idMap.get(c.id) ?? c.id),
        collapsed: fileNode.collapsed ?? false,
        widthConstrained: fileNode.widthConstrained ?? false,
        style: fileNode.style,
        image: fileNode.image,
      });

      if (parentId === null) {
        this.store.addRootId(newId);
      }

      for (const child of fileNode.children) {
        loadNode(child, newId);
      }
    };

    for (const root of data.roots) {
      loadNode(root, null);
    }

    // Register imported assets
    const existingAssets = this.store.getAssets();
    for (const asset of data.assets ?? []) {
      if (!existingAssets.some((a) => a.id === asset.id)) {
        existingAssets.push({ ...asset });
      }
    }

    if (firstRootId) {
      this.selectedId = firstRootId;
    }
    this.editing = false;
    this.notify();
  }

  toMarkdown(): string {
    return storeToMarkdown(this.store);
  }

  toJSON(): MindMapFileFormat {
    const data = serialize(this.store, this.meta, this.camera);
    data.assets = this.store.getAssets().map((a) => ({ ...a }));
    return data;
  }

  // --- Private helpers ---

  private pushUndo(label: string): void {
    this.undoStack.push(this.captureState(label));
    this.redoStack = []; // Clear redo on new mutation
    this.lastUndoLabel = label;
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
      assets: this.store.getAssets().map((a) => ({ ...a })),
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
    this.store.setAssets(entry.assets.map((a) => ({ ...a })));

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
      otherRoots.sort(
        (a, b) =>
          Math.abs(a.x - node.x) +
          Math.abs(a.y - node.y) -
          (Math.abs(b.x - node.x) + Math.abs(b.y - node.y)),
      );
      this.selectedId = otherRoots[0]?.id ?? null;
    }
    this.editing = false;
  }

  /** Pan the camera minimally to bring a node fully on-screen. */
  private ensureNodeVisible(nodeId: string): void {
    if (this.viewportWidth === 0 || this.viewportHeight === 0) return;

    const node = this.store.getNode(nodeId);
    const padding = 40;
    const zoom = this.camera.zoom;

    // Node bounding box in screen coordinates
    const screenLeft = node.x * zoom + this.camera.x;
    const screenTop = node.y * zoom + this.camera.y;
    const screenRight = screenLeft + node.width * zoom;
    const screenBottom = screenTop + node.height * zoom;

    let dx = 0;
    let dy = 0;

    if (screenRight > this.viewportWidth - padding) {
      dx = (this.viewportWidth - padding) - screenRight;
    } else if (screenLeft < padding) {
      dx = padding - screenLeft;
    }

    if (screenBottom > this.viewportHeight - padding) {
      dy = (this.viewportHeight - padding) - screenBottom;
    } else if (screenTop < padding) {
      dy = padding - screenTop;
    }

    if (dx !== 0 || dy !== 0) {
      this.camera = {
        x: this.camera.x + dx,
        y: this.camera.y + dy,
        zoom: this.camera.zoom,
      };
    }
  }

  /** Select the visible node closest to the center of the viewport. */
  private selectNearestToViewportCenter(): void {
    const visible = this.store.getVisibleNodes();
    if (visible.length === 0) return;

    // Viewport center in world coordinates
    const worldCenterX = (this.viewportWidth / 2 - this.camera.x) / this.camera.zoom;
    const worldCenterY = (this.viewportHeight / 2 - this.camera.y) / this.camera.zoom;

    let best: string | null = null;
    let bestDist = Infinity;
    for (const node of visible) {
      const nodeCenterX = node.x + node.width / 2;
      const nodeCenterY = node.y + node.height / 2;
      const dist = Math.hypot(nodeCenterX - worldCenterX, nodeCenterY - worldCenterY);
      if (dist < bestDist) {
        bestDist = dist;
        best = node.id;
      }
    }

    if (best) {
      this.selectedId = best;
      this.notify();
    }
  }

  /** Update a node's dimensions using the text measurer. */
  private remeasureNode(nodeId: string): void {
    const node = this.store.getNode(nodeId);
    const style = node.parentId === null
      ? { ...node.style, fontSize: node.style?.fontSize ?? ROOT_FONT_SIZE, fontWeight: node.style?.fontWeight ?? 600 }
      : node.style;
    if (node.widthConstrained) {
      const { height } = this.textMeasurer.reflow(node.text, node.width, style);
      node.height = height;
    } else {
      const { width, height } = this.textMeasurer.measure(node.text, style);
      node.width = width;
      node.height = height;
    }
    // Include image height in node dimensions
    if (node.image) {
      node.height += node.image.height;
    }
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
