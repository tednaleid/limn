// ABOUTME: Core Editor class wrapping MindMapStore with selection, modes, and undo.
// ABOUTME: All state mutations flow through Editor; it is the sole source of truth.

import type { MindMapNode, NodeStyle, TextMeasurer, MindMapMeta, Camera, Asset } from "../model/types";
import { MindMapStore } from "../store/MindMapStore";
import { deserialize, serialize, toMarkdown as storeToMarkdown } from "../serialization/serialization";
import type { MindMapFileFormat, MindMapFileNode } from "../serialization/schema";
import {
  branchDirection,
  childXFromParent,
  positionNewChild,
  positionNewSibling,
  reflowSubtree,
  relayoutAfterDelete,
  relayoutFromNode,
  relayoutSubtree,
  resolveTreeOverlap,
} from "../layout/layout";
import { nextBranchColorIndex } from "../theme/palette";
import { resolveTheme } from "../theme/theme";
import type { ThemeDefinition } from "../theme/theme";
import { stripMarkdown, parseMarkdownLines } from "../markdown/inlineMarkdown";
import {
  type EasyMotionState,
  initialEasyMotionState,
  enterEasyMotion,
  handleEasyMotionKey as easyMotionHandleKey,
} from "./easymotion";

export { generateEasyMotionLabels } from "./easymotion";
import {
  findVerticalTarget,
  findHorizontalTarget,
  findNearestToViewportCenter,
  findSpatialReparentTarget,
} from "./navigation";
import {
  type WidthResizeState,
  type ImageResizeState,
  initialWidthResizeState,
  initialImageResizeState,
  initWidthResize,
  initImageResize,
  clampNodeWidth,
  computeImageResize,
} from "./resize";
import {
  type DragState,
  initialDragState,
  initDrag,
  moveSubtree,
  computeDragUpdate,
} from "./drag";

export const ROOT_FONT_SIZE = 18;

/** Fraction of viewport width/height used as scroll margin when auto-scrolling to keep a node visible. */
export const VIEWPORT_SCROLL_MARGIN = 0.15;

/** Snapshot of document state for undo/redo. */
interface HistoryEntry {
  label: string;
  nodes: Map<string, MindMapNode>;
  rootIds: string[];
  assets: Asset[];
}

/** Stub text measurer that estimates from character count.
 *  Uses stripMarkdown to measure display text, not raw markers. */
