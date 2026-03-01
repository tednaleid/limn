#!/usr/bin/env bun
// ABOUTME: Generates .limn files of arbitrary sizes for testing with larger mind maps.
// ABOUTME: Produces breadth-first trees with configurable shape and lorem ipsum text.

// --- Constants (inlined from packages/core to keep script self-contained) ---

const H_OFFSET = 250;
const V_GAP = 20;
const BRANCH_COLOR = "#4285f4"; // first color from BRANCH_PALETTE
const NODE_HEIGHT = 32;
const CHAR_WIDTH = 8;
const NODE_PADDING = 16;
const MIN_NODE_WIDTH = 100;
const MAX_NODES = 65536; // 2^16

const LOREM_WORDS = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing",
  "elit", "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore",
  "et", "dolore", "magna", "aliqua", "enim", "ad", "minim", "veniam",
  "quis", "nostrud", "exercitation", "ullamco", "laboris", "nisi",
  "aliquip", "ex", "ea", "commodo", "consequat",
];

// --- Seeded PRNG (mulberry32) ---

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function randomText(maxChars: number): string {
  const words: string[] = [];
  let len = 0;
  // Pick at least one word
  while (true) {
    const word = LOREM_WORDS[Math.floor(rand() * LOREM_WORDS.length)]!;
    const added = len === 0 ? word.length : len + 1 + word.length;
    if (added > maxChars && words.length > 0) break;
    words.push(word);
    len = added;
    if (len >= maxChars) break;
  }
  return words.join(" ");
}

// --- Types ---

interface GenNode {
  id: string;
  text: string;
  width: number;
  height: number;
  depth: number;
  parentIndex: number | null;
  childIndices: number[];
  x: number;
  y: number;
}

// --- Argument parsing ---

const USAGE = `\
Usage: generate-limn.ts [options]

Generate .limn mind map files with configurable tree shape.

Size (one required, mutually exclusive):
  --nodes N        Total number of nodes to generate
  --depth D        Depth of a full tree (all parents get max children)

Options:
  --children C     Max children per node (default: 3)
  --max-chars N    Max characters per node text (default: 12)
  -o, --output F   Output file path (default: stdout)
  -h, --help       Show this help message

Upper limit: ${MAX_NODES} nodes.

Examples:
  generate-limn.ts --nodes 7 --children 2        # small binary tree
  generate-limn.ts --depth 3 --children 3         # full ternary tree (40 nodes)
  generate-limn.ts --nodes 1024 -o /tmp/big.limn  # write to file`;

function parseArgs(): {
  totalNodes: number;
  maxChildren: number;
  maxChars: number;
  output: string | null;
} {
  const args = process.argv.slice(2);
  let nodes: number | null = null;
  let depth: number | null = null;
  let children = 3;
  let maxChars = 12;
  let output: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-h":
      case "--help":
        console.log(USAGE);
        process.exit(0);
      case "--nodes":
        nodes = parseInt(args[++i]!, 10);
        break;
      case "--depth":
        depth = parseInt(args[++i]!, 10);
        break;
      case "--children":
        children = parseInt(args[++i]!, 10);
        break;
      case "--max-chars":
        maxChars = parseInt(args[++i]!, 10);
        break;
      case "-o":
      case "--output":
        output = args[++i]!;
        break;
      default:
        console.error(`Unknown argument: ${arg}\n`);
        console.error(USAGE);
        process.exit(1);
    }
  }

  if (nodes !== null && depth !== null) {
    console.error("Error: --nodes and --depth are mutually exclusive.");
    process.exit(1);
  }

  if (nodes === null && depth === null) {
    console.error("Error: one of --nodes or --depth is required.");
    process.exit(1);
  }

  let totalNodes: number;
  if (depth !== null) {
    // Full tree: sum of children^i for i in 0..depth
    totalNodes = 0;
    for (let i = 0; i <= depth; i++) {
      totalNodes += Math.pow(children, i);
    }
  } else {
    totalNodes = nodes!;
  }

  if (totalNodes > MAX_NODES) {
    console.error(
      `Error: total nodes (${totalNodes}) exceeds limit of ${MAX_NODES}.`,
    );
    process.exit(1);
  }

  if (totalNodes < 1) {
    console.error("Error: must generate at least 1 node.");
    process.exit(1);
  }

  return { totalNodes, maxChildren: children, maxChars, output };
}

// --- Tree generation (BFS) ---

