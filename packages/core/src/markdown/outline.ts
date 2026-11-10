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

export type OutlineIssueKind = "block-in-item" | "indented-list" | "misaligned";

export interface OutlineIssue {
  /** 1-based line number in the note, frontmatter included. */
  line: number;
  kind: OutlineIssueKind;
}

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
const TABLE_DELIMITER_RE = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?$/;
const ORDERED_PREFIX_RE = /^(\d+)([.)])(?: |$)/;
const ESCAPED_ORDERED_RE = /^(\d+)\\+([.)])(?: |$)/;

function isTableDelimiter(body: string): boolean {
  return body.includes("|") && TABLE_DELIMITER_RE.test(body.trimEnd());
}

/** Backslash-escape a line of node text that would otherwise be read as list, heading, quote,
 *  fence, or rule syntax, or as an escape the parser would strip. The line's own leading
 *  whitespace is kept in front of the escape. */
export function escapeLine(line: string): string {
  const ws = leadingWhitespace(line);
  const body = line.slice(ws.length);
  if (ESCAPE_PREFIX_RE.test(body) || THEMATIC_BREAK_RE.test(body) || isTableDelimiter(body)) {
    return `${ws}\\${body}`;
  }
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
    if (ESCAPE_PREFIX_RE.test(rest) || THEMATIC_BREAK_RE.test(rest) || isTableDelimiter(rest)) {
      return `${ws}${rest}`;
    }
    if (rest.startsWith("\\") && unescapeLine(rest) !== rest) return `${ws}${rest}`;
    return line;
  }
  const m = ESCAPED_ORDERED_RE.exec(body);
  if (m) return `${ws}${m[1]}${body.slice((m[1] ?? "").length + 1)}`;
  return line;
}

/** Block starts that can interrupt a paragraph, so they matter only on a line after an item's first
 *  line: display math, an Obsidian comment, a quote with no space after `>`, and an HTML block. */
const CONTINUATION_BLOCK_RE = /^(?:\$\$|%%|>|<[A-Za-z/!])/;

/** escapeLine for a line after the first line of node text, where CONTINUATION_BLOCK_RE also applies. */
export function escapeContinuationLine(line: string): string {
  const ws = leadingWhitespace(line);
  const body = line.slice(ws.length);
  if (CONTINUATION_BLOCK_RE.test(body)) return `${ws}\\${body}`;
  if (body.startsWith("\\") && unescapeContinuationLine(body) !== body) return `${ws}\\${body}`;
  return escapeLine(line);
}

/** Inverse of escapeContinuationLine. */
export function unescapeContinuationLine(line: string): string {
  const ws = leadingWhitespace(line);
  const body = line.slice(ws.length);
  if (body.startsWith("\\")) {
    const rest = body.slice(1);
    if (CONTINUATION_BLOCK_RE.test(rest)) return `${ws}${rest}`;
    if (rest.startsWith("\\") && unescapeContinuationLine(rest) !== rest) return `${ws}${rest}`;
  }
  return unescapeLine(line);
}

/** Remove a trailing backslash and any trailing whitespace. */
function stripHardBreak(line: string): string {
  const trimmed = line.trimEnd();
  if (line.endsWith("\\")) return line.slice(0, -1).trimEnd();
  return trimmed;
}

/** True when Markdown would read this line of item text as block syntax rather than text. */
function isBlockSyntax(body: string): boolean {
  const b = body.trimStart();
  return unescapeLine(b) === b && escapeLine(b) !== b;
}

/** isBlockSyntax for a line after an item's first line. */
function isContinuationBlockSyntax(body: string): boolean {
  const b = body.trimStart();
  return unescapeContinuationLine(b) === b && escapeContinuationLine(b) !== b;
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
  /** A fenced block opened on the top item's continuation line: its marker and 1-based line, or null. */
  itemFence: { marker: string; line: number } | null;
}

/** Columns past a parent's content column at which a marker becomes indented code instead of a child. */
const CODE_INDENT = 4;

/** Whether a marker at `indent` is where CommonMark reads it as a child of `parent`: at or past the
 *  parent's content column and short of an indented code block. */
function isChildColumn(parent: OpenItem, indent: number): boolean {
  return indent >= parent.contentColumn && indent < parent.contentColumn + CODE_INDENT;
}

/** Whether an item has only blank lines so far, so a line added to it is its first content line. */
function hasNoContent(item: OpenItem): boolean {
  return item.rawLines.every((raw) => raw.trim() === "");
}

/** Canonical content column of an item at `depth`: two columns per level plus the marker and a space. */
function canonicalContentColumn(depth: number): number {
  return 2 * depth + 2;
}