export const stubTextMeasurer: TextMeasurer = {
  measure(text: string, style?: NodeStyle, literal?: boolean) {
    const scale = (style?.fontSize ?? 14) / 14;
    const charWidth = Math.round(8 * scale);
    const lineHeight = Math.round(20 * scale);
    const paddingY = Math.round(6 * scale);
    const display = literal ? text : stripMarkdown(text);
    const lines = display.split("\n");
    const maxLineLen = Math.max(...lines.map((l) => l.length), 0);
    return { width: maxLineLen * charWidth + 16, height: lines.length * lineHeight + paddingY * 2 };
  },
  reflow(text: string, maxWidth: number, style?: NodeStyle, literal?: boolean) {
    const scale = (style?.fontSize ?? 14) / 14;
    const charWidth = Math.round(8 * scale);
    const lineHeight = Math.round(20 * scale);
    const paddingY = Math.round(6 * scale);
    const charsPerLine = Math.floor((maxWidth - 16) / charWidth);
    const display = literal ? text : stripMarkdown(text);
    const lines = display.split("\n");
    let totalLines = 0;
    for (const line of lines) {
      totalLines += Math.max(1, Math.ceil(line.length / charsPerLine));
    }
    return { width: maxWidth, height: totalLines * lineHeight + paddingY * 2 };
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
  private drag: DragState = initialDragState();

  // Resize state
  private widthResize: WidthResizeState = initialWidthResizeState();
  private imageResize: ImageResizeState = initialImageResizeState();

  // EasyMotion state
  private easyMotion: EasyMotionState = initialEasyMotionState();

  // Viewport dimensions (set by web layer for zoom-to-fit)
  private viewportWidth = 0;
  private viewportHeight = 0;

  // Document metadata
  protected meta: MindMapMeta = { id: "default", version: 1, mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" };

  // External action callbacks (set by web layer)
  private saveCallback: (() => void) | null = null;
  private saveAsCallback: (() => void) | null = null;
  private openCallback: (() => void) | null = null;
  private exportCallback: (() => void) | null = null;
  private themeChangeCallback: ((theme: string) => void) | null = null;
  private clearCallback: (() => void) | null = null;
  private openLinkCallback: ((url: string) => void) | null = null;

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

  /** Get the active ThemeDefinition based on mode and chosen themes. */
  getThemeDefinition(): ThemeDefinition {
    const mode = this.meta.mode === "light" ? "light" : "dark";
    const key = mode === "light" ? this.meta.lightTheme : this.meta.darkTheme;
    return resolveTheme(key, mode);
  }

  /** Get the branch color palette from the active theme. */
  getBranchPalette(): readonly string[] {
    return this.getThemeDefinition().branches;
  }

  /** Walk up ancestors returning the first colorIndex found, or undefined. */
  getBranchColorIndex(id: string): number | undefined {
    let node = this.store.getNode(id);
    while (true) {
      if (node.style?.colorIndex !== undefined) return node.style.colorIndex;
      if (node.parentId === null) return undefined;
      node = this.store.getNode(node.parentId);
    }
  }

  /** Walk up ancestors and resolve the branch color hex from the active theme. */
  getBranchColor(id: string): string | undefined {
    const idx = this.getBranchColorIndex(id);
    if (idx === undefined) return undefined;
    const branches = this.getBranchPalette();
    return branches[idx % branches.length];
  }

  /** Set a node's branch colorIndex. */
  setNodeColorIndex(id: string, colorIndex: number): void {
    const node = this.store.getNode(id);
    node.style = { ...node.style, colorIndex };
    this.notify();
  }

  /** Assign palette colorIndex to root nodes that don't have one (e.g., old files). */
  private assignMissingRootColors(): void {
    const roots = this.store.getRoots();
    const existingIndices = roots
      .map((r) => r.style?.colorIndex)
      .filter((c): c is number => c !== undefined);
    for (const root of roots) {
      if (root.style?.colorIndex === undefined) {
        const colorIndex = nextBranchColorIndex(existingIndices);
        root.style = { ...root.style, colorIndex };
        existingIndices.push(colorIndex);
      }
    }
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

  /** Get the current theme mode ("light", "dark", or "system"). */
  getTheme(): string {
    return this.meta.mode;
  }

  /** Set the theme mode ("light", "dark", or "system"). */
  setTheme(theme: string): void {
    this.meta = { ...this.meta, mode: theme };
    this.themeChangeCallback?.(theme);
    this.notify();
  }

  /** Get the chosen light theme key. */
  getLightTheme(): string {
    return this.meta.lightTheme;
  }

  /** Get the chosen dark theme key. */
  getDarkTheme(): string {
    return this.meta.darkTheme;
  }

  /** Set the preferred light theme by key. */
  setLightTheme(key: string): void {
    this.meta = { ...this.meta, lightTheme: key };
    this.themeChangeCallback?.(this.meta.mode);
    this.notify();
  }

  /** Set the preferred dark theme by key. */
  setDarkTheme(key: string): void {
    this.meta = { ...this.meta, darkTheme: key };
    this.themeChangeCallback?.(this.meta.mode);
    this.notify();
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

  /** Register a callback for save-as requests (Cmd+Shift+S). */
  onSaveAs(cb: () => void): void {
    this.saveAsCallback = cb;
  }

  /** Register a callback for open requests (Cmd+O). */
  onOpen(cb: () => void): void {
    this.openCallback = cb;
  }

  /** Request a save operation (called by dispatch on Cmd+S). */
  requestSave(): void {
    this.saveCallback?.();
  }

  /** Request a save-as operation (called by dispatch on Cmd+Shift+S). */
  requestSaveAs(): void {
    this.saveAsCallback?.();
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

  /** Register a callback for theme changes. */
  onThemeChange(cb: (theme: string) => void): void {
    this.themeChangeCallback = cb;
  }

  /** Register a callback for clear operations. */
  onClear(cb: () => void): void {
    this.clearCallback = cb;
  }

  /** Register a callback for opening links. */
  onOpenLink(cb: (url: string) => void): void {
    this.openLinkCallback = cb;
  }

  /** Extract all links from a node's markdown text. */
  getNodeLinks(nodeId: string): { text: string; url: string }[] {
    const node = this.store.getNode(nodeId);
    const lines = parseMarkdownLines(node.text);
    const links: { text: string; url: string }[] = [];
    for (const segments of lines) {
      for (const seg of segments) {
        if (seg.style.link) {
          links.push({ text: seg.text, url: seg.style.link });
        }
      }
    }
    return links;
  }

  /** Open the first link in a node via the registered callback. */
  openLink(nodeId: string): void {
    const links = this.getNodeLinks(nodeId);
    const first = links[0];
    if (first && this.openLinkCallback) {
      this.openLinkCallback(first.url);
    }
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
    this.ensureNodeVisible(nodeId);
    this.notify();
  }

  deselect(): void {
    this.selectedId = null;
    this.editing = false;
    this.notify();
  }

  // --- EasyMotion ---

  isEasyMotionActive(): boolean {
    return this.easyMotion.active;
  }

  getEasyMotionLabel(nodeId: string): string | undefined {
    return this.easyMotion.byNode.get(nodeId);
  }

  getEasyMotionBuffer(): string {
    return this.easyMotion.buffer;
  }

  enterEasyMotionMode(): void {
    let refX: number;
    let refY: number;
    if (this.selectedId) {
      const sel = this.store.getNode(this.selectedId);
      refX = sel.x + sel.width / 2;
      refY = sel.y + sel.height / 2;
    } else {
      refX = (this.viewportWidth / 2 - this.camera.x) / this.camera.zoom;
      refY = (this.viewportHeight / 2 - this.camera.y) / this.camera.zoom;
    }

    const newState = enterEasyMotion(this.store.getVisibleNodes(), this.selectedId, refX, refY);
    if (!newState.active) return;
    this.easyMotion = newState;
    this.notify();
  }

  exitEasyMotionMode(): void {
    this.easyMotion = initialEasyMotionState();
    this.notify();
  }

  handleEasyMotionKey(key: string): void {
    if (!this.easyMotion.active) return;
    const mode = this.easyMotion.mode;
    const result = easyMotionHandleKey(this.easyMotion, key);
    this.easyMotion = result.state;
    if (result.selectedNodeId) {
      if (mode === "reparent" && this.selectedId) {
        this.reparentNode(this.selectedId, result.selectedNodeId);
      } else {
        this.select(result.selectedNodeId);
      }
    }
    this.notify();
  }

  getEasyMotionMode(): string {
    return this.easyMotion.mode;
  }

  enterEasyMotionReparent(): void {
    if (!this.selectedId) return;

    const selectedNode = this.store.getNode(this.selectedId);
    const refX = selectedNode.x + selectedNode.width / 2;
    const refY = selectedNode.y + selectedNode.height / 2;
    const selectedId = this.selectedId;

    // Filter to valid reparent targets: exclude self, descendants, and current parent
    const candidates = this.store.getVisibleNodes().filter((n) => {
      if (n.id === selectedId) return false;
      if (this.store.isDescendant(n.id, selectedId)) return false;
      if (n.id === selectedNode.parentId) return false;
      return true;
    });

    const newState = enterEasyMotion(candidates, null, refX, refY, "reparent");
    if (!newState.active) return;
    this.easyMotion = newState;
    this.notify();
  }

  reparentNode(nodeId: string, newParentId: string): void {
    const node = this.store.getNode(nodeId);
    const oldParentId = node.parentId;

    this.pushUndo("reparent");

    // Uncollapse target so the reparented node is visible
    const target = this.store.getNode(newParentId);
    if (target.collapsed) {
      target.collapsed = false;
    }

    this.store.moveNode(nodeId, newParentId);
    this.clearSubtreeColors(nodeId);
    positionNewChild(this.store, nodeId);
    reflowSubtree(this.store, nodeId);
    relayoutSubtree(this.store, nodeId);
    relayoutFromNode(this.store, nodeId);

    if (oldParentId) {
      relayoutFromNode(this.store, oldParentId);
    }

    this.ensureNodesVisible([nodeId, newParentId]);
    this.notify();
  }

  // --- Edit mode ---

  enterEditMode(): void {
    if (this.selectedId === null) return;
    this.editing = true;
    this.remeasureNode(this.selectedId);
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
      } else {
        // Remeasure with rendered markdown (literal=false) now that editing ended
        this.remeasureNode(this.selectedId);
      }
    }
    this.notify();
  }

  // --- Mutations (all tracked for undo) ---

  /** Clear all nodes, resetting to an empty canvas. Undoable. */
  clear(): void {
    this.pushUndo("clear");
    this.store = new MindMapStore();
    this.meta = { ...this.meta, id: `limn-${Date.now()}` };
    this.selectedId = null;
    this.editing = false;
    this.clearCallback?.();
    this.notify();
  }

  addRoot(text = "", x = 0, y = 0): string {
    this.pushUndo("add-root");
    const id = this.store.addRoot(text, x, y);
    // Auto-assign a branch colorIndex from the palette
    const existingIndices = this.store.getRoots()
      .filter((r) => r.id !== id)
      .map((r) => r.style?.colorIndex)
      .filter((c): c is number => c !== undefined);
    const node = this.store.getNode(id);
    node.style = { ...node.style, colorIndex: nextBranchColorIndex(existingIndices) };
    this.remeasureNode(id);
    this.selectedId = id;
    this.editing = true;
    this.ensureNodeVisible(id);
    this.notify();
    return id;
  }

  addChild(parentId: string, text = "", direction?: number): string {
    this.pushUndo("add-child");
    const parent = this.store.getNode(parentId);
    if (parent.collapsed) {
      this.store.toggleCollapse(parentId);
      relayoutFromNode(this.store, parentId);
    }
    const id = this.store.addChild(parentId, text);
    this.remeasureNode(id);
    positionNewChild(this.store, id, direction);
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
    // Auto-assign a branch colorIndex like new roots get
    const existingIndices = this.store.getRoots()
      .filter((r) => r.id !== nodeId)
      .map((r) => r.style?.colorIndex)
      .filter((c): c is number => c !== undefined);
    const detached = this.store.getNode(nodeId);
    detached.style = { ...detached.style, colorIndex: nextBranchColorIndex(existingIndices) };
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

  nudgeNode(nodeId: string, dx: number, dy: number): void {
    const squashLabel = `nudge:${nodeId}`;
    if (this.lastUndoLabel !== squashLabel) {
      this.pushUndo(squashLabel);
    }
    moveSubtree(this.store, nodeId, dx, dy);
    this.ensureNodeVisible(nodeId);
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

  reflowChildren(nodeId: string): void {
    const node = this.store.getNode(nodeId);
    if (node.children.length === 0) return;
    this.pushUndo("reflow-children");
    reflowSubtree(this.store, nodeId);       // fix x-positions
    relayoutSubtree(this.store, nodeId);     // re-center y bottom-up
    relayoutFromNode(this.store, nodeId);    // cascade up ancestors
    this.resolveOverlapForNode(nodeId);      // push other trees
    this.notify();
  }

  reorderNode(nodeId: string, direction: "up" | "down"): void {
    this.pushUndo("reorder-node");
    this.store.reorderNode(nodeId, direction);
    relayoutFromNode(this.store, nodeId);
    this.ensureNodeVisible(nodeId);
    this.notify();
  }

  /** Structural move: reorder, overflow to parent's sibling, outdent, or indent. */
  moveNode(nodeId: string, direction: "up" | "down" | "left" | "right"): void {
    const node = this.store.getNode(nodeId);

    if (node.parentId === null) {
      // Root nodes: spatial search to reparent in the given direction
      this.spatialReparent(nodeId, direction);
      return;
    }

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
    if (grandparentId !== null) {
      const grandparent = this.store.getNode(grandparentId);
      const parentIdx = grandparent.children.indexOf(parent.id);

      const targetIdx = direction === "up" ? parentIdx - 1 : parentIdx + 1;
      const targetParentId = grandparent.children[targetIdx];
      if (targetParentId !== undefined) {
        this.pushUndo("move-node");
        const insertIndex = direction === "up"
          ? this.store.getNode(targetParentId).children.length // Last child
          : 0; // First child
        this.store.moveNode(nodeId, targetParentId, insertIndex);
        this.clearSubtreeColors(nodeId);
        positionNewChild(this.store, nodeId);
        reflowSubtree(this.store, nodeId);
        relayoutFromNode(this.store, nodeId);
        // Re-layout old parent too
        relayoutFromNode(this.store, parent.id);
        this.ensureNodesVisible([nodeId, targetParentId]);
        this.notify();
        return;
      }
    }

    // Spatial reparent fallback: no uncle available
    this.spatialReparent(nodeId, direction);
  }

  private moveNodeHorizontal(nodeId: string, direction: "left" | "right"): void {
    const node = this.store.getNode(nodeId);
    if (node.parentId === null) return;

    const dir = branchDirection(this.store, nodeId);
    // On right-side branch: left = toward parent, right = away from parent
    // On left-side branch: right = toward parent, left = away from parent
    const towardParent = (dir === 1 && direction === "left") || (dir === -1 && direction === "right");

    if (towardParent) {
      const parent = this.store.getNode(node.parentId);
      if (parent.parentId === null) {
        // Parent is root: flip to other side
        this.flipBranchSide(nodeId);
      } else {
        this.outdentNode(nodeId);
      }
    } else {
      // Away from parent
      const parent = this.store.getNode(node.parentId);
      const idx = parent.children.indexOf(nodeId);
      if (idx > 0) {
        this.indentNode(nodeId);
      } else {
        // No previous sibling: spatial reparent
        this.spatialReparentHorizontal(nodeId, direction);
      }
    }
  }

  private spatialReparent(nodeId: string, direction: "up" | "down" | "left" | "right"): void {
    const target = findSpatialReparentTarget(this.store, nodeId, direction);
    if (!target) return;

    const node = this.store.getNode(nodeId);
    const oldParentId = node.parentId;

    this.pushUndo("move-node");
    if (target.collapsed) {
      target.collapsed = false;
    }

    if (direction === "up" || direction === "down") {
      const insertIndex = direction === "up" ? target.children.length : 0;
      this.store.moveNode(nodeId, target.id, insertIndex);
      positionNewChild(this.store, nodeId);
    } else {
      const directionHint = direction === "right" ? -1 : 1;
      this.store.moveNode(nodeId, target.id);
      positionNewChild(this.store, nodeId, directionHint);
    }

    this.clearSubtreeColors(nodeId);
    reflowSubtree(this.store, nodeId);
    relayoutSubtree(this.store, nodeId);
    relayoutFromNode(this.store, nodeId);
    if (oldParentId) {
      relayoutFromNode(this.store, oldParentId);
    }
    this.ensureNodesVisible([nodeId, target.id]);
    this.notify();
  }

  private flipBranchSide(nodeId: string): void {
    const node = this.store.getNode(nodeId);
    if (node.parentId === null) return;

    const parent = this.store.getNode(node.parentId);
    const currentDir = branchDirection(this.store, nodeId);

    this.pushUndo("move-node");
    const newX = childXFromParent(parent.x, parent.width, -currentDir);
    this.store.setNodePosition(nodeId, newX, node.y);
    reflowSubtree(this.store, nodeId);
    relayoutFromNode(this.store, nodeId);
    this.ensureNodeVisible(nodeId);
    this.notify();
  }

  private spatialReparentHorizontal(nodeId: string, direction: "left" | "right"): void {
    this.spatialReparent(nodeId, direction);
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
    this.clearSubtreeColors(nodeId);
    positionNewChild(this.store, nodeId);
    reflowSubtree(this.store, nodeId);
    relayoutFromNode(this.store, nodeId);
    // Re-layout old parent too
    relayoutFromNode(this.store, parent.id);
    this.ensureNodesVisible([nodeId, grandparentId]);
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
    this.clearSubtreeColors(nodeId);
    positionNewChild(this.store, nodeId);
    reflowSubtree(this.store, nodeId);
    relayoutFromNode(this.store, nodeId);
    // Re-layout old parent too
    relayoutFromNode(this.store, parent.id);
    this.ensureNodesVisible([nodeId, prevSiblingId]);
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
    const target = findVerticalTarget(this.store, this.selectedId, "up");
    if (target) { this.selectedId = target.id; this.ensureNodeVisible(target.id); this.notify(); }
  }

  navigateDown(): void {
    if (this.selectedId === null) { this.selectNearestToViewportCenter(); return; }
    const target = findVerticalTarget(this.store, this.selectedId, "down");
    if (target) { this.selectedId = target.id; this.ensureNodeVisible(target.id); this.notify(); }
  }

  navigateLeft(): void {
    if (this.selectedId === null) { this.selectNearestToViewportCenter(); return; }
    const result = findHorizontalTarget(this.store, this.selectedId, "left");
    if (result.targetId === null) return;
    if (result.shouldExpand) this.toggleCollapse(this.selectedId);
    this.selectedId = result.targetId;
    this.ensureNodeVisible(result.targetId);
    this.notify();
  }

  navigateRight(): void {
    if (this.selectedId === null) { this.selectNearestToViewportCenter(); return; }
    const result = findHorizontalTarget(this.store, this.selectedId, "right");
    if (result.targetId === null) return;
    if (result.shouldExpand) this.toggleCollapse(this.selectedId);
    this.selectedId = result.targetId;
    this.ensureNodeVisible(result.targetId);
    this.notify();
  }

  // --- Drag ---

  isDragging(): boolean {
    return this.drag.active;
  }

  getReparentTarget(): string | null {
    return this.drag.reparentTargetId;
  }

  startDrag(nodeId: string, worldX: number, worldY: number): void {
    if (this.editing) this.exitEditMode();
    this.pushUndo("drag");
    this.selectedId = nodeId;
    this.drag = initDrag(this.store.getNode(nodeId), worldX, worldY);
    this.notify();
  }

  updateDrag(worldX: number, worldY: number): void {
    this.drag = computeDragUpdate(this.store, this.drag, worldX, worldY);
    this.notify();
  }

  endDrag(): void {
    if (!this.drag.active || this.drag.nodeId === null) {
      this.drag = initialDragState();
      return;
    }

    const nodeId = this.drag.nodeId;

    if (this.drag.reparentTargetId !== null) {
      // Reparent the node and reposition entire subtree as child of target
      const oldX = this.store.getNode(nodeId).x;
      const oldY = this.store.getNode(nodeId).y;
      this.store.moveNode(nodeId, this.drag.reparentTargetId);
      this.clearSubtreeColors(nodeId);
      positionNewChild(this.store, nodeId);
      const newNode = this.store.getNode(nodeId);
      const dx = newNode.x - oldX;
      const dy = newNode.y - oldY;
      for (const childId of newNode.children) {
        moveSubtree(this.store, childId, dx, dy);
      }
      reflowSubtree(this.store, nodeId);
      relayoutSubtree(this.store, nodeId);
      relayoutFromNode(this.store, nodeId);
      this.ensureNodesVisible([nodeId, this.drag.reparentTargetId]);
    } else if (this.drag.moved) {
      // Reflow children if node was dragged to the other side of its root
      reflowSubtree(this.store, nodeId);
      // Snap to correct layout position after sibling reorder
      if (this.drag.reordered) {
        relayoutFromNode(this.store, nodeId);
      }
    }

    if (!this.drag.moved && this.drag.reparentTargetId === null) {
      // No movement and no reparent: pop the undo entry (no-op drag)
      this.undoStack.pop();
    }

    this.drag = initialDragState();
    this.notify();
  }

  // --- Width resize ---

  isResizingWidth(): boolean {
    return this.widthResize.active;
  }

  startWidthResize(nodeId: string): void {
    this.pushUndo("resize-width");
    this.widthResize = initWidthResize(this.store.getNode(nodeId));
    this.notify();
  }

  updateWidthResize(newWidth: number): void {
    if (!this.widthResize.active || this.widthResize.nodeId === null) return;
    this.store.setNodeWidth(this.widthResize.nodeId, clampNodeWidth(newWidth));
    this.remeasureNode(this.widthResize.nodeId);
    this.widthResize.changed = true;
    this.notify();
  }

  endWidthResize(): void {
    if (!this.widthResize.active) return;
    if (!this.widthResize.changed) this.undoStack.pop();
    this.widthResize = initialWidthResizeState();
    this.notify();
  }

  // --- Image resize ---

  isResizingImage(): boolean {
    return this.imageResize.active;
  }

  startImageResize(nodeId: string): void {
    const state = initImageResize(this.store.getNode(nodeId));
    if (!state) return;
    this.pushUndo("resize-image");
    this.imageResize = state;
    this.notify();
  }

  updateImageResize(newWidth: number): void {
    if (!this.imageResize.active || this.imageResize.nodeId === null) return;
    const node = this.store.getNode(this.imageResize.nodeId);
    if (!node.image) return;
    const dims = computeImageResize(this.imageResize.aspectRatio, newWidth);
    node.image = { ...node.image, ...dims };
    this.imageResize.changed = true;
    this.notify();
  }

  endImageResize(): void {
    if (!this.imageResize.active) return;
    if (!this.imageResize.changed) this.undoStack.pop();
    this.imageResize = initialImageResizeState();
    this.notify();
  }

  // --- Undo/redo ---

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

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
    // Auto-assign branch colors to roots that lack them (old files)
    this.assignMissingRootColors();
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
    const paddingX = this.viewportWidth * VIEWPORT_SCROLL_MARGIN;
    const paddingY = this.viewportHeight * VIEWPORT_SCROLL_MARGIN;
    const zoom = this.camera.zoom;

    // Node bounding box in screen coordinates
    const screenLeft = node.x * zoom + this.camera.x;
    const screenTop = node.y * zoom + this.camera.y;
    const screenRight = screenLeft + node.width * zoom;
    const screenBottom = screenTop + node.height * zoom;

    let dx = 0;
    let dy = 0;

    if (screenRight > this.viewportWidth - paddingX) {
      dx = (this.viewportWidth - paddingX) - screenRight;
    } else if (screenLeft < paddingX) {
      dx = paddingX - screenLeft;
    }

    if (screenBottom > this.viewportHeight - paddingY) {
      dy = (this.viewportHeight - paddingY) - screenBottom;
    } else if (screenTop < paddingY) {
      dy = paddingY - screenTop;
    }

    if (dx !== 0 || dy !== 0) {
      this.camera = {
        x: this.camera.x + dx,
        y: this.camera.y + dy,
        zoom: this.camera.zoom,
      };
    }
  }

  /** Pan the camera minimally to bring multiple nodes on-screen. */
  private ensureNodesVisible(nodeIds: string[]): void {
    if (this.viewportWidth === 0 || this.viewportHeight === 0) return;
    if (nodeIds.length === 0) return;

    const paddingX = this.viewportWidth * VIEWPORT_SCROLL_MARGIN;
    const paddingY = this.viewportHeight * VIEWPORT_SCROLL_MARGIN;
    const zoom = this.camera.zoom;

    // Compute union bounding box in screen coordinates
    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;

    for (const id of nodeIds) {
      const node = this.store.getNode(id);
      const sl = node.x * zoom + this.camera.x;
      const st = node.y * zoom + this.camera.y;
      minLeft = Math.min(minLeft, sl);
      minTop = Math.min(minTop, st);
      maxRight = Math.max(maxRight, sl + node.width * zoom);
      maxBottom = Math.max(maxBottom, st + node.height * zoom);
    }

    let dx = 0;
    let dy = 0;

    if (maxRight > this.viewportWidth - paddingX) {
      dx = (this.viewportWidth - paddingX) - maxRight;
    } else if (minLeft < paddingX) {
      dx = paddingX - minLeft;
    }

    if (maxBottom > this.viewportHeight - paddingY) {
      dy = (this.viewportHeight - paddingY) - maxBottom;
    } else if (minTop < paddingY) {
      dy = paddingY - minTop;
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
    const best = findNearestToViewportCenter(this.store, this.viewportWidth, this.viewportHeight, this.camera);
    if (best) {
      this.selectedId = best;
      this.notify();
    }
  }

  /** Clear style.colorIndex from a node and all its descendants so they
   *  inherit the branch color of their new parent after reparenting. */
  private clearSubtreeColors(nodeId: string): void {
    const node = this.store.getNode(nodeId);
    if (node.style?.colorIndex !== undefined) {
      const rest = { ...node.style };
      delete rest.colorIndex;
      node.style = Object.keys(rest).length > 0 ? rest : undefined;
    }
    for (const childId of node.children) {
      this.clearSubtreeColors(childId);
    }
  }

  /** Update a node's dimensions using the text measurer. */
  private remeasureNode(nodeId: string): void {
    const node = this.store.getNode(nodeId);
    const style = node.parentId === null
      ? { ...node.style, fontSize: node.style?.fontSize ?? ROOT_FONT_SIZE, fontWeight: node.style?.fontWeight ?? 600 }
      : node.style;
    const literal = this.editing && nodeId === this.selectedId;
    if (node.widthConstrained) {
      const { height } = this.textMeasurer.reflow(node.text, node.width, style, literal);
      node.height = height;
    } else {
      const { width, height } = this.textMeasurer.measure(node.text, style, literal);
      node.width = width;
      node.height = height;
    }
    // Include image height in node dimensions
    if (node.image) {
      node.height += node.image.height;
    }
  }

  /** Remeasure all nodes using the current text measurer. */
  remeasureAllNodes(): void {
    for (const root of this.store.getRoots()) {
      const visit = (nodeId: string) => {
        this.remeasureNode(nodeId);
        const node = this.store.getNode(nodeId);
        for (const childId of node.children) visit(childId);
      };
      visit(root.id);
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
