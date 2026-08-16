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
  /** Set only for notes written with CRLF, which the writer then keeps. */
  lineEnding?: "\r\n";
}

const TAB_WIDTH = 4;
const BULLET_RE = /^([ \t]*)([-*+])(?:[ \t]+(.*))?$/;
const FENCE_RE = /^[ \t]*(```|~~~)/;

/** Column reached by a run of spaces and tabs that starts at `startColumn`. */
function columnAfter(ws: string, startColumn: number): number {
  let col = startColumn;
  for (const ch of ws) {
    col = ch === "\t" ? col + TAB_WIDTH - (col % TAB_WIDTH) : col + 1;
  }
  return col;
}

/** Width in columns of a run of leading spaces and tabs. */
function indentWidth(ws: string): number {
  return columnAfter(ws, 0);
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
const ESCAPED_ORDERED_RE = /^(\d+)\\+([.)])(?: |$)/;

/** Backslash-escape a line of node text that would otherwise be read as list, heading, quote,
 *  fence, or rule syntax, or as an escape the parser would strip. The line's own leading
 *  whitespace is kept in front of the escape. */
export function escapeLine(line: string): string {
  const ws = leadingWhitespace(line);
  const body = line.slice(ws.length);
  if (ESCAPE_PREFIX_RE.test(body) || THEMATIC_BREAK_RE.test(body)) return `${ws}\\${body}`;
  if (body.startsWith("\\") && unescapeLine(body) !== body) return `${ws}\\${body}`;
  const ordered = ORDERED_PREFIX_RE.exec(body) ?? ESCAPED_ORDERED_RE.exec(body);
  if (ordered) return `${ws}${ordered[1]}\\${body.slice((ordered[1] ?? "").length)}`;
  return line;
}

/** Inverse of escapeLine. Only the escapes escapeLine produces are removed. */
export function unescapeLine(line: string): string {
  const ws = leadingWhitespace(line);
  const body = line.slice(ws.length);
  if (body.startsWith("\\")) {
    const rest = body.slice(1);
    if (ESCAPE_PREFIX_RE.test(rest) || THEMATIC_BREAK_RE.test(rest)) return `${ws}${rest}`;
    if (rest.startsWith("\\") && unescapeLine(rest) !== rest) return `${ws}${rest}`;
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
  if (image.width === undefined) return `![[${image.target}]]`;
  if (image.height === undefined) return `![[${image.target}|${image.width}]]`;
  return `![[${image.target}|${image.width}x${image.height}]]`;
}

interface OpenItem {
  node: OutlineNode;
  rawLines: string[];
  /** Whether each raw line arrived inside an item fence, opener and closer included. */
  fenced: boolean[];
  marker: string;
  indent: number;
  depth: number;
  contentColumn: number;
}

interface ListBuilder {
  roots: OutlineNode[];
  stack: OpenItem[];
  pendingBlank: string[];
  /** Fence marker of a fenced block opened on the top item's continuation line, or null. */
  itemFence: string | null;
}

/** Canonical content column of an item at `depth`: two columns per level plus the marker and a space. */
function canonicalContentColumn(depth: number): number {
  return 2 * depth + 2;
}

/** Assemble an item's text by joining its raw lines, stripping hard breaks and escapes. Lines
 *  inside a fenced block are code and are kept verbatim, and the line before a fence opener keeps
 *  a trailing backslash because the writer never puts a hard break there.
 *  A trailing embed line becomes the node's image. The marker determines collapse:
 *  a star on an item with children means collapsed. */
function finishItem(item: OpenItem): void {
  const lines = item.rawLines.map((raw, i) => {
    if (item.fenced[i]) return raw;
    const keepBackslash = i === item.rawLines.length - 1 || item.fenced[i + 1] === true;
    return unescapeLine(keepBackslash ? raw.trimEnd() : stripHardBreak(raw));
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

/** The open item a non-bullet line continues, or null when the line ends the list region.
 *  The line belongs to the deepest open item whose canonical content column fits within the
 *  line's indent; open items deeper than that are finished. */
function continuedItem(list: ListBuilder, line: string): OpenItem | null {
  const indent = indentWidth(leadingWhitespace(line));
  for (let i = list.stack.length - 1; i >= 0; i--) {
    const item = list.stack[i] as OpenItem;
    if (canonicalContentColumn(item.depth) <= indent) {
      while (list.stack.length > i + 1) finishItem(list.stack.pop() as OpenItem);
      return item;
    }
  }
  return null;
}

/** Record a continuation line of an item, noting whether it arrived inside a fenced block. */
function pushRawLine(item: OpenItem, body: string, fenced: boolean): void {
  item.rawLines.push(body);
  item.fenced.push(fenced);
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
  const gap = leadingWhitespace(m[0].slice((m[1] ?? "").length + 1));
  const markerColumn = indent + 1;
  list.stack.push({
    node,
    rawLines: [content],
    fenced: [false],
    marker,
    indent,
    depth: list.stack.length,
    contentColumn: gap === "" ? markerColumn + 1 : columnAfter(gap, markerColumn),
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
  const { frontmatterLines, rest } = splitFrontmatter(text.split(/\r?\n/));
  const regions: OutlineRegion[] = [];
  let prose: string[] = [];
  let list: ListBuilder | null = null;
  let fence: string | null = null;
  let inComment = false;

  for (const line of rest) {
    if (list && fence === null && !inComment) {
      if (list.itemFence !== null) {
        const item = list.stack[list.stack.length - 1] as OpenItem;
        const body = stripColumns(line, item.contentColumn);
        pushRawLine(item, body, true);
        if (FENCE_RE.exec(body)?.[1] === list.itemFence) list.itemFence = null;
        continue;
      }
      if (line.trim() === "") {
        list.pendingBlank.push(line);
        continue;
      }
      const m = BULLET_RE.exec(line);
      if (m) {
        addBullet(list, m);
        continue;
      }
      const item = list.pendingBlank.length === 0 ? continuedItem(list, line) : null;
      if (item) {
        const body = stripColumns(line, item.contentColumn);
        list.itemFence = FENCE_RE.exec(body)?.[1] ?? null;
        pushRawLine(item, body, list.itemFence !== null);
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
    if (fence === null && line.trim() === "%%") inComment = !inComment;

    if (fence === null && !inComment) {
      const m = BULLET_RE.exec(line);
      if (m) {
        pushProse(prose, regions);
        prose = [];
        list = { roots: [], stack: [], pendingBlank: [], itemFence: null };
        addBullet(list, m);
        continue;
      }
    }
    prose.push(line);
  }

  if (list) prose = closeList(list, regions);
  pushProse(prose, regions);
  const parsed: ParsedOutline = { frontmatterLines, regions };
  if (text.includes("\r\n")) parsed.lineEnding = "\r\n";
  return parsed;
}

export function outlineRoots(parsed: ParsedOutline): OutlineNode[] {
  const roots: OutlineNode[] = [];
  for (const region of parsed.regions) {
    if (region.kind === "list") roots.push(...region.roots);
  }
  return roots;
}

const INDENT = "  ";

/** Marks the lines of a balanced fence pair and the lines between them. The parser only opens a
 *  fence from a continuation line, so a fence opening on the first line does not count. */
function fencedLines(lines: string[]): boolean[] {
  const fenced = lines.map(() => false);
  for (let i = 1; i < lines.length; i++) {
    const marker = FENCE_RE.exec(lines[i] as string)?.[1];
    if (marker === undefined) continue;
    const close = lines.findIndex((l, j) => j > i && FENCE_RE.exec(l)?.[1] === marker);
    if (close === -1) continue;
    for (let j = i; j <= close; j++) fenced[j] = true;
    i = close;
  }
  return fenced;
}

/** Lines of a node's text ready to be written: first line's leading whitespace trimmed, then each
 *  line trimmed of trailing whitespace, blank lines dropped, and the rest escaped. Lines inside a
 *  balanced fence are code: they are written verbatim, blank ones included. */
function contentLines(node: OutlineNode): { lines: string[]; fenced: boolean[] } {
  const all = node.text.split("\n");
  const start = all.findIndex((l) => l.trim() !== "");
  const body = start === -1 ? [] : all.slice(start);
  const spans = fencedLines(body);
  const lines: string[] = [];
  const fenced: boolean[] = [];
  body.forEach((line, i) => {
    const inFence = spans[i] ?? false;
    const text = inFence ? line : line.trimEnd();
    if (text === "" && !inFence) return;
    lines.push(text);
    fenced.push(inFence);
  });
  if (lines[0] !== undefined) lines[0] = lines[0].trimStart();
  return { lines: lines.map((l, i) => (fenced[i] ? l : escapeLine(l))), fenced };
}

function writeNode(node: OutlineNode, depth: number, out: string[]): void {
  const { lines, fenced } = contentLines(node);
  if (node.image) {
    lines.push(embedLine(node.image));
    fenced.push(false);
  }
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
      const hardBreak = i < lines.length - 1 && !fenced[i] && !fenced[i + 1];
      const suffix = hardBreak ? "\\" : "";
      if (i === 0) out.push(`${indent}${marker} ${line}${suffix}`);
      else out.push(line === "" ? "" : `${contentIndent}${line}${suffix}`);
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
  return out.join(parsed.lineEnding ?? "\n");
}

/** Stored for an embed dimension the note did not specify; hosts resolve the natural size before
 *  the first write. */
export const OUTLINE_IMAGE_UNKNOWN_SIZE = 0;

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
      file.image = {
        assetId: node.image.target,
        width: node.image.width ?? OUTLINE_IMAGE_UNKNOWN_SIZE,
        height: node.image.height ?? OUTLINE_IMAGE_UNKNOWN_SIZE,
      };
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
      const { assetId, width, height } = node.image;
      const image: OutlineImage = { target: assetId };
      if (width > 0) image.width = width;
      if (height > 0) image.height = height;
      outline.image = image;
    }
    return outline;
  });
}
