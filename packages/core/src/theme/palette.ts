// ABOUTME: Default branch color palette for mind map roots.
// ABOUTME: Provides color auto-assignment for new root nodes.

/** Colors chosen to work on both light and dark backgrounds. */
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

/** Pick the next unused color from the palette, cycling when all are used. */
export function nextBranchColor(existingColors: string[]): string {
  const used = new Set(existingColors);
  for (const color of BRANCH_PALETTE) {
    if (!used.has(color)) return color;
  }
  return BRANCH_PALETTE[0] ?? "#4285f4";
}
