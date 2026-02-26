// ABOUTME: SVG component rendering a single mind map node.
// ABOUTME: Displays a rounded rectangle with text, selection highlight, and collapse indicator.

import type { MindMapNode } from "@mindforge/core";

const BORDER_RADIUS = 6;
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
}

export function NodeView({ node, isSelected, isRoot, isReparentTarget, imageUrl }: NodeViewProps) {
  const lines = node.text.split("\n");
  const hasImage = node.image && imageUrl;
  const textHeight = PADDING_Y * 2 + lines.length * LINE_HEIGHT;

  const fillColor = isReparentTarget ? "#fef3c7" : isSelected ? "#dbeafe" : "#ffffff";
  const strokeColor = isReparentTarget ? "#f59e0b" : isSelected ? "#3b82f6" : "#d1d5db";
  const strokeWidth = isReparentTarget ? 2 : isSelected ? 2 : 1;
  const fontWeight = isRoot ? 600 : 400;

  const FOCUS_OFFSET = 3;

  return (
    <g>
      {/* Keyboard focus ring */}
      {isSelected && !isReparentTarget && (
        <rect
          x={-FOCUS_OFFSET}
          y={-FOCUS_OFFSET}
          width={node.width + FOCUS_OFFSET * 2}
          height={node.height + FOCUS_OFFSET * 2}
          rx={BORDER_RADIUS + FOCUS_OFFSET}
          ry={BORDER_RADIUS + FOCUS_OFFSET}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
          strokeDasharray="4 3"
          opacity={0.6}
        />
      )}
      {/* Drop shadow */}
      <rect
        width={node.width}
        height={node.height}
        rx={BORDER_RADIUS}
        ry={BORDER_RADIUS}
        fill="rgba(0,0,0,0.06)"
        transform="translate(1, 2)"
      />
      {/* Main rectangle */}
      <rect
        width={node.width}
        height={node.height}
        rx={BORDER_RADIUS}
        ry={BORDER_RADIUS}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
      {/* Image (below text) */}
      {hasImage && node.image && (
        <image
          href={imageUrl}
          x={PADDING_X}
          y={textHeight}
          width={node.image.width}
          height={node.image.height}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
      {/* Collapse indicator: small circle with child count */}
      {node.collapsed && node.children.length > 0 && (
        <g transform={`translate(${node.width + 8}, ${node.height / 2})`}>
          <circle r={8} fill="#e5e7eb" stroke="#9ca3af" strokeWidth={1} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            fontFamily="system-ui, -apple-system, sans-serif"
            fill="#6b7280"
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
          y={PADDING_Y + FONT_SIZE + i * LINE_HEIGHT}
          fontSize={FONT_SIZE}
          fontWeight={fontWeight}
          fontFamily="system-ui, -apple-system, sans-serif"
          fill="#1f2937"
        >
          {line || "\u00A0"}
        </text>
      ))}
    </g>
  );
}
