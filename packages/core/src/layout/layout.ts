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
export function positionNewChild(store: MindMapStore, childId: string, directionHint?: number): void {
  const child = store.getNode(childId);
  if (child.parentId === null) return;

  const parent = store.getNode(child.parentId);
  const siblings = store.getChildren(child.parentId);

  // Determine direction: explicit hint, existing siblings, or parent's branch direction
  let direction = directionHint ?? 0;
  if (!direction) {
    const firstSibling = siblings.filter((s) => s.id !== childId)[0];
    if (firstSibling) {
      direction = branchDirection(store, firstSibling.id);
    } else {
      direction = branchDirection(store, child.parentId);
    }
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
 * Partition children of a node into left and right groups based on x-position.
 */
function partitionChildrenBySide(
  store: MindMapStore,
  parentId: string,
): { left: ReturnType<MindMapStore["getChildren"]>; right: ReturnType<MindMapStore["getChildren"]> } {
  const parent = store.getNode(parentId);
  const children = store.getChildren(parentId);
  const left = children.filter((c) => c.x < parent.x);
  const right = children.filter((c) => c.x >= parent.x);
  return { left, right };
}

/**
 * Center a group of children around a parent's y coordinate.
 * Each child occupies space equal to its subtree height.
 * Children (and their subtrees) are shifted as rigid units.
 */
function centerChildGroup(
  store: MindMapStore,
  parent: ReturnType<MindMapStore["getNode"]>,
  children: ReturnType<MindMapStore["getChildren"]>,
): void {
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
 * Re-center all children of a parent around the parent's y coordinate.
 * When the parent is a root, left and right children are centered independently.
 * When the parent is non-root, all children are centered as one group.
 */
export function centerChildren(store: MindMapStore, parentId: string): void {
  const parent = store.getNode(parentId);
  const children = store.getChildren(parentId);

  if (children.length === 0) return;

  if (parent.parentId === null) {
    // Root: center left and right groups independently
    const { left, right } = partitionChildrenBySide(store, parentId);
    centerChildGroup(store, parent, left);
    centerChildGroup(store, parent, right);
  } else {
    centerChildGroup(store, parent, children);
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
 * Optionally constrained to nodes whose x-range intersects [clipMinX, clipMaxX].
 */
export function treeBoundingBox(
  store: MindMapStore,
  rootId: string,
  clipMinX?: number,
  clipMaxX?: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const clipping = clipMinX !== undefined && clipMaxX !== undefined;

  function visit(nodeId: string): void {
    const node = store.getNode(nodeId);
    const nodeRight = node.x + node.width;

    // If clipping, skip nodes outside the x range
    if (!clipping || (nodeRight > clipMinX && node.x < clipMaxX)) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, nodeRight);
      maxY = Math.max(maxY, node.y + node.height);
    }

    if (!node.collapsed) {
      for (const childId of node.children) {
        visit(childId);
      }
    }
  }

  visit(rootId);
  return { minX, minY, maxX, maxY };
}

/**
 * Reflow a node's descendants so children are on the correct side
 * based on the node's current branch direction.
 * Called after dragging a node to the other side of its root.
 */
export function reflowSubtree(store: MindMapStore, nodeId: string): void {
  const node = store.getNode(nodeId);
  const children = store.getChildren(nodeId);
  if (children.length === 0) return;

  const dir = branchDirection(store, nodeId);

  for (const child of children) {
    const expectedX = node.x + H_OFFSET * dir;
    if (Math.abs(child.x - expectedX) > 0.001) {
      store.setNodePosition(child.id, expectedX, child.y);
    }
    // Recursively reflow grandchildren
    reflowSubtree(store, child.id);
  }
}

const TREE_PADDING = 40;

/**
 * Check and resolve overlap between root trees.
 * After modifying a tree (changedRootId), check if any other tree
 * overlaps and push it away.
 *
 * Uses the shared x-range between trees for y-overlap detection,
 * so a deep tree's wide leaf level doesn't push away a small tree
 * that only overlaps near the narrow root.
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

    // Check if the trees overlap in x at all
    const sharedMinX = Math.max(changedBox.minX, otherBox.minX);
    const sharedMaxX = Math.min(changedBox.maxX, otherBox.maxX);
    if (sharedMinX >= sharedMaxX) continue; // No x overlap

    // Recompute y-extents using only nodes within the shared x range
    const changedClipped = treeBoundingBox(store, changedRootId, sharedMinX, sharedMaxX);
    const otherClipped = treeBoundingBox(store, otherRoot.id, sharedMinX, sharedMaxX);

    // If either tree has no nodes in the shared range, no overlap
    if (changedClipped.minY === Infinity || otherClipped.minY === Infinity) continue;

    // Check y overlap within the shared x range
    const overlapY =
      changedClipped.maxY > otherClipped.minY && changedClipped.minY < otherClipped.maxY;

    if (overlapY) {
      // Push other tree away vertically
      const changedCenterY = (changedClipped.minY + changedClipped.maxY) / 2;
      const otherCenterY = (otherClipped.minY + otherClipped.maxY) / 2;

      if (otherCenterY >= changedCenterY) {
        // Other tree is below: push down
        const pushAmount =
          changedClipped.maxY - otherClipped.minY + TREE_PADDING;
        shiftSubtree(store, otherRoot.id, pushAmount);
      } else {
        // Other tree is above: push up
        const pushAmount =
          otherClipped.maxY - changedClipped.minY + TREE_PADDING;
        shiftSubtree(store, otherRoot.id, -pushAmount);
      }
    }
  }
}
