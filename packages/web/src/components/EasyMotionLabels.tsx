// ABOUTME: SVG overlay that renders EasyMotion label badges on each visible node.
// ABOUTME: Shown when EasyMotion mode is active; dims non-matching labels during prefix input.

import type { MindMapNode, Editor } from "@limn/core";

const BADGE_HEIGHT = 20;
const BADGE_FONT_SIZE = 13;
const BADGE_PADDING_X = 4;
const BADGE_RADIUS = 3;
const BADGE_BG_DIM = "#e5e7eb";  // gray-200
const BADGE_TEXT_DIM = "#9ca3af"; // gray-400
const BADGE_FALLBACK = "#6b7280"; // gray-500

interface EasyMotionLabelsProps {
  nodes: MindMapNode[];
  editor: Editor;
}

export function EasyMotionLabels({ nodes, editor }: EasyMotionLabelsProps) {
  const buffer = editor.getEasyMotionBuffer();

  return (
    <g data-easymotion-labels>
      {nodes.map((node) => {
        const label = editor.getEasyMotionLabel(node.id);
        if (!label) return null;

        const branchColor = editor.getBranchColor(node.id) ?? BADGE_FALLBACK;

        // If a prefix is buffered, dim labels that don't match
        const matches = buffer === "" || label.startsWith(buffer);
        const bg = matches ? branchColor : BADGE_BG_DIM;
        const textColor = matches ? "#ffffff" : BADGE_TEXT_DIM;

        // Estimate badge width from label length
        const charWidth = BADGE_FONT_SIZE * 0.65;
        const badgeWidth = label.length * charWidth + BADGE_PADDING_X * 2;

        return (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y - BADGE_HEIGHT - 2}
              width={badgeWidth}
              height={BADGE_HEIGHT}
              rx={BADGE_RADIUS}
              ry={BADGE_RADIUS}
              fill={bg}
              stroke="none"
            />
            <text
              x={node.x + BADGE_PADDING_X}
              y={node.y - BADGE_HEIGHT - 2 + BADGE_HEIGHT / 2}
              dominantBaseline="central"
              fill={textColor}
              fontSize={BADGE_FONT_SIZE}
              fontFamily="monospace"
              fontWeight={600}
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
