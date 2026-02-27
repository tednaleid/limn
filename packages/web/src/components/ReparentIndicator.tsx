// ABOUTME: SVG dashed line indicator shown during drag-to-reparent.
// ABOUTME: Connects the dragged node to the potential new parent.

import type { MindMapNode } from "@limn/core";

interface ReparentIndicatorProps {
  draggedNode: MindMapNode;
  targetNode: MindMapNode;
}

export function ReparentIndicator({ draggedNode, targetNode }: ReparentIndicatorProps) {
  const draggedCenterX = draggedNode.x + draggedNode.width / 2;
  const draggedCenterY = draggedNode.y + draggedNode.height / 2;

  // Connect to the nearest edge of the target node
  const targetCenterX = targetNode.x + targetNode.width / 2;
  const targetEdgeX = draggedCenterX < targetCenterX
    ? targetNode.x
    : targetNode.x + targetNode.width;
  const targetEdgeY = targetNode.y + targetNode.height / 2;

  return (
    <line
      x1={draggedCenterX}
      y1={draggedCenterY}
      x2={targetEdgeX}
      y2={targetEdgeY}
      stroke="#f59e0b"
      strokeWidth={2}
      strokeDasharray="6 4"
      opacity={0.8}
    />
  );
}