/** Assemble an item's text by joining its raw lines, stripping hard breaks and escapes. Lines
 *  inside a fenced block are code and are kept verbatim, and the line before a fence opener keeps
 *  a trailing backslash because the writer never puts a hard break there. Lines after the first
 *  non-blank one are continuation lines, which carry the escapes of escapeContinuationLine.
 *  A trailing embed line becomes the node's image. The marker determines collapse:
 *  a star on an item with children means collapsed. */
function finishItem(item: OpenItem): void {
  const firstContent = item.rawLines.findIndex((raw) => raw.trim() !== "");
  const lines = item.rawLines.map((raw, i) => {
    if (item.fenced[i]) return raw;
    const keepBackslash = i === item.rawLines.length - 1 || item.fenced[i + 1] === true;
    const unescape = i > firstContent ? unescapeContinuationLine : unescapeLine;
    return unescape(keepBackslash ? raw.trimEnd() : stripHardBreak(raw));
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

/** Finish a list region. An item fence still open here was never closed, and the writer would
 *  escape its opener. */
function closeList(list: ListBuilder, regions: OutlineRegion[], issues: OutlineIssue[]): string[] {
  if (list.itemFence !== null) issues.push({ line: list.itemFence.line, kind: "block-in-item" });
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

/** A bullet match for a line, or null. A thematic break (`* * *`, `- - -`) is not a bullet. */
function matchBullet(line: string): RegExpExecArray | null {
  if (THEMATIC_BREAK_RE.test(line.trim())) return null;
  return BULLET_RE.exec(line);
}

function pushProse(lines: string[], regions: OutlineRegion[]): void {
  if (lines.length === 0) return;
  regions.push({ kind: "prose", lines });
}

/** Open an item for a bullet line, reporting a child marker that CommonMark would not nest where
 *  the parser does. */
function addBullet(list: ListBuilder, m: RegExpExecArray, lineNumber: number, issues: OutlineIssue[]): void {
  const indent = indentWidth(m[1] ?? "");
  const marker = m[2] ?? "-";
  const content = m[3] ?? "";
  while (list.stack.length > 0 && (list.stack[list.stack.length - 1] as OpenItem).indent >= indent) {
    finishItem(list.stack.pop() as OpenItem);
  }
  const node: OutlineNode = { text: "", collapsed: false, children: [] };
  const parent = list.stack[list.stack.length - 1];
  if (parent && !isChildColumn(parent, indent)) issues.push({ line: lineNumber, kind: "misaligned" });
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

function scan(text: string): { parsed: ParsedOutline; issues: OutlineIssue[] } {
  const { frontmatterLines, rest } = splitFrontmatter(text.split(/\r?\n/));
  const issues: OutlineIssue[] = [];
  const regions: OutlineRegion[] = [];
  let prose: string[] = [];
  let list: ListBuilder | null = null;
  let fence: string | null = null;
  let inComment = false;
  let inMath = false;
  let inHtmlComment = false;

  for (const [index, line] of rest.entries()) {
    const lineNumber = frontmatterLines.length + index + 1;
    if (list && fence === null && !inComment) {
      if (list.itemFence !== null) {
        const item = list.stack[list.stack.length - 1] as OpenItem;
        const body = stripColumns(line, item.contentColumn);
        pushRawLine(item, body, true);
        if (FENCE_RE.exec(body)?.[1] === list.itemFence.marker) list.itemFence = null;
        continue;
      }
      if (line.trim() === "") {
        list.pendingBlank.push(line);
        continue;
      }
      const m = matchBullet(line);
      if (m) {
        if (isBlockSyntax(stripHardBreak(m[3] ?? ""))) issues.push({ line: lineNumber, kind: "block-in-item" });
        addBullet(list, m, lineNumber, issues);
        continue;
      }
      const deepest = list.stack[list.stack.length - 1];
      const item = list.pendingBlank.length === 0 ? continuedItem(list, line) : null;
      if (item) {
        if (item !== deepest) issues.push({ line: lineNumber, kind: "misaligned" });
        const body = stripColumns(line, item.contentColumn);
        const fenceMarker = FENCE_RE.exec(body)?.[1];
        if (fenceMarker !== undefined) {
          if (hasNoContent(item)) issues.push({ line: lineNumber, kind: "block-in-item" });
          list.itemFence = { marker: fenceMarker, line: lineNumber };
        } else if (isContinuationBlockSyntax(stripHardBreak(body))) {
          issues.push({ line: lineNumber, kind: "block-in-item" });
        }
        pushRawLine(item, body, fenceMarker !== undefined);
        continue;
      }
      prose = closeList(list, regions, issues);
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
      const trimmed = line.trim();
      if (!inHtmlComment && trimmed.startsWith("$$") && !(trimmed.length > 2 && trimmed.endsWith("$$"))) {
        inMath = !inMath;
      }
      if (!inMath) {
        if (!inHtmlComment && trimmed.startsWith("<!--") && !trimmed.includes("-->")) inHtmlComment = true;
        else if (inHtmlComment && trimmed.includes("-->")) inHtmlComment = false;
      }
    }

    if (fence === null && !inComment && !inMath && !inHtmlComment) {
      const m = matchBullet(line);
      const lastProse = prose[prose.length - 1];
      const emptyMarkerAfterText =
        m !== null && (m[3] ?? "") === "" && lastProse !== undefined && lastProse.trim() !== "";
      if (m && !emptyMarkerAfterText) {
        pushProse(prose, regions);
        prose = [];
        if (indentWidth(m[1] ?? "") >= 2) issues.push({ line: lineNumber, kind: "indented-list" });
        if (isBlockSyntax(stripHardBreak(m[3] ?? ""))) issues.push({ line: lineNumber, kind: "block-in-item" });
        list = { roots: [], stack: [], pendingBlank: [], itemFence: null };
        addBullet(list, m, lineNumber, issues);
        continue;
      }
    }
    prose.push(line);
  }

  if (list) prose = closeList(list, regions, issues);
  pushProse(prose, regions);
  const parsed: ParsedOutline = { frontmatterLines, regions };
  if (text.includes("\r\n")) parsed.lineEnding = "\r\n";
  return { parsed, issues };
}

export function parseOutline(text: string): ParsedOutline {
  return scan(text).parsed;
}

/** Constructs in a note that the writer would not reproduce. Empty for any text the writer produced. */
export function findOutlineIssues(text: string): OutlineIssue[] {
  return scan(text).issues;
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
  const escaped = lines.map((l, i) => {
    if (fenced[i]) return l;
    return i === 0 ? escapeLine(l) : escapeContinuationLine(l);
  });
  return { lines: escaped, fenced };
}

const BARE_MARKER_RE = /^ *[-*]$/;

/** Append written lines to `out`. A bare marker directly under a non-blank line would be read as a
 *  setext heading underline or as part of that paragraph, so a blank line goes between them. */
function appendLines(out: string[], lines: string[]): void {
  const previous = out[out.length - 1];
  const first = lines[0];
  if (first !== undefined && BARE_MARKER_RE.test(first) && previous !== undefined && previous.trim() !== "") {
    out.push("");
  }
  out.push(...lines);
}

/** A node's written lines followed by its children's, or none when it has no text, image, or
 *  written children. A node with no text but with children is a bare marker; its first child
 *  follows with no blank line, since an item that opens with a blank line ends at a second one. */
function nodeLines(node: OutlineNode, depth: number): string[] {
  const { lines, fenced } = contentLines(node);
  if (node.image) {
    lines.push(embedLine(node.image));
    fenced.push(false);
  }
  const childLines = writeNodes(node.children, depth + 1);
  if (lines.length === 0 && childLines.length === 0) return [];
  const indent = INDENT.repeat(depth);
  const marker = node.collapsed && childLines.length > 0 ? "*" : "-";
  if (lines.length === 0) return [`${indent}${marker}`, ...childLines];
  const contentIndent = indent + INDENT;
  const out = lines.map((line, i) => {
    const hardBreak = i < lines.length - 1 && !fenced[i] && !fenced[i + 1];
    const suffix = hardBreak ? "\\" : "";
    if (i === 0) return `${indent}${marker} ${line}${suffix}`;
    return line === "" ? "" : `${contentIndent}${line}${suffix}`;
  });
  appendLines(out, childLines);
  return out;
}

export function writeNodes(nodes: OutlineNode[], depth = 0): string[] {
  const out: string[] = [];
  for (const node of nodes) appendLines(out, nodeLines(node, depth));
  return out;
}

export function writeOutline(parsed: ParsedOutline): string {
  const out: string[] = [...parsed.frontmatterLines];
  for (const region of parsed.regions) {
    if (region.kind === "prose") out.push(...region.lines);
    else appendLines(out, writeNodes(region.roots));
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

/** Outline image for a stored image reference, keeping only the dimensions the note specified. */
export function imageRefToOutline(image: { assetId: string; width: number; height: number }): OutlineImage {
  const outline: OutlineImage = { target: image.assetId };
  if (image.width > 0) outline.width = image.width;
  if (image.height > 0) outline.height = image.height;
  return outline;
}

export function fileNodesToOutline(nodes: MindMapFileNode[]): OutlineNode[] {
  return nodes.map((node) => {
    const outline: OutlineNode = {
      text: node.text,
      collapsed: node.collapsed === true && node.children.length > 0,
      children: fileNodesToOutline(node.children),
    };
    if (node.image) outline.image = imageRefToOutline(node.image);
    return outline;
  });
}
