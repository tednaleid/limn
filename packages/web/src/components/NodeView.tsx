// ABOUTME: SVG component rendering a single mind map node.
// ABOUTME: Displays text with optional selection highlight, collapse indicator, and images.

import type { MindMapNode, StyledSegment } from "@limn/core";
import { ROOT_FONT_SIZE, parseInlineMarkdown, isPlainSegments } from "@limn/core";

const PADDING_X = 10;
const PADDING_Y = 6;
const FONT_SIZE = 14;
const LINE_HEIGHT = 20;
const FONT_FAMILY = "system-ui, -apple-system, sans-serif";

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
      {/* Collapse indicator: small circle with child count, styled to match parent */}
      {node.collapsed && node.children.length > 0 && (
        <g transform={`translate(${node.width + 8}, ${node.height / 2})`}>
          <circle r={8} style={{ fill: branchColor ?? "var(--collapse-bg)" }} opacity={0.18} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            fontFamily="system-ui, -apple-system, sans-serif"
            style={{ fill: branchColor ?? "var(--collapse-text)" }}
          >
            {node.children.length}
          </text>
        </g>
      )}
      {/* Text lines with inline markdown rendering */}
      {lines.map((line, i) => {
        const segments = parseInlineMarkdown(line);
        const textY = paddingY + fontSize + i * lineHeight;
        const fill = branchColor ?? "var(--text-color)";

        if (isPlainSegments(segments)) {
          return (
            <text
              key={i}
              x={PADDING_X}
              y={textY}
              fontSize={fontSize}
              fontWeight={fontWeight}
              fontFamily={FONT_FAMILY}
              style={{ fill }}
            >
              {segments[0]?.text || "\u00A0"}
            </text>
          );
        }

        return (
          <text
            key={i}
            x={PADDING_X}
            y={textY}
            fontSize={fontSize}
            fontWeight={fontWeight}
            fontFamily={FONT_FAMILY}
            style={{ fill }}
          >
            {segments.map((seg, j) =>
              renderSegment(seg, j, fontWeight),
            )}
          </text>
        );
      })}
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

/** Render a single styled segment as a tspan (or link-wrapped tspan). */
function renderSegment(
  seg: StyledSegment,
  key: number,
  baseFontWeight: number,
) {
  const boldWeight = baseFontWeight >= 600 ? 800 : 700;
  const tspan = (
    <tspan
      key={key}
      fontWeight={seg.style.bold ? boldWeight : undefined}
      fontStyle={seg.style.italic ? "italic" : undefined}
      fontFamily={seg.style.code ? "monospace" : undefined}
      textDecoration={seg.style.strikethrough ? "line-through" : undefined}
      fill={seg.style.link ? "var(--selection-border)" : undefined}
    >
      {seg.text}
    </tspan>
  );

  if (seg.style.link) {
    return (
      <a key={key} href={seg.style.link} target="_blank" rel="noopener noreferrer">
        {tspan}
      </a>
    );
  }

  return tspan;
}
