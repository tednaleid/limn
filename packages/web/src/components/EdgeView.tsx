// ABOUTME: SVG component rendering a tapered edge between parent and child nodes.
// ABOUTME: Uses a filled ribbon shape that tapers from parent (thick) to child (thin).

import type { MindMapNode } from "@limn/core";

interface EdgeViewProps {
  parent: MindMapNode;
  child: MindMapNode;
  branchColor?: string;
  depth: number;
}

export function EdgeView({ parent, child, branchColor, depth }: EdgeViewProps) {
  // Connect from parent's right/left edge center to child's left/right edge center
  const goingRight = child.x >= parent.x;

  const startX = goingRight ? parent.x + parent.width : parent.x;
  const startY = parent.y + parent.height / 2;
  const endX = goingRight ? child.x : child.x + child.width;
  const endY = child.y + child.height / 2;

  // Taper width: thicker near parent, thinner at child
  const parentWidth = depth <= 1 ? 4 : depth <= 2 ? 3 : 2;
  const childWidth = depth <= 1 ? 2 : depth <= 2 ? 1.5 : 1;
  const pH = parentWidth / 2;
  const cH = childWidth / 2;

  // Control points for smooth cubic bezier
  const midX = (startX + endX) / 2;

  // Filled ribbon: trace top edge forward, then bottom edge backward
  const d = [
    `M ${startX} ${startY - pH}`,
    `C ${midX} ${startY - pH}, ${midX} ${endY - cH}, ${endX} ${endY - cH}`,
    `L ${endX} ${endY + cH}`,
    `C ${midX} ${endY + cH}, ${midX} ${startY + pH}, ${startX} ${startY + pH}`,
    "Z",
  ].join(" ");

  return (
    <path
      d={d}
      style={{ fill: branchColor ?? "var(--edge-default)" }}
      stroke="none"
    />
  );
}
