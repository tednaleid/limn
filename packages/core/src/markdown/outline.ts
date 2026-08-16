// ABOUTME: Markdown outline codec: nested bullet lists <-> OutlineNode trees.
// ABOUTME: Line-based parser and writer over prose regions and list regions.

import type { MindMapFileNode } from "../serialization/schema";
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from "../store/MindMapStore";

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

const ESCAPE_PREFIX_RE = /^(?:[-*+](?: |$)|#{1,6}(?: |$)|>(?: |$)|```|~~~)/;
const THEMATIC_BREAK_RE = /^([-*_])(?: *\1){2,} *$/;
const ORDERED_PREFIX_RE = /^(\d+)([.)])(?: |$)/;
const ESCAPED_ORDERED_RE = /^(\d+)\\([.)])(?: |$)/;

/** Backslash-escape a line of node text that would otherwise be read as list, heading, quote,
 *  fence, or rule syntax. The line's own leading whitespace is kept in front of the escape. */
export function escapeLine(line: string): string {
  const ws = leadingWhitespace(line);
  const body = line.slice(ws.length);
  if (ESCAPE_PREFIX_RE.test(body) || THEMATIC_BREAK_RE.test(body)) return `${ws}\\${body}`;
  const m = ORDERED_PREFIX_RE.exec(body);
  if (m) return `${ws}${m[1]}\\${body.slice((m[1] ?? "").length)}`;
  return line;
}

/** Inverse of escapeLine. Only the escapes escapeLine produces are removed. */
export function unescapeLine(line: string): string {
  const ws = leadingWhitespace(line);
  const body = line.slice(ws.length);
  if (body.startsWith("\\")) {
    const rest = body.slice(1);
    if (ESCAPE_PREFIX_RE.test(rest) || THEMATIC_BREAK_RE.test(rest)) return `${ws}${rest}`;
    return line;
  }
  const m = ESCAPED_ORDERED_RE.exec(body);
  if (m) return `${ws}${m[1]}${body.slice((m[1] ?? "").length + 1)}`;
  return line;
}

/** Remove a trailing backslash and any trailing whitespace. */
function stripHardBreak(line: string): string {
  const trimmed = line.trimEnd();
  if (line.endsWith("\\")) return line.slice(0, -1).trimEnd();
  return trimmed;
}

const EMBED_RE = /^!\[\[([^\]|]+)(?:\|(\d+)(?:x(\d+))?)?\]\]$/;

function parseEmbedLine(line: string): OutlineImage | null {
  const m = EMBED_RE.exec(line);
  if (!m) return null;
  const image: OutlineImage = { target: m[1] ?? "", width: undefined, height: undefined };
  if (m[2] !== undefined) image.width = Number(m[2]);
  if (m[3] !== undefined) image.height = Number(m[3]);
  return image;
}

function embedLine(image: OutlineImage): string {
  return image.width !== undefined ? `![[${image.target}|${image.width}]]` : `![[${image.target}]]`;
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

/** Assemble an item's text by joining its raw lines, stripping hard breaks and escapes.
 *  A trailing embed line becomes the node's image. The marker determines collapse:
 *  a star on an item with children means collapsed. */
function finishItem(item: OpenItem): void {
  const lines = item.rawLines.map((raw, i) => {
    const line = i < item.rawLines.length - 1 ? stripHardBreak(raw) : raw.trimEnd();
    return unescapeLine(line);
  });
  const last = lines[lines.length - 1];
  const image = last !== undefined ? parseEmbedLine(last) : null;
  if (image) {
    lines.pop();
    item.node.image = image;
  }
  item.node.text = lines.join("\n");
  item.node.collapsed = item.marker === "*" && item.node.children.length > 0;
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

/** Lines of a node's text ready to be written: trailing whitespace trimmed, blank lines dropped, first line's leading whitespace trimmed, then escaped. */
function contentLines(node: OutlineNode): string[] {
  const lines = node.text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l !== "");
  if (lines[0] !== undefined) lines[0] = lines[0].trimStart();
  return lines.map(escapeLine);
}

function writeNode(node: OutlineNode, depth: number, out: string[]): void {
  const lines = contentLines(node);
  if (node.image) lines.push(embedLine(node.image));
  const childLines: string[] = [];
  for (const child of node.children) writeNode(child, depth + 1, childLines);
  const hasBody = lines.length > 0 || childLines.length > 0;
  if (!hasBody) return;
  const indent = INDENT.repeat(depth);
  const marker = node.collapsed && childLines.length > 0 ? "*" : "-";
  if (lines.length === 0) {
    out.push(`${indent}${marker}`);
  } else {
    const contentIndent = indent + INDENT;
    lines.forEach((line, i) => {
      const suffix = i < lines.length - 1 ? "\\" : "";
      out.push(i === 0 ? `${indent}${marker} ${line}${suffix}` : `${contentIndent}${line}${suffix}`);
    });
  }
  out.push(...childLines);
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

/** Display size used for an embedded image whose size is not yet known. */
export const OUTLINE_IMAGE_PLACEHOLDER = 200;

export function writeSubtree(nodes: OutlineNode[]): string {
  return writeNodes(nodes).join("\n");
}

export function parseSubtree(text: string): OutlineNode[] {
  return outlineRoots(parseOutline(text));
}

export function outlineToFileNodes(nodes: OutlineNode[], nextId: () => string): MindMapFileNode[] {
  return nodes.map((node) => {
    const file: MindMapFileNode = {
      id: nextId(),
      text: node.text,
      x: 0,
      y: 0,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      children: [],
    };
    if (node.collapsed) file.collapsed = true;
    if (node.image) {
      const width = node.image.width ?? OUTLINE_IMAGE_PLACEHOLDER;
      const height = node.image.height ?? width;
      file.image = { assetId: node.image.target, width, height };
    }
    file.children = outlineToFileNodes(node.children, nextId);
    return file;
  });
}

export function fileNodesToOutline(nodes: MindMapFileNode[]): OutlineNode[] {
  return nodes.map((node) => {
    const outline: OutlineNode = {
      text: node.text,
      collapsed: node.collapsed === true && node.children.length > 0,
      children: fileNodesToOutline(node.children),
    };
    if (node.image) {
      outline.image = { target: node.image.assetId, width: node.image.width, height: node.image.height };
    }
    return outline;
  });
}
