// ABOUTME: Branch color index assignment for mind map roots.
// ABOUTME: Provides colorIndex auto-assignment for new root nodes.

import { BRANCH_COUNT } from "./theme";

/**
 * Pick the next unused colorIndex from the palette, cycling when all are used.
 * Each theme has BRANCH_COUNT (14) branch colors; this function assigns
 * indices 0..13 to roots, skipping indices already in use.
 */
export function nextBranchColorIndex(existingIndices: number[]): number {
  const used = new Set(existingIndices);
  for (let i = 0; i < BRANCH_COUNT; i++) {
    if (!used.has(i)) return i;
  }
  // All indices used; cycle based on count
  return existingIndices.length % BRANCH_COUNT;
}

/**
 * Legacy v1 palette for backward compatibility reference.
 * Used by migration code to map old hex colors to colorIndex.
 */
export const BRANCH_PALETTE = [
  "#4285f4", // blue
  "#ea4335", // red
  "#34a853", // green
  "#ff6d01", // orange
  "#a142f4", // purple
  "#46bdc6", // teal
  "#fbbc04", // yellow
  "#f538a0", // pink
];
