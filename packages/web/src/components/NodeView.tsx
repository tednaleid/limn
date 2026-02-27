// ABOUTME: SVG component rendering a single mind map node.
// ABOUTME: Displays text with optional selection highlight, collapse indicator, and images.

import type { MindMapNode } from "@limn/core";
import { ROOT_FONT_SIZE } from "@limn/core";

const PADDING_X = 10;
const PADDING_Y = 6;
const FONT_SIZE = 14;
const LINE_HEIGHT = 20;

interface NodeViewProps {
  node: MindMapNode;
  isSelected: boolean;
  isRoot: boolean;
  isReparentTarget?: boolean;
  imageUrl?: string;
  branchColor?: string;
}

export function NodeView({ node, isSelected, isRoot, isReparentTarget, imageUrl, branchColor }: NodeViewProps) {
  const lines = node.text.split("\n");
  const hasImage = node.image && imageUrl;
  const fontSize = isRoot ? ROOT_FONT_SIZE : FONT_SIZE;
  const lineHeight = isRoot ? Math.round(ROOT_FONT_SIZE * (LINE_HEIGHT / FONT_SIZE)) : LINE_HEIGHT;
  const paddingY = isRoot ? Math.round(ROOT_FONT_SIZE * (PADDING_Y / FONT_SIZE)) : PADDING_Y;
  const textHeight = paddingY * 2 + lines.length * lineHeight;
  const fontWeight = isRoot ? 600 : 400;

  return (
    <g>
      {/* Selection highlight: uses branch color at low opacity when available */}
      {isSelected && !isReparentTarget && (
        <rect
          x={2}
          y={2}
          width={node.width - 4}
          height={node.height - 4}
          rx={4}
          style={{ fill: branchColor ?? "var(--selection-border)" }}
          opacity={0.18}
        />
      )}
      {/* Reparent target highlight */}
      {isReparentTarget && (
        <rect
          x={2}
          y={2}
          width={node.width - 4}
          height={node.height - 4}
          rx={4}
          style={{ fill: "var(--reparent-bg)" }}
        />
      )}
      {/* Image (below text) */}
      {hasImage && node.image && (
        <g className="node-image-group">
          <image
            href={imageUrl}
            x={PADDING_X}
            y={textHeight}
            width={node.image.width}
            height={node.image.height}
            preserveAspectRatio="xMidYMid meet"
          />
          {/* Image resize handle: dot in upper-right corner */}
          <circle
            data-image-resize-handle
            cx={PADDING_X + node.image.width}
            cy={textHeight}
            r={5}
            style={{ fill: "var(--selection-border)", cursor: "nesw-resize" }}
            stroke="#ffffff"
            strokeWidth={1.5}
            className="image-resize-dot"
          />
        </g>
      )}
      {/* Collapse indicator: small circle with child count */}
      {node.collapsed && node.children.length > 0 && (
        <g transform={`translate(${node.width + 8}, ${node.height / 2})`}>
          <circle r={8} style={{ fill: "var(--collapse-bg)", stroke: "var(--collapse-border)" }} strokeWidth={1} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            fontFamily="system-ui, -apple-system, sans-serif"
            style={{ fill: "var(--collapse-text)" }}
          >
            {node.children.length}
          </text>
        </g>
      )}
      {/* Text lines */}
      {lines.map((line, i) => (
        <text
          key={i}
          x={PADDING_X}
          y={paddingY + fontSize + i * lineHeight}
          fontSize={fontSize}
          fontWeight={fontWeight}
          fontFamily="system-ui, -apple-system, sans-serif"
          style={{ fill: branchColor ?? "var(--text-color)" }}
        >
          {line || "\u00A0"}
        </text>
      ))}
      {/* Right edge resize handle (visible on selected) */}
      {isSelected && (
        <rect
          data-resize-handle
          x={node.width - 4}
          y={0}
          width={8}
          height={node.height}
          fill="transparent"
          style={{ cursor: "ew-resize" }}
        />
      )}
    </g>
  );
}
