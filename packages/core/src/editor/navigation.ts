// ABOUTME: Spatial navigation functions for mind map node selection.
// ABOUTME: Handles arrow-key traversal with sibling priority and spatial fallback.

import type { MindMapNode, Camera } from "../model/types";
import type { MindMapStore } from "../store/MindMapStore";
import { branchDirection } from "../layout/layout";

/** Weight applied to cross-axis distance in spatial fallback navigation.
 *  Higher values strongly prefer nodes aligned on the primary axis. */
const CROSS_AXIS_WEIGHT = 10;

/** Get siblings filtered to the same side when parent is a root node.
 *  For non-root parents, returns all siblings. */
export function sameSideSiblings(store: MindMapStore, nodeId: string): MindMapNode[] {
  const node = store.getNode(nodeId);
  if (node.parentId === null) {
    return store.getRoots();
  }
  const parent = store.getNode(node.parentId);
  const siblings = store.getChildren(node.parentId);
  // Only filter by side when parent is a root
  if (parent.parentId !== null) return siblings;
  const nodeIsLeft = node.x < parent.x;
  return siblings.filter((s) => (s.x < parent.x) === nodeIsLeft);
}

/** Find the child nearest in y to a reference y-center. */
export function nearestChildByY(children: MindMapNode[], refCenterY: number): MindMapNode | null {
  let best: MindMapNode | null = null;
  let bestDist = Infinity;
  for (const child of children) {
    const dist = Math.abs(child.y + child.height / 2 - refCenterY);
    if (dist < bestDist) {
      best = child;
      bestDist = dist;
    }
  }
  return best;
}

/** Spatial fallback: find the nearest visible node in the given direction
 *  using a weighted distance score (primaryAxisDist + crossAxisDist * CROSS_AXIS_WEIGHT). */
export function spatialFallback(
  store: MindMapStore,
  selectedId: string,
  direction: "up" | "down" | "left" | "right",
): MindMapNode | null {
  const current = store.getNode(selectedId);
  const cx = current.x + current.width / 2;
  const cy = current.y + current.height / 2;

  let best: MindMapNode | null = null;
  let bestScore = Infinity;

  for (const node of store.getVisibleNodes()) {
    if (node.id === selectedId) continue;
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

/** Find the vertical navigation target (up or down) among same-side siblings,
 *  falling back to spatial search. */
export function findVerticalTarget(
  store: MindMapStore,
  selectedId: string,
  direction: "up" | "down",
): MindMapNode | null {
  const current = store.getNode(selectedId);
  const currentCenterY = current.y + current.height / 2;
  const goingUp = direction === "up";

  let best: MindMapNode | null = null;

  // Root nodes use spatial search directly (siblings can be anywhere on the canvas)
  if (current.parentId !== null) {
    // Navigate among same-side siblings for non-root nodes
    const siblings = sameSideSiblings(store, selectedId);
    let bestCenterY = goingUp ? -Infinity : Infinity;
    for (const sib of siblings) {
      if (sib.id === selectedId) continue;
      const sibCenterY = sib.y + sib.height / 2;
      const isInDirection = goingUp
        ? sibCenterY < currentCenterY
        : sibCenterY > currentCenterY;
      if (!isInDirection) continue;
      const isBetter = goingUp
        ? sibCenterY > bestCenterY
        : sibCenterY < bestCenterY;
      if (isBetter) {
        best = sib;
        bestCenterY = sibCenterY;
      }
    }
  }

  if (!best) best = spatialFallback(store, selectedId, direction);
  return best;
}

/** Result of horizontal navigation. */
export interface HorizontalNavResult {
  targetId: string | null;
  shouldExpand: boolean;
}

/** Find the horizontal navigation target (left or right).
 *  Returns shouldExpand=true when navigating into a collapsed node's children. */
export function findHorizontalTarget(
  store: MindMapStore,
  selectedId: string,
  direction: "left" | "right",
): HorizontalNavResult {
  const current = store.getNode(selectedId);
  const currentCenterY = current.y + current.height / 2;
  const goingLeft = direction === "left";

  if (current.parentId === null) {
    // Root node: go to nearest child on the requested side
    const children = store.getChildren(selectedId);
    const sideChildren = goingLeft
      ? children.filter((c) => c.x < current.x)
      : children.filter((c) => c.x >= current.x);
    const target = nearestChildByY(sideChildren, currentCenterY);
    if (target) {
      return { targetId: target.id, shouldExpand: current.collapsed };
    }
    // No children on that side: spatial fallback
    const fallback = spatialFallback(store, selectedId, direction);
    return { targetId: fallback?.id ?? null, shouldExpand: false };
  }

  // Non-root: direction depends on branch side
  const dir = branchDirection(store, selectedId);
  const towardParent = (dir >= 0 && goingLeft) || (dir < 0 && !goingLeft);

  if (towardParent) {
    return { targetId: current.parentId, shouldExpand: false };
  }

  // Toward children
  const children = store.getChildren(selectedId);
  const target = nearestChildByY(children, currentCenterY);
  if (target) {
    return { targetId: target.id, shouldExpand: current.collapsed };
  }
  // Leaf node: spatial fallback
  const fallback = spatialFallback(store, selectedId, direction);
  return { targetId: fallback?.id ?? null, shouldExpand: false };
}

/** Find the visible node closest to the viewport center. */
export function findNearestToViewportCenter(
  store: MindMapStore,
  viewportWidth: number,
  viewportHeight: number,
  camera: Camera,
): string | null {
  const visible = store.getVisibleNodes();
  if (visible.length === 0) return null;

  // Viewport center in world coordinates
  const worldCenterX = (viewportWidth / 2 - camera.x) / camera.zoom;
  const worldCenterY = (viewportHeight / 2 - camera.y) / camera.zoom;

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

  return best;
}