function generateNodes(
  totalNodes: number,
  maxChildren: number,
  maxChars: number,
): GenNode[] {
  const nodes: GenNode[] = [];

  // Create root
  const rootText = randomText(maxChars);
  const rootWidth = Math.max(
    MIN_NODE_WIDTH,
    rootText.length * CHAR_WIDTH + NODE_PADDING,
  );
  nodes.push({
    id: "n0",
    text: rootText,
    width: rootWidth,
    height: NODE_HEIGHT,
    depth: 0,
    parentIndex: null,
    childIndices: [],
    x: 0,
    y: 0,
  });

  // BFS: queue of parent indices
  let queueStart = 0;
  while (nodes.length < totalNodes) {
    if (queueStart >= nodes.length) break; // no more parents to expand
    const parentIdx = queueStart++;
    const parent = nodes[parentIdx]!;

    const childCount = Math.min(maxChildren, totalNodes - nodes.length);
    for (let c = 0; c < childCount; c++) {
      const idx = nodes.length;
      const text = randomText(maxChars);
      const width = Math.max(
        MIN_NODE_WIDTH,
        text.length * CHAR_WIDTH + NODE_PADDING,
      );
      nodes.push({
        id: `n${idx}`,
        text,
        width,
        height: NODE_HEIGHT,
        depth: parent.depth + 1,
        parentIndex: parentIdx,
        childIndices: [],
        x: 0,
        y: 0,
      });
      parent.childIndices.push(idx);
    }
  }

  return nodes;
}

// --- Layout ---

function computeSubtreeHeight(nodes: GenNode[], idx: number): number {
  const node = nodes[idx]!;
  if (node.childIndices.length === 0) return node.height;

  let total = 0;
  for (const childIdx of node.childIndices) {
    total += computeSubtreeHeight(nodes, childIdx);
  }
  total += V_GAP * (node.childIndices.length - 1);

  return Math.max(node.height, total);
}

function layoutTree(nodes: GenNode[]): void {
  // Assign x positions based on depth
  for (const node of nodes) {
    node.x = node.depth * H_OFFSET;
  }

  // Root starts at y=0
  nodes[0]!.y = 0;

  // Top-down y-positioning using the same centering logic as centerChildGroup
  positionChildren(nodes, 0);
}

function positionChildren(nodes: GenNode[], parentIdx: number): void {
  const parent = nodes[parentIdx]!;
  const childIndices = parent.childIndices;
  if (childIndices.length === 0) return;

  // Compute subtree heights for each child
  const heights = childIndices.map((ci) => computeSubtreeHeight(nodes, ci));

  // Total height = sum of subtree heights + gaps
  const totalHeight =
    heights.reduce((sum, h) => sum + h, 0) +
    V_GAP * (childIndices.length - 1);

  // Start position: centered on parent's visual center
  const parentCenter = parent.y + parent.height / 2;
  let currentY = parentCenter - totalHeight / 2;

  for (let i = 0; i < childIndices.length; i++) {
    const childIdx = childIndices[i]!;
    const child = nodes[childIdx]!;
    const childHeight = heights[i]!;

    // Child's y is at the center of its subtree band
    child.y = currentY + childHeight / 2 - child.height / 2;

    currentY += childHeight + V_GAP;

    // Recurse into this child
    positionChildren(nodes, childIdx);
  }
}

// --- Serialization ---

interface FileNode {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style?: Record<string, unknown>;
  children: FileNode[];
}

function toFileNode(nodes: GenNode[], idx: number): FileNode {
  const node = nodes[idx]!;
  const fileNode: FileNode = {
    id: node.id,
    text: node.text,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    children: node.childIndices.map((ci) => toFileNode(nodes, ci)),
  };

  // Root gets the branch color
  if (node.parentIndex === null) {
    fileNode.style = { color: BRANCH_COLOR };
  }

  return fileNode;
}

function buildFileFormat(nodes: GenNode[]): object {
  const root = toFileNode(nodes, 0);
  return {
    version: 1,
    meta: {
      id: crypto.randomUUID(),
      mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha",
    },
    camera: { x: 0, y: 0, zoom: 1 },
    roots: [root],
    assets: [],
  };
}

// --- Main ---

const { totalNodes, maxChildren, maxChars, output } = parseArgs();
const nodes = generateNodes(totalNodes, maxChildren, maxChars);
layoutTree(nodes);
const json = JSON.stringify(buildFileFormat(nodes), null, 2);

if (output) {
  await Bun.write(output, json + "\n");
  console.error(`Wrote ${nodes.length} nodes to ${output}`);
} else {
  console.log(json);
}
