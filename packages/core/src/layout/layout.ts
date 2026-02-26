// ABOUTME: Incremental layout engine for mind map trees.
// ABOUTME: Handles vertical centering, sibling shifting, and cross-tree overlap.

import type { MindMapStore } from "../store/MindMapStore";

export const H_OFFSET = 250;
export const V_GAP = 20;

/**
 * Compute the visible subtree height of a node.
 * This is the total vertical space needed to render a node and all
 * its visible descendants (respecting collapsed state).
 */
export function subtreeHeight(store: MindMapStore, nodeId: string): number {
  const node = store.getNode(nodeId);

  if (node.collapsed || node.children.length === 0) {
    return node.height;
  }

  let totalChildrenHeight = 0;
  for (const childId of node.children) {
    totalChildrenHeight += subtreeHeight(store, childId);
  }
  totalChildrenHeight += V_GAP * (node.children.length - 1);

  return Math.max(node.height, totalChildrenHeight);
}

/**
 * Determine the branch direction for a node.
 * Returns 1 for right-side branches, -1 for left-side branches.
 * Direction is inferred from stored positions.
 */
export function branchDirection(store: MindMapStore, nodeId: string): number {
  const node = store.getNode(nodeId);
  if (node.parentId === null) return 1; // Default for roots

  const parent = store.getNode(node.parentId);
  return node.x >= parent.x ? 1 : -1;
}

/**
 * Position a new child node relative to its parent.
 * Handles horizontal offset and vertical centering among siblings.
 */
export function positionNewChild(store: MindMapStore, childId: string): void {
  const child = store.getNode(childId);
  if (child.parentId === null) return;

  const parent = store.getNode(child.parentId);
  const siblings = store.getChildren(child.parentId);

  // Determine direction: from existing siblings, or from parent's branch direction
  let direction = 1;
  const firstSibling = siblings.filter((s) => s.id !== childId)[0];
  if (firstSibling) {
    direction = branchDirection(store, firstSibling.id);
  } else {
    // No existing siblings: infer direction from parent's branch
    direction = branchDirection(store, child.parentId);
  }

  // Horizontal: fixed offset in branch direction
  const x = parent.x + H_OFFSET * direction;
  store.setNodePosition(childId, x, parent.y);

  // Now re-center all siblings vertically
  centerChildren(store, child.parentId);
}

/**
 * Position a new sibling node below the reference node.
 * Then re-center all siblings.
 */
export function positionNewSibling(
  store: MindMapStore,
  siblingId: string,
  referenceId: string,
): void {
  const ref = store.getNode(referenceId);
  store.setNodePosition(siblingId, ref.x, ref.y + ref.height + V_GAP);
  const sibling = store.getNode(siblingId);
  if (sibling.parentId !== null) {
    centerChildren(store, sibling.parentId);
  }
}

/**
 * Re-center all children of a parent around the parent's y coordinate.
 * Each child occupies space equal to its subtree height.
 * Children (and their subtrees) are shifted as rigid units.
 */
export function centerChildren(store: MindMapStore, parentId: string): void {
  const parent = store.getNode(parentId);
  const children = store.getChildren(parentId);

  if (children.length === 0) return;

  // Compute subtree heights for each child
  const heights = children.map((c) => subtreeHeight(store, c.id));

  // Total height = sum of subtree heights + gaps
  const totalHeight =
    heights.reduce((sum, h) => sum + h, 0) + V_GAP * (children.length - 1);

  // Start position: centered on parent's visual center
  const parentCenter = parent.y + parent.height / 2;
  let currentY = parentCenter - totalHeight / 2;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childHeight = heights[i];
    if (!child || childHeight === undefined) continue;

    // The child's y is at the center of its subtree band
    const targetY = currentY + childHeight / 2 - child.height / 2;
    const deltaY = targetY - child.y;

    if (Math.abs(deltaY) > 0.001) {
      shiftSubtree(store, child.id, deltaY);
    }

    currentY += childHeight + V_GAP;
  }
}

/**
 * Shift a node and all its descendants by a y delta.
 * Moves the entire subtree as a rigid unit.
 */
export function shiftSubtree(
  store: MindMapStore,
  nodeId: string,
  deltaY: number,
): void {
  const node = store.getNode(nodeId);
  store.setNodePosition(nodeId, node.x, node.y + deltaY);

  for (const childId of node.children) {
    shiftSubtree(store, childId, deltaY);
  }
}

/**
 * Re-layout after a structural change (add/delete/collapse).
 * Walks up from the changed node to the root, re-centering children
 * at each level.
 */
export function relayoutFromNode(store: MindMapStore, nodeId: string): void {
  let currentId: string | null = nodeId;

  // Walk up to root, collecting ancestors
  const ancestors: string[] = [];
  while (currentId !== null) {
    const node = store.getNode(currentId);
    if (node.parentId !== null) {
      ancestors.push(node.parentId);
    }
    currentId = node.parentId;
  }

  // Re-center from bottom up
  for (const ancestorId of ancestors) {
    centerChildren(store, ancestorId);
  }
}

/**
 * Re-layout after deleting a node. We need the parent ID since
 * the node is already deleted.
 */
export function relayoutAfterDelete(
  store: MindMapStore,
  parentId: string,
): void {
  centerChildren(store, parentId);

  // Walk up to root
  let currentId: string | null = parentId;
  while (currentId !== null) {
    const node = store.getNode(currentId);
    if (node.parentId !== null) {
      centerChildren(store, node.parentId);
    }
    currentId = node.parentId;
  }
}

/**
 * Compute the bounding box of a root tree (all visible descendants).
 */
export function treeBoundingBox(
  store: MindMapStore,
  rootId: string,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function visit(nodeId: string): void {
    const node = store.getNode(nodeId);
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);

    if (!node.collapsed) {
      for (const childId of node.children) {
        visit(childId);
      }
    }
  }

  visit(rootId);
  return { minX, minY, maxX, maxY };
}

const TREE_PADDING = 40;

/**
 * Check and resolve overlap between root trees.
 * After modifying a tree (changedRootId), check if any other tree
 * overlaps and push it away.
 */
export function resolveTreeOverlap(
  store: MindMapStore,
  changedRootId: string,
): void {
  const roots = store.getRoots();
  if (roots.length < 2) return;

  const changedBox = treeBoundingBox(store, changedRootId);

  for (const otherRoot of roots) {
    if (otherRoot.id === changedRootId) continue;

    const otherBox = treeBoundingBox(store, otherRoot.id);

    // Check overlap
    const overlapX =
      changedBox.maxX > otherBox.minX && changedBox.minX < otherBox.maxX;
    const overlapY =
      changedBox.maxY > otherBox.minY && changedBox.minY < otherBox.maxY;

    if (overlapX && overlapY) {
      // Push other tree away vertically
      const changedCenterY = (changedBox.minY + changedBox.maxY) / 2;
      const otherCenterY = (otherBox.minY + otherBox.maxY) / 2;

      if (otherCenterY >= changedCenterY) {
        // Other tree is below: push down
        const pushAmount =
          changedBox.maxY - otherBox.minY + TREE_PADDING;
        shiftSubtree(store, otherRoot.id, pushAmount);
      } else {
        // Other tree is above: push up
        const pushAmount =
          otherBox.maxY - changedBox.minY + TREE_PADDING;
        shiftSubtree(store, otherRoot.id, -pushAmount);
      }
    }
  }
}
