// ABOUTME: SVG component rendering an edge between parent and child nodes.
// ABOUTME: Uses a cubic bezier curve for smooth connections.

import type { MindMapNode } from "@limn/core";

interface EdgeViewProps {
  parent: MindMapNode;
  child: MindMapNode;
  branchColor?: string;
}

export function EdgeView({ parent, child, branchColor }: EdgeViewProps) {
  // Connect from parent's right/left edge center to child's left/right edge center
  const goingRight = child.x >= parent.x;

  const startX = goingRight ? parent.x + parent.width : parent.x;
  const startY = parent.y + parent.height / 2;
  const endX = goingRight ? child.x : child.x + child.width;
  const endY = child.y + child.height / 2;

  // Control points for a smooth cubic bezier
  const midX = (startX + endX) / 2;
  const d = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

  return (
    <path
      d={d}
      fill="none"
      style={{ stroke: branchColor ?? "var(--edge-default)" }}
      strokeWidth={1.5}
    />
  );
}
