// ABOUTME: Drag-to-reposition, drag-to-reorder, and drag-to-reparent logic.
// ABOUTME: Pure functions operating on DragState with MindMapStore mutations.

import type { MindMapNode } from "../model/types";
import type { MindMapStore } from "../store/MindMapStore";
import { centerChildren } from "../layout/layout";

/** Consolidated drag state. */
export interface DragState {
  active: boolean;
  nodeId: string | null;
  offset: { x: number; y: number };
  moved: boolean;
  reordered: boolean;
  reparentTargetId: string | null;
}

export function initialDragState(): DragState {
  return {
    active: false,
    nodeId: null,
    offset: { x: 0, y: 0 },
    moved: false,
    reordered: false,
    reparentTargetId: null,
  };
}

/** Initialize drag from a node at a world position. */
export function initDrag(node: MindMapNode, worldX: number, worldY: number): DragState {
  return {
    active: true,
    nodeId: node.id,
    offset: { x: worldX - node.x, y: worldY - node.y },
    moved: false,
    reordered: false,
    reparentTargetId: null,
  };
}

/** Move a node and all its descendants by a delta. */
export function moveSubtree(store: MindMapStore, nodeId: string, dx: number, dy: number): void {
  const node = store.getNode(nodeId);
  store.setNodePosition(nodeId, node.x + dx, node.y + dy);
  for (const childId of node.children) {
    moveSubtree(store, childId, dx, dy);
  }
}

/** Update drag position, check for reorder and reparent.
 *  Returns the updated DragState. Mutates store positions. */
export function computeDragUpdate(
  store: MindMapStore,
  state: DragState,
  worldX: number,
  worldY: number,
): DragState {
  if (!state.active || state.nodeId === null) return state;

  const node = store.getNode(state.nodeId);
  const newX = worldX - state.offset.x;
  const newY = worldY - state.offset.y;
  const dx = newX - node.x;
  const dy = newY - node.y;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return state;

  // Move the node and its entire subtree
  moveSubtree(store, state.nodeId, dx, dy);

  // Check for sibling reorder (non-root nodes only)
  let reordered = state.reordered;
  if (node.parentId !== null) {
    if (checkDragReorder(store, state.nodeId)) {
      reordered = true;
    }
  }

  // Check for reparent proximity
  const reparentTargetId = findReparentTarget(store, state.nodeId);

  return { ...state, moved: true, reordered, reparentTargetId };
}

/** Check if the dragged node has crossed an adjacent sibling and swap if so.
 *  Returns true if any swap occurred. */
export function checkDragReorder(store: MindMapStore, draggedId: string): boolean {
  const dragged = store.getNode(draggedId);
  if (dragged.parentId === null) return false;

  const parent = store.getNode(dragged.parentId);
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
      const below = store.getNode(belowId);
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
      const above = store.getNode(aboveId);
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

  if (!didSwap) return false;

  // Reposition non-dragged siblings: save dragged position, re-center, restore dragged
  const savedX = dragged.x;
  const savedY = dragged.y;
  centerChildren(store, dragged.parentId);
  const afterCenter = store.getNode(draggedId);
  const dx = savedX - afterCenter.x;
  const dy = savedY - afterCenter.y;
  if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
    moveSubtree(store, draggedId, dx, dy);
  }

  return true;
}

/** Find a reparent target: the node whose bounding box contains the dragged node's center. */
export function findReparentTarget(store: MindMapStore, draggedId: string): string | null {
  const dragged = store.getNode(draggedId);
  const draggedCenterX = dragged.x + dragged.width / 2;
  const draggedCenterY = dragged.y + dragged.height / 2;

  for (const node of store.getVisibleNodes()) {
    if (node.id === draggedId) continue;
    // Cannot reparent to own descendant
    if (store.isDescendant(node.id, draggedId)) continue;
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
