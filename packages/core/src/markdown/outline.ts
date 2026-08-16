// ABOUTME: Markdown outline codec: nested bullet lists <-> OutlineNode trees.
// ABOUTME: Line-based parser and writer over prose regions and list regions.

export interface OutlineImage {
  target: string;
  width?: number;
  height?: number;
}

export interface OutlineNode {
  text: string;
  collapsed: boolean;
  image?: OutlineImage;
  children: OutlineNode[];
}

export type OutlineRegion =
  | { kind: "prose"; lines: string[] }
  | { kind: "list"; roots: OutlineNode[] };

export interface ParsedOutline {
  frontmatterLines: string[];
  regions: OutlineRegion[];
}

const TAB_WIDTH = 4;
const BULLET_RE = /^([ \t]*)([-*+])(?:[ \t]+(.*))?$/;
const FENCE_RE = /^[ \t]*(```|~~~)/;

/** Width in columns of a run of leading spaces and tabs. */
function indentWidth(ws: string): number {
  let col = 0;
  for (const ch of ws) {
    col = ch === "\t" ? col + TAB_WIDTH - (col % TAB_WIDTH) : col + 1;
  }
  return col;
}

/** Leading whitespace of a line. */
function leadingWhitespace(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? "";
}

/** Drop up to `columns` columns of leading whitespace from a line. */
function stripColumns(line: string, columns: number): string {
  let col = 0;
  let i = 0;
  while (i < line.length && col < columns) {
    const ch = line[i];
    if (ch === " ") col += 1;
    else if (ch === "\t") col += TAB_WIDTH - (col % TAB_WIDTH);
    else break;
    i++;
  }
  return line.slice(i);
}

interface OpenItem {
  node: OutlineNode;
  rawLines: string[];
  marker: string;
  indent: number;
  contentColumn: number;
}

interface ListBuilder {
  roots: OutlineNode[];
  stack: OpenItem[];
  pendingBlank: string[];
}

/** Assemble an item's text by joining its raw lines. */
function finishItem(item: OpenItem): void {
  item.node.text = item.rawLines.join("\n");
}

function closeList(list: ListBuilder, regions: OutlineRegion[]): string[] {
  for (const item of list.stack) finishItem(item);
  regions.push({ kind: "list", roots: list.roots });
  return list.pendingBlank;
}

function pushProse(lines: string[], regions: OutlineRegion[]): void {
  if (lines.length === 0) return;
  regions.push({ kind: "prose", lines });
}

function addBullet(list: ListBuilder, m: RegExpExecArray): void {
  const indent = indentWidth(m[1] ?? "");
  const marker = m[2] ?? "-";
  const content = m[3] ?? "";
  while (list.stack.length > 0 && (list.stack[list.stack.length - 1] as OpenItem).indent >= indent) {
    finishItem(list.stack.pop() as OpenItem);
  }
  const node: OutlineNode = { text: "", collapsed: false, children: [] };
  const parent = list.stack[list.stack.length - 1];
  if (parent) parent.node.children.push(node);
  else list.roots.push(node);
  const afterMarker = m[0].slice((m[1] ?? "").length + 1);
  const spaces = afterMarker.length - afterMarker.replace(/^[ \t]+/, "").length;
  list.stack.push({
    node,
    rawLines: [content],
    marker,
    indent,
    contentColumn: indent + 1 + Math.max(1, indentWidth(afterMarker.slice(0, spaces))),
  });
  list.pendingBlank = [];
}

/** Split off YAML frontmatter delimited by `---` on the first line. */
function splitFrontmatter(lines: string[]): { frontmatterLines: string[]; rest: string[] } {
  if (lines[0] !== "---") return { frontmatterLines: [], rest: lines };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---" || lines[i] === "...") {
      return { frontmatterLines: lines.slice(0, i + 1), rest: lines.slice(i + 1) };
    }
  }
  return { frontmatterLines: [], rest: lines };
}

export function parseOutline(text: string): ParsedOutline {
  const { frontmatterLines, rest } = splitFrontmatter(text.split("\n"));
  const regions: OutlineRegion[] = [];
  let prose: string[] = [];
  let list: ListBuilder | null = null;
  let fence: string | null = null;
  let inComment = false;

  for (const line of rest) {
    if (list && fence === null && !inComment) {
      if (line.trim() === "") {
        list.pendingBlank.push(line);
        continue;
      }
      const m = BULLET_RE.exec(line);
      if (m) {
        addBullet(list, m);
        continue;
      }
      const top = list.stack[list.stack.length - 1];
      if (top && list.pendingBlank.length === 0 && indentWidth(leadingWhitespace(line)) >= top.contentColumn) {
        top.rawLines.push(stripColumns(line, top.contentColumn));
        continue;
      }
      prose = closeList(list, regions);
      list = null;
    }

    if (!inComment) {
      const f = FENCE_RE.exec(line);
      if (f) {
        if (fence === null) fence = f[1] ?? null;
        else if (f[1] === fence) fence = null;
      }
    }
    if (fence === null) {
      const markers = line.split("%%").length - 1;
      if (markers % 2 === 1) inComment = !inComment;
    }

    if (fence === null && !inComment) {
      const m = BULLET_RE.exec(line);
      if (m) {
        pushProse(prose, regions);
        prose = [];
        list = { roots: [], stack: [], pendingBlank: [] };
        addBullet(list, m);
        continue;
      }
    }
    prose.push(line);
  }

  if (list) prose = closeList(list, regions);
  pushProse(prose, regions);
  return { frontmatterLines, regions };
}

export function outlineRoots(parsed: ParsedOutline): OutlineNode[] {
  const roots: OutlineNode[] = [];
  for (const region of parsed.regions) {
    if (region.kind === "list") roots.push(...region.roots);
  }
  return roots;
}

const INDENT = "  ";

/** Lines of a node's text ready to be written, trimmed of trailing whitespace and blank lines dropped. */
function contentLines(node: OutlineNode): string[] {
  return node.text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l !== "");
}

function writeNode(node: OutlineNode, depth: number, out: string[]): void {
  const lines = contentLines(node);
  const hasBody = lines.length > 0 || node.children.length > 0;
  if (!hasBody) return;
  const indent = INDENT.repeat(depth);
  const marker = "-";
  if (lines.length === 0) {
    out.push(`${indent}${marker}`);
  } else {
    const contentIndent = indent + INDENT;
    lines.forEach((line, i) => {
      const suffix = i < lines.length - 1 ? "\\" : "";
      out.push(i === 0 ? `${indent}${marker} ${line}${suffix}` : `${contentIndent}${line}${suffix}`);
    });
  }
  for (const child of node.children) writeNode(child, depth + 1, out);
}

export function writeNodes(nodes: OutlineNode[], depth = 0): string[] {
  const out: string[] = [];
  for (const node of nodes) writeNode(node, depth, out);
  return out;
}

export function writeOutline(parsed: ParsedOutline): string {
  const out: string[] = [...parsed.frontmatterLines];
  for (const region of parsed.regions) {
    if (region.kind === "prose") out.push(...region.lines);
    else out.push(...writeNodes(region.roots));
  }
  return out.join("\n");
}
