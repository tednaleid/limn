# Markdown Outline Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `packages/core` everything a Markdown-backed mind map needs: a lossless outline codec (Markdown nested list <-> tree), a `DocumentCapabilities` descriptor that switches off presentation-only actions, a deterministic whole-document layout, and id reconciliation for external updates.

**Architecture:** All new code is host-neutral TypeScript in `packages/core` and is exercised through `TestEditor` and pure-function tests. The codec is a line-based parser and writer over "regions" (prose preserved verbatim, list regions regenerated). Capabilities are data on the `Editor`; enforcement lives in the mutators and in `dispatch`, and `notify()` re-runs a canonical layout when free positioning is off. Nothing here touches the `.limn` file format.

**Tech Stack:** TypeScript (strict), Bun workspaces, vitest, `just` recipes. No new dependencies.

**Spec:** `docs/specs/2026-08-15-markdown-backed-mind-maps-design.md` (sections 5 and 6 are what this plan implements; sections 7 to 9 are plans 2 and 3).

## Global Constraints

- Every new source file starts with two `// ABOUTME:` comment lines.
- No browser globals or React in `packages/core`.
- `.limn` schema (`packages/core/src/serialization/schema.ts`) is not modified.
- Run tests with `just test-file <name>` (a file under `packages/core/src/__tests__/`) or `just test` for everything; `just check` runs coverage + lint + typecheck + obsidian build and is what the pre-commit hook runs. Commits are only made when `just check` is green.
- Never use `--no-verify`. Commit messages are written with a heredoc, never command substitution.
- Match the surrounding code style (two-space indent, double quotes, trailing commas as in neighbors). Do not reformat untouched code.
- Comments describe what the code does now; no ticket ids, no dates, no history.
- Outline dialect (spec section 5), summarized: bullets are `-`, `*`, `+`; `*` on an item with children means collapsed, `-` is written otherwise, `+` is read as open; depth by indent (tab = 4 columns), two-space indent on write; continuation lines are indented to the content column, hard breaks are a trailing backslash (two trailing spaces also accepted on read); unindented non-bullet lines end the list and are prose; frontmatter, fenced code, and `%%` blocks are opaque; embeds `![[target]]`, `![[target|W]]`, `![[target|WxH]]` on an item's last line become the node image; escapes on write are exactly: leading `- `, `* `, `+ `, `#...# ` (or lone `#`), `> `, "```", `~~~`, thematic-break lines, and `digits.`/`digits)` followed by space (backslash before the `.`/`)`).

### File map

| File | Responsibility |
|---|---|
| `packages/core/src/markdown/outline.ts` (new) | Types, `parseOutline`, `writeOutline`, `parseSubtree`, `writeSubtree`, `escapeLine`/`unescapeLine`, conversion to/from `MindMapFileNode` |
| `packages/core/src/markdown/fixtures/*.md` (new) | Golden fixtures for the dialect |
| `packages/core/src/__tests__/outline.test.ts` (new) | Codec tests, round-trip laws |
| `packages/core/src/editor/capabilities.ts` (new) | `DocumentCapabilities`, `FULL_CAPABILITIES`, `OUTLINE_CAPABILITIES` |
| `packages/core/src/editor/Editor.ts` (modify) | get/set capabilities, enforcement, `relayoutAll`, reconciliation option on `applyExternalUpdate`, `toMarkdown` via codec |
| `packages/core/src/layout/layout.ts` (modify) | `reflowSubtree` force direction, `relayoutSubtree` include collapsed, `relayoutAll`, export `TREE_PADDING` |
| `packages/core/src/keybindings/dispatch.ts` (modify) | `requires` on bindings, capability check |
| `packages/core/src/keybindings/shortcutHelp.ts` (modify) | `requires` on entries, `filterShortcutGroups` |
| `packages/core/src/serialization/reconcile.ts` (new) | `reconcileIds` |
| `packages/core/src/serialization/serialization.ts` (modify) | `toMarkdown` delegates to the codec |
| `packages/core/src/store/MindMapStore.ts` (modify) | export `generateNodeId`, `DEFAULT_NODE_WIDTH`, `DEFAULT_NODE_HEIGHT` |
| `packages/core/src/index.ts` (modify) | exports |
| `packages/core/src/__tests__/capabilities.test.ts` (new) | Capability enforcement and dispatch gating |
| `packages/core/src/__tests__/relayout-all.test.ts` (new) | Canonical layout tests |
| `packages/core/src/__tests__/reconcile.test.ts` (new) | Id reconciliation tests |
| `packages/web/src/components/ShortcutsDialog.tsx`, `HamburgerMenu.tsx`, `NodeView.tsx`, `MindMapCanvas.tsx` (modify) | Pass capabilities through for help filtering and the resize handle |

---

### Task 1: Outline parser, structure only

**Files:**
- Create: `packages/core/src/markdown/outline.ts`
- Create: `packages/core/src/markdown/fixtures/basic-nested.md`, `packages/core/src/markdown/fixtures/prose-and-lists.md`, `packages/core/src/markdown/fixtures/fenced-and-comments.md`, `packages/core/src/markdown/fixtures/frontmatter-only.md`
- Test: `packages/core/src/__tests__/outline.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface OutlineImage { target: string; width?: number; height?: number }
  export interface OutlineNode { text: string; collapsed: boolean; image?: OutlineImage; children: OutlineNode[] }
  export type OutlineRegion = { kind: "prose"; lines: string[] } | { kind: "list"; roots: OutlineNode[] };
  export interface ParsedOutline { frontmatterLines: string[]; regions: OutlineRegion[] }
  export function parseOutline(text: string): ParsedOutline
  export function outlineRoots(parsed: ParsedOutline): OutlineNode[]   // all list-region roots in document order
  ```
  Later tasks add `writeOutline`, escapes, collapse, embeds, subtree helpers, and conversions to the same file.

- [ ] **Step 1: Create the fixtures**

`packages/core/src/markdown/fixtures/basic-nested.md`:
```markdown
- Project Plan
  - Phase 1
    - Research
    - Architecture
  - Phase 2
    - Implementation
- Second Root
```

`packages/core/src/markdown/fixtures/prose-and-lists.md`:
```markdown
---
limn-plugin: true
tags:
  - planning
---
# Weekly plan

Some prose before the list.

- Monday
  - Standup
- Tuesday

A paragraph between two lists.

1. ordered lists are prose
2. and stay prose

- Friday
  - Retro
```
(no trailing newline after `  - Retro` is fine either way; the test asserts on structure)

`packages/core/src/markdown/fixtures/fenced-and-comments.md`:
```markdown
- Real item
  - Real child

```md
- not an item, inside a fence
```

%%
- not an item, inside a comment
%%

- Another real item
```

`packages/core/src/markdown/fixtures/frontmatter-only.md`:
```markdown
---
limn-plugin: true
---
```

- [ ] **Step 2: Write the failing tests**

`packages/core/src/__tests__/outline.test.ts`:
```ts
// ABOUTME: Tests for the Markdown outline codec (nested list <-> tree).
// ABOUTME: Covers parsing, writing, escapes, collapse, embeds, and round-trip laws.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseOutline, outlineRoots } from "../markdown/outline";
import type { OutlineNode } from "../markdown/outline";

function fixture(name: string): string {
  return readFileSync(new URL(`../markdown/fixtures/${name}.md`, import.meta.url), "utf8");
}

/** Compact structural view: text with children in brackets. */
function shape(nodes: OutlineNode[]): string {
  return nodes
    .map((n) => (n.children.length ? `${n.text}[${shape(n.children)}]` : n.text))
    .join(",");
}

describe("parseOutline structure", () => {
  test("nested bullets become a tree; two top-level items are two roots", () => {
    const parsed = parseOutline(fixture("basic-nested"));
    expect(parsed.frontmatterLines).toEqual([]);
    expect(parsed.regions.map((r) => r.kind)).toEqual(["list", "prose"]);
    expect(shape(outlineRoots(parsed))).toBe(
      "Project Plan[Phase 1[Research,Architecture],Phase 2[Implementation]],Second Root",
    );
  });

  test("frontmatter is captured, prose regions are preserved, ordered lists are prose", () => {
    const parsed = parseOutline(fixture("prose-and-lists"));
    expect(parsed.frontmatterLines).toEqual(["---", "limn-plugin: true", "tags:", "  - planning", "---"]);
    expect(parsed.regions.map((r) => r.kind)).toEqual(["prose", "list", "prose", "list", "prose"]);
    const prose0 = parsed.regions[0];
    if (prose0?.kind !== "prose") throw new Error("expected prose");
    expect(prose0.lines).toEqual(["# Weekly plan", "", "Some prose before the list.", ""]);
    const prose2 = parsed.regions[2];
    if (prose2?.kind !== "prose") throw new Error("expected prose");
    expect(prose2.lines).toEqual([
      "",
      "A paragraph between two lists.",
      "",
      "1. ordered lists are prose",
      "2. and stay prose",
      "",
    ]);
    expect(shape(outlineRoots(parsed))).toBe("Monday[Standup],Tuesday,Friday[Retro]");
  });

  test("bullets inside fenced code and %% comments are prose", () => {
    const parsed = parseOutline(fixture("fenced-and-comments"));
    expect(shape(outlineRoots(parsed))).toBe("Real item[Real child],Another real item");
    const prose = parsed.regions.filter((r) => r.kind === "prose");
    expect(prose.length).toBeGreaterThanOrEqual(1);
    const middle = parsed.regions[1];
    if (middle?.kind !== "prose") throw new Error("expected prose between lists");
    expect(middle.lines).toContain("- not an item, inside a fence");
    expect(middle.lines).toContain("- not an item, inside a comment");
  });

  test("frontmatter-only note has no roots and one prose region holding the trailing newline", () => {
    const parsed = parseOutline(fixture("frontmatter-only"));
    expect(parsed.frontmatterLines).toEqual(["---", "limn-plugin: true", "---"]);
    expect(outlineRoots(parsed)).toEqual([]);
    expect(parsed.regions).toEqual([{ kind: "prose", lines: [""] }]);
  });

  test("empty string parses to no frontmatter and no regions", () => {
    expect(parseOutline("")).toEqual({ frontmatterLines: [], regions: [{ kind: "prose", lines: [""] }] });
  });

  test("tabs indent four columns; deeper indent nests, equal indent is a sibling, shallower pops", () => {
    const text = "- a\n\t- b\n\t\t- c\n\t- d\n- e";
    expect(shape(outlineRoots(parseOutline(text)))).toBe("a[b[c],d],e");
  });

  test("a bullet with no content is an item with empty text", () => {
    const text = "-\n  - child";
    const roots = outlineRoots(parseOutline(text));
    expect(roots).toHaveLength(1);
    expect(roots[0]?.text).toBe("");
    expect(roots[0]?.children[0]?.text).toBe("child");
  });

  test("blank lines between items stay inside the list region", () => {
    const text = "- a\n\n- b\n";
    const parsed = parseOutline(text);
    expect(parsed.regions.map((r) => r.kind)).toEqual(["list", "prose"]);
    expect(shape(outlineRoots(parsed))).toBe("a,b");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `just test-file outline`
Expected: FAIL, "Cannot find module '../markdown/outline'" (or equivalent).

- [ ] **Step 4: Implement the parser**

`packages/core/src/markdown/outline.ts`:
```ts
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

/** Assemble an item's text from its raw lines. Later tasks add hard-break and escape handling here. */
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
```

Notes for the implementer: `text.split("\n")` on `""` yields `[""]`, which is why an empty string parses to one prose region `[""]`; that single empty line is how the trailing newline of a file survives a round trip. The `%%` toggle counts markers per line so `%% inline %%` on one line does not open a block.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `just test-file outline`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/markdown/outline.ts packages/core/src/markdown/fixtures packages/core/src/__tests__/outline.test.ts
git commit -F - <<'MSG'
Add Markdown outline parser for list regions and prose

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 2: Outline writer and round-trip laws

**Files:**
- Modify: `packages/core/src/markdown/outline.ts`
- Test: `packages/core/src/__tests__/outline.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function writeOutline(parsed: ParsedOutline): string
  export function writeNodes(nodes: OutlineNode[], depth?: number): string[]  // lines for a list region
  ```

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/__tests__/outline.test.ts` (add `writeOutline` to the import):
```ts
describe("writeOutline", () => {
  const FIXTURES = ["basic-nested", "prose-and-lists", "fenced-and-comments", "frontmatter-only"];

  test.each(FIXTURES)("%s: writing a parse is idempotent", (name) => {
    const once = writeOutline(parseOutline(fixture(name)));
    const twice = writeOutline(parseOutline(once));
    expect(twice).toBe(once);
  });

  test.each(FIXTURES)("%s: parse(write(parse(x))) has the same structure as parse(x)", (name) => {
    const first = parseOutline(fixture(name));
    const second = parseOutline(writeOutline(first));
    expect(shape(outlineRoots(second))).toBe(shape(outlineRoots(first)));
    expect(second.frontmatterLines).toEqual(first.frontmatterLines);
    expect(second.regions.map((r) => r.kind)).toEqual(first.regions.map((r) => r.kind));
  });

  test("a canonical note is written back byte for byte", () => {
    const text = fixture("basic-nested");
    expect(writeOutline(parseOutline(text))).toBe(text);
  });

  test("prose regions and frontmatter are preserved verbatim, lists are canonicalized", () => {
    const text = "---\na: 1\n---\nIntro\n\n+ one\n    + two\n\n+ three\n\nOutro\n";
    expect(writeOutline(parseOutline(text))).toBe(
      "---\na: 1\n---\nIntro\n\n- one\n  - two\n- three\n\nOutro\n",
    );
  });

  test("an item with empty text but children is written as a bare marker", () => {
    const parsed = parseOutline("-\n  - child\n");
    expect(writeOutline(parsed)).toBe("-\n  - child\n");
  });

  test("an item with empty text and no children is dropped", () => {
    const parsed = parseOutline("- a\n-\n- b\n");
    expect(writeOutline(parsed)).toBe("- a\n- b\n");
  });

  test("a chain of empty items collapses completely in one write, so writing is idempotent", () => {
    expect(writeOutline(parseOutline("-\n  -\n"))).toBe("");
    expect(writeOutline(parseOutline("- a\n  -\n    -\n- b\n"))).toBe("- a\n- b\n");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `just test-file outline`
Expected: FAIL, `writeOutline` is not exported.

- [ ] **Step 3: Implement the writer**

Add to `packages/core/src/markdown/outline.ts`:
```ts
const INDENT = "  ";

/** Lines of a node's text ready to be written; later tasks add escaping and the image line here. */
function contentLines(node: OutlineNode): string[] {
  return node.text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l !== "");
}

function writeNode(node: OutlineNode, depth: number, out: string[]): void {
  const lines = contentLines(node);
  const childLines: string[] = [];
  for (const child of node.children) writeNode(child, depth + 1, childLines);
  if (lines.length === 0 && childLines.length === 0) return;
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
```

(The fixtures have no multi-line items yet; hard-break handling in `finishItem` arrives in Task 3.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `just test-file outline`
Expected: PASS.

If "prose regions and frontmatter are preserved verbatim" fails on the blank line between `- one` / `- two` and `- three`: the blank line inside the list region is dropped on write by design (blank lines between items are normalized away); confirm the parser put that blank into `pendingBlank` and that `closeList` returned it only when the list ended (it did not end there because `* three` is a bullet).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/markdown/outline.ts packages/core/src/__tests__/outline.test.ts
git commit -F - <<'MSG'
Add Markdown outline writer with round-trip tests

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---
### Task 3: Node text: continuation lines, hard breaks, escapes

**Files:**
- Modify: `packages/core/src/markdown/outline.ts`
- Test: `packages/core/src/__tests__/outline.test.ts`

**Interfaces:**
- Produces: `export function escapeLine(line: string): string`, `export function unescapeLine(line: string): string` (exported for tests and for the clipboard code in plan 3).

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/__tests__/outline.test.ts` (add `escapeLine`, `unescapeLine` to the import):
```ts
describe("node text", () => {
  test("multi-line text is written as backslash continuation lines and read back", () => {
    const node: OutlineNode = { text: "Alpha\nBeta\nGamma", collapsed: false, children: [] };
    const parsed = { frontmatterLines: [], regions: [{ kind: "list" as const, roots: [node] }] };
    const text = writeOutline(parsed);
    expect(text).toBe("- Alpha\\\n  Beta\\\n  Gamma");
    expect(outlineRoots(parseOutline(text))[0]?.text).toBe("Alpha\nBeta\nGamma");
  });

  test("two trailing spaces are also read as a hard break; trailing whitespace is trimmed", () => {
    const text = "- Alpha  \n  Beta \n- Next";
    const roots = outlineRoots(parseOutline(text));
    expect(roots[0]?.text).toBe("Alpha\nBeta");
    expect(roots[1]?.text).toBe("Next");
  });

  test("continuation lines keep indentation beyond the content column", () => {
    const text = "- code:\\\n    indented\n";
    const roots = outlineRoots(parseOutline(text));
    expect(roots[0]?.text).toBe("code:\n  indented");
    expect(writeOutline(parseOutline(text))).toBe(text);
  });

  test("an unindented non-bullet line ends the list and is prose, not node text", () => {
    const parsed = parseOutline("- item\nlazy line\n- next\n");
    expect(shape(outlineRoots(parsed))).toBe("item,next");
    expect(parsed.regions[1]).toEqual({ kind: "prose", lines: ["lazy line"] });
  });

  test("blank lines inside node text collapse to a single break on write", () => {
    const node: OutlineNode = { text: "a\n\n\nb", collapsed: false, children: [] };
    expect(writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots: [node] }] })).toBe("- a\\\n  b");
  });

  test("leading whitespace on the first line is trimmed on write so the content column stays canonical", () => {
    const node: OutlineNode = { text: "   padded\nsecond", collapsed: false, children: [] };
    const text = writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots: [node] }] });
    expect(text).toBe("- padded\\\n  second");
    expect(outlineRoots(parseOutline(text))[0]?.text).toBe("padded\nsecond");
  });

  test.each([
    ["- looks like a bullet", "\\- looks like a bullet"],
    ["* star", "\\* star"],
    ["+ plus", "\\+ plus"],
    ["-", "\\-"],
    ["# Heading", "\\# Heading"],
    ["### Deep", "\\### Deep"],
    ["#", "\\#"],
    ["> quote", "\\> quote"],
    ["```js", "\\```js"],
    ["~~~", "\\~~~"],
    ["***", "\\***"],
    ["- - -", "\\- - -"],
    ["___", "\\___"],
    ["1. one", "1\\. one"],
    ["12) twelve", "12\\) twelve"],
    ["3.", "3\\."],
  ])("escapes %j as %j and unescapes back", (raw, escaped) => {
    expect(escapeLine(raw)).toBe(escaped);
    expect(unescapeLine(escaped)).toBe(raw);
  });

  test.each(["#tag", "[[Note]]", "[ ] task", "**bold** text", "-not a bullet", "1.5 is a number", "\\*kept\\*"])(
    "leaves %j alone in both directions",
    (raw) => {
      expect(escapeLine(raw)).toBe(raw);
      expect(unescapeLine(raw)).toBe(raw);
    },
  );

  test("an indented continuation line that starts like a bullet is escaped after its own indent", () => {
    const node: OutlineNode = { text: "a\n  - b\n  ***", collapsed: false, children: [] };
    const text = writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots: [node] }] });
    expect(text).toBe("- a\\\n    \\- b\\\n    \\***");
    const back = outlineRoots(parseOutline(text));
    expect(back).toHaveLength(1);
    expect(back[0]?.text).toBe("a\n  - b\n  ***");
    expect(back[0]?.children).toEqual([]);
  });

  test("escapes apply to every line of node text and round-trip through the file", () => {
    const node: OutlineNode = { text: "first\n- second\n# third", collapsed: false, children: [] };
    const text = writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots: [node] }] });
    expect(text).toBe("- first\\\n  \\- second\\\n  \\# third");
    const back = outlineRoots(parseOutline(text));
    expect(shape(back)).toBe("first\n- second\n# third");
    expect(back[0]?.children).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `just test-file outline`
Expected: FAIL (escapes not exported; multi-line expectations differ).

- [ ] **Step 3: Implement escapes, hard breaks, and first-line trimming**

In `packages/core/src/markdown/outline.ts`, add near the top:
```ts
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

/** Remove a trailing hard-break marker (backslash or two spaces) and trailing whitespace. */
function stripHardBreak(line: string): string {
  const trimmed = line.trimEnd();
  if (line.endsWith("\\")) return line.slice(0, -1).trimEnd();
  return trimmed;
}
```

Replace `finishItem`:
```ts
function finishItem(item: OpenItem): void {
  const lines = item.rawLines.map((raw, i) => {
    const line = i < item.rawLines.length - 1 ? stripHardBreak(raw) : raw.trimEnd();
    return unescapeLine(line);
  });
  item.node.text = lines.join("\n");
}
```

Replace `contentLines`:
```ts
function contentLines(node: OutlineNode): string[] {
  const lines = node.text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l !== "")
    .map(escapeLine);
  if (lines[0] !== undefined) lines[0] = lines[0].trimStart();
  return lines;
}
```
Note the order: `escapeLine` runs before the first-line `trimStart`, so a first line of `"   - x"` becomes `"- x"` after trimming, which would then be misread. Swap the two so trimming happens first: map `trimEnd`, filter, then `lines[0] = lines[0].trimStart()`, then map `escapeLine`. Write it that way:
```ts
function contentLines(node: OutlineNode): string[] {
  const lines = node.text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l !== "");
  if (lines[0] !== undefined) lines[0] = lines[0].trimStart();
  return lines.map(escapeLine);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `just test-file outline`
Expected: PASS. If "escapes apply to every line" fails on shape: `shape()` joins with `,` and prints raw text including newlines; the expected string in the test contains real newlines, which is intended.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/markdown/outline.ts packages/core/src/__tests__/outline.test.ts
git commit -F - <<'MSG'
Outline codec: continuation lines, hard breaks, and escapes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 4: Collapse marker and image embeds

**Files:**
- Modify: `packages/core/src/markdown/outline.ts`
- Create: `packages/core/src/markdown/fixtures/collapse-and-images.md`
- Test: `packages/core/src/__tests__/outline.test.ts`

**Interfaces:**
- Consumes: `OutlineNode.collapsed`, `OutlineNode.image` from Task 1.
- Produces: parse and write behavior only; no new exports.

- [ ] **Step 1: Create the fixture**

`packages/core/src/markdown/fixtures/collapse-and-images.md`:
```markdown
- Open parent
  - child
* Collapsed parent
  - hidden child
* leaf with star is open
+ plus is open
  - child of plus
- ![[diagram.png|300]]
- Caption\
  ![[photo.jpg|200x150]]
- Text with an embed in the middle ![[inline.png]] stays text
```

- [ ] **Step 2: Write the failing tests**

Append to `packages/core/src/__tests__/outline.test.ts`:
```ts
describe("collapse marker and embeds", () => {
  test("star marker on an item with children means collapsed; star or plus on a leaf is open", () => {
    const roots = outlineRoots(parseOutline(fixture("collapse-and-images")));
    expect(roots[0]?.collapsed).toBe(false);
    expect(roots[1]?.collapsed).toBe(true);
    expect(roots[2]?.collapsed).toBe(false);
    expect(roots[3]?.collapsed).toBe(false);
    expect(roots[3]?.children).toHaveLength(1);
  });

  test("collapsed nodes with children write a star; everything else writes a dash", () => {
    const roots: OutlineNode[] = [
      { text: "a", collapsed: true, children: [{ text: "b", collapsed: false, children: [] }] },
      { text: "c", collapsed: true, children: [] },
    ];
    expect(writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots }] })).toBe("* a\n  - b\n- c");
  });

  test("an embed on the last line becomes the node image; width and height are read", () => {
    const roots = outlineRoots(parseOutline(fixture("collapse-and-images")));
    expect(roots[4]?.text).toBe("");
    expect(roots[4]?.image).toEqual({ target: "diagram.png", width: 300, height: undefined });
    expect(roots[5]?.text).toBe("Caption");
    expect(roots[5]?.image).toEqual({ target: "photo.jpg", width: 200, height: 150 });
    expect(roots[6]?.image).toBeUndefined();
    expect(roots[6]?.text).toBe("Text with an embed in the middle ![[inline.png]] stays text");
  });

  test("images write as the last line with width only", () => {
    const roots: OutlineNode[] = [
      { text: "", collapsed: false, image: { target: "a.png", width: 120, height: 80 }, children: [] },
      { text: "two\nlines", collapsed: false, image: { target: "b.png", width: 50 }, children: [] },
      { text: "no size", collapsed: false, image: { target: "c.png" }, children: [] },
    ];
    expect(writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots }] })).toBe(
      "- ![[a.png|120]]\n- two\\\n  lines\\\n  ![[b.png|50]]\n- no size\\\n  ![[c.png]]",
    );
  });

  test("the fixture round-trips idempotently and keeps its structure", () => {
    const text = fixture("collapse-and-images");
    const once = writeOutline(parseOutline(text));
    expect(writeOutline(parseOutline(once))).toBe(once);
    expect(shape(outlineRoots(parseOutline(once)))).toBe(shape(outlineRoots(parseOutline(text))));
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `just test-file outline`
Expected: FAIL (collapsed always false; image undefined).

- [ ] **Step 4: Implement collapse and embeds**

In `packages/core/src/markdown/outline.ts` add:
```ts
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
```

Replace `finishItem`:
```ts
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
```
`finishItem` runs when an item is popped, after all its children have been added, so `children.length` is final.

Update the writer. In `writeNode`:
```ts
function writeNode(node: OutlineNode, depth: number, out: string[]): void {
  const lines = contentLines(node);
  if (node.image) lines.push(embedLine(node.image));
  const childLines: string[] = [];
  for (const child of node.children) writeNode(child, depth + 1, childLines);
  if (lines.length === 0 && childLines.length === 0) return;
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
```
The embed line is appended after `contentLines` returns, so it is never escaped (its first character is `!`, which `escapeLine` leaves alone anyway).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `just test-file outline`
Expected: PASS. The `toEqual({ target, width: 300, height: undefined })` assertions rely on `parseEmbedLine` always setting both keys, which it does.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/markdown/outline.ts packages/core/src/markdown/fixtures/collapse-and-images.md packages/core/src/__tests__/outline.test.ts
git commit -F - <<'MSG'
Outline codec: bullet-marker collapse and image embeds

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 5: Subtree helpers, file-node conversion, and toMarkdown

**Files:**
- Modify: `packages/core/src/markdown/outline.ts`
- Modify: `packages/core/src/store/MindMapStore.ts` (export id generator and default sizes)
- Modify: `packages/core/src/serialization/serialization.ts` (`toMarkdown`)
- Modify: `packages/core/src/index.ts` (exports)
- Modify tests: `packages/core/src/__tests__/serialization.test.ts`, `packages/core/src/__tests__/editor.test.ts`
- Test: `packages/core/src/__tests__/outline.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // outline.ts
  export function writeSubtree(nodes: OutlineNode[]): string
  export function parseSubtree(text: string): OutlineNode[]
  export const OUTLINE_IMAGE_PLACEHOLDER = 200
  export function outlineToFileNodes(nodes: OutlineNode[], nextId: () => string): MindMapFileNode[]
  export function fileNodesToOutline(nodes: MindMapFileNode[]): OutlineNode[]
  // MindMapStore.ts
  export function generateNodeId(): string
  export const DEFAULT_NODE_WIDTH = 100
  export const DEFAULT_NODE_HEIGHT = 32
  ```
  `toMarkdown(store)` (serialization.ts) and `Editor.toMarkdown()` now emit the pure-list dialect.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/__tests__/outline.test.ts` (extend the import with `writeSubtree`, `parseSubtree`, `outlineToFileNodes`, `fileNodesToOutline`, `OUTLINE_IMAGE_PLACEHOLDER`, and add `import { generateNodeId, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from "../store/MindMapStore";`):
```ts
describe("subtree helpers and file-node conversion", () => {
  test("writeSubtree and parseSubtree round-trip a forest without frontmatter or prose", () => {
    const nodes: OutlineNode[] = [
      { text: "a", collapsed: false, children: [{ text: "b", collapsed: false, children: [] }] },
      { text: "c", collapsed: false, children: [] },
    ];
    const text = writeSubtree(nodes);
    expect(text).toBe("- a\n  - b\n- c");
    expect(parseSubtree(text)).toEqual(nodes);
  });

  test("parseSubtree ignores prose and returns roots from every list", () => {
    expect(shape(parseSubtree("intro\n- a\n\ntext\n- b"))).toBe("a,b");
  });

  test("outlineToFileNodes assigns ids, placeholder geometry, and maps collapse and images", () => {
    let n = 0;
    const nextId = () => `t${n++}`;
    const nodes: OutlineNode[] = [
      {
        text: "root",
        collapsed: true,
        image: { target: "pic.png", width: 300 },
        children: [{ text: "kid", collapsed: false, children: [] }],
      },
    ];
    const file = outlineToFileNodes(nodes, nextId);
    expect(file).toEqual([
      {
        id: "t0",
        text: "root",
        x: 0,
        y: 0,
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        collapsed: true,
        image: { assetId: "pic.png", width: 300, height: 300 },
        children: [
          { id: "t1", text: "kid", x: 0, y: 0, width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT, children: [] },
        ],
      },
    ]);
  });

  test("an image with no size gets the square placeholder; an explicit height is kept", () => {
    const [a, b] = outlineToFileNodes(
      [
        { text: "", collapsed: false, image: { target: "a.png" }, children: [] },
        { text: "", collapsed: false, image: { target: "b.png", width: 100, height: 40 }, children: [] },
      ],
      generateNodeId,
    );
    expect(a?.image).toEqual({ assetId: "a.png", width: OUTLINE_IMAGE_PLACEHOLDER, height: OUTLINE_IMAGE_PLACEHOLDER });
    expect(b?.image).toEqual({ assetId: "b.png", width: 100, height: 40 });
  });

  test("fileNodesToOutline drops geometry and ids and keeps text, collapse, and image", () => {
    const outline = fileNodesToOutline([
      {
        id: "n9",
        text: "root",
        x: 10,
        y: 20,
        width: 120,
        height: 40,
        collapsed: true,
        image: { assetId: "pic.png", width: 300, height: 200 },
        children: [{ id: "n10", text: "kid", x: 0, y: 0, width: 1, height: 1, children: [] }],
      },
      { id: "n11", text: "collapsed leaf is not collapsed", x: 0, y: 0, width: 1, height: 1, collapsed: true, children: [] },
    ]);
    expect(outline).toEqual([
      {
        text: "root",
        collapsed: true,
        image: { target: "pic.png", width: 300, height: 200 },
        children: [{ text: "kid", collapsed: false, children: [] }],
      },
      { text: "collapsed leaf is not collapsed", collapsed: false, children: [] },
    ]);
  });

  test("generateNodeId yields fresh n-ids that do not collide with loaded ids", () => {
    const a = generateNodeId();
    const b = generateNodeId();
    expect(a).toMatch(/^n\d+$/);
    expect(b).not.toBe(a);
  });
});
```

Update `packages/core/src/__tests__/serialization.test.ts` `describe("toMarkdown")` to the new shape:
```ts
  describe("toMarkdown", () => {
    test("generates a nested bullet outline from store", () => {
      const store = deserialize(sampleFile);
      const md = toMarkdown(store);
      expect(md).toBe(
        [
          "- Project Plan",
          "  - Phase 1",
          "    - Research",
          "    - Architecture",
          "  * Phase 2",
          "    - Implementation",
        ].join("\n"),
      );
    });

    test("handles empty store", () => {
      const store = new MindMapStore();
      const md = toMarkdown(store);
      expect(md).toBe("");
    });

    test("handles multiple roots", () => {
      const store = new MindMapStore();
      store.addRoot("Root A");
      store.addRoot("Root B");
      const md = toMarkdown(store);
      expect(md).toBe("- Root A\n- Root B");
    });
  });
```
(`sampleFile` in that test is Project Plan > Phase 1 > [Research, Architecture] and Project Plan > Phase 2 > [Implementation], so the expected string above is exact.)

Update `packages/core/src/__tests__/editor.test.ts` `describe("toMarkdown")`:
```ts
  describe("toMarkdown", () => {
    test("exports a nested bullet outline from current state", () => {
      const md = editor.toMarkdown();
      expect(md).toBe("- Root\n  - Child 1\n    - Grandchild\n  - Child 2");
    });
  });
```
(`sampleMap` at the top of that file is Root > Child 1 > Grandchild and Root > Child 2, so the expected string is exact.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `just test-file outline` and `just test-file serialization` and `just test-file editor`
Expected: FAIL (missing exports; old heading-based output).

- [ ] **Step 3: Implement**

`packages/core/src/store/MindMapStore.ts`: after `generateId`, add
```ts
/** Fresh node id from the shared counter, for callers that build nodes outside the store. */
export function generateNodeId(): string {
  return generateId();
}
```
and change the two constants to exports:
```ts
export const DEFAULT_NODE_WIDTH = 100;
export const DEFAULT_NODE_HEIGHT = 32;
```
replacing every use of `DEFAULT_WIDTH` / `DEFAULT_HEIGHT` in that file with the new names.

`packages/core/src/markdown/outline.ts`: add imports and functions
```ts
import type { MindMapFileNode } from "../serialization/schema";
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from "../store/MindMapStore";

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
```
Order matters for the `toEqual` in the test: build `children` after `image` is set? `toEqual` ignores key order, so either is fine.

`packages/core/src/serialization/serialization.ts`: replace the body of `toMarkdown`:
```ts
import type { OutlineNode } from "../markdown/outline";
import { writeSubtree } from "../markdown/outline";

/** Nested bullet outline of the store in the Limn Markdown dialect. */
export function toMarkdown(store: MindMapStore): string {
  const toOutline = (node: MindMapNode): OutlineNode => {
    const outline: OutlineNode = {
      text: node.text,
      collapsed: node.collapsed && node.children.length > 0,
      children: store.getChildren(node.id).map(toOutline),
    };
    if (node.image) {
      outline.image = { target: node.image.assetId, width: node.image.width, height: node.image.height };
    }
    return outline;
  };
  return writeSubtree(store.getRoots().map(toOutline));
}
```
Update the ABOUTME second line of serialization.ts only if it becomes untrue (it says "Also provides markdown export"; still true).

`packages/core/src/index.ts`: add
```ts
export {
  parseOutline,
  writeOutline,
  outlineRoots,
  writeNodes,
  writeSubtree,
  parseSubtree,
  escapeLine,
  unescapeLine,
  outlineToFileNodes,
  fileNodesToOutline,
  OUTLINE_IMAGE_PLACEHOLDER,
} from "./markdown/outline";
export type { OutlineNode, OutlineImage, OutlineRegion, ParsedOutline } from "./markdown/outline";
export { generateNodeId, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from "./store/MindMapStore";
```
(`MindMapStore` and `resetIdCounter` are already exported from that module; extend that line instead of adding a second export from the same module.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `just test`
Expected: PASS across all packages (web tests import `@limn/core` and must still typecheck).

- [ ] **Step 5: Run the full check and commit**

Run: `just check`
Expected: coverage, lint, typecheck, and obsidian build all green.

```bash
git add packages/core/src/markdown/outline.ts packages/core/src/store/MindMapStore.ts packages/core/src/serialization/serialization.ts packages/core/src/index.ts packages/core/src/__tests__/outline.test.ts packages/core/src/__tests__/serialization.test.ts packages/core/src/__tests__/editor.test.ts
git commit -F - <<'MSG'
Outline codec: subtree helpers, file-node conversion, pure-list toMarkdown

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---
### Task 6: DocumentCapabilities on the Editor

**Files:**
- Create: `packages/core/src/editor/capabilities.ts`
- Modify: `packages/core/src/editor/Editor.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/capabilities.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // capabilities.ts
  export interface DocumentCapabilities {
    freePosition: boolean;
    sides: boolean;
    widthResize: boolean;
    nodeColor: boolean;
    collapsePersisted: boolean;
  }
  export const FULL_CAPABILITIES: DocumentCapabilities;
  export const OUTLINE_CAPABILITIES: DocumentCapabilities;
  // Editor
  getCapabilities(): DocumentCapabilities
  setCapabilities(caps: DocumentCapabilities): void
  ```
  Enforcement (all no-ops when the named capability is off): `nudgeNode`, `setNodePosition`, `startWidthResize`, text branch of `resizeNode` (`freePosition` / `widthResize`); `cycleNodeColor`, `setNodeColorIndex` (`nodeColor`); `addChild` direction forced to `1`, `flipBranchSide` no-op, `spatialReparent` hint forced to `1` (`sides`). Task 8 adds the canonical relayout that makes drags snap back.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/__tests__/capabilities.test.ts`:
```ts
// ABOUTME: Tests for DocumentCapabilities enforcement in the Editor.
// ABOUTME: Blocked actions leave the document unchanged; allowed ones behave as usual.

import { describe, test, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { FULL_CAPABILITIES, OUTLINE_CAPABILITIES } from "../editor/capabilities";
import type { MindMapFileFormat } from "../serialization/schema";

const sampleMap: MindMapFileFormat = {
  version: 1,
  meta: { id: "caps", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
  camera: { x: 0, y: 0, zoom: 1 },
  roots: [
    {
      id: "n0",
      text: "Root",
      x: 0,
      y: 0,
      width: 100,
      height: 32,
      children: [
        { id: "n1", text: "Child 1", x: 250, y: -30, width: 100, height: 32, children: [] },
        { id: "n2", text: "Child 2", x: 250, y: 30, width: 100, height: 32, children: [] },
      ],
    },
  ],
  assets: [],
};

function snapshot(editor: TestEditor): string {
  return JSON.stringify(editor.toJSON().roots);
}

describe("DocumentCapabilities", () => {
  let editor: TestEditor;

  beforeEach(() => {
    editor = new TestEditor();
    editor.loadJSON(sampleMap);
  });

  test("defaults to FULL_CAPABILITIES and setCapabilities replaces the set", () => {
    expect(editor.getCapabilities()).toEqual(FULL_CAPABILITIES);
    editor.setCapabilities(OUTLINE_CAPABILITIES);
    expect(editor.getCapabilities()).toEqual(OUTLINE_CAPABILITIES);
    expect(editor.getCapabilities().freePosition).toBe(false);
  });

  describe("with OUTLINE_CAPABILITIES", () => {
    beforeEach(() => {
      editor.setCapabilities(OUTLINE_CAPABILITIES);
    });

    test("nudgeNode and setNodePosition do nothing and add no undo entry", () => {
      const before = snapshot(editor);
      editor.nudgeNode("n1", 20, 20);
      editor.setNodePosition("n1", 999, 999);
      expect(snapshot(editor)).toBe(before);
      expect(editor.canUndo()).toBe(false);
    });

    test("width resize by keyboard and by handle does nothing", () => {
      const before = snapshot(editor);
      editor.resizeNode("n1", 40);
      editor.startWidthResize("n1");
      expect(editor.isResizingWidth()).toBe(false);
      editor.updateWidthResize(300);
      editor.endWidthResize();
      expect(snapshot(editor)).toBe(before);
      expect(editor.getNode("n1").widthConstrained).toBe(false);
      expect(editor.canUndo()).toBe(false);
    });

    test("image resize still works because images map to an embed width", () => {
      editor.setNodeImage("n1", { id: "pic.png", filename: "pic.png", mimeType: "image/png", width: 400, height: 200 }, 200, 100);
      editor.resizeNode("n1", 20);
      expect(editor.getNode("n1").image?.width).toBe(220);
      expect(editor.getNode("n1").image?.height).toBe(110);
    });

    test("color cycling and setNodeColorIndex do nothing", () => {
      const before = snapshot(editor);
      editor.cycleNodeColor("n1", 1);
      editor.setNodeColorIndex("n1", 5);
      expect(snapshot(editor)).toBe(before);
      expect(editor.canUndo()).toBe(false);
    });

    test("addChild ignores a left-side hint: the child lands to the right of the root", () => {
      const id = editor.addChild("n0", "left?", -1);
      expect(editor.getNode(id).x).toBeGreaterThan(editor.getNode("n0").x);
    });

    test("Alt+Left on a root child (side flip) does nothing", () => {
      editor.select("n1");
      const before = snapshot(editor);
      editor.moveNode("n1", "left");
      expect(snapshot(editor)).toBe(before);
    });

    test("structural actions still work: add sibling, indent, delete, undo", () => {
      editor.select("n1");
      const sib = editor.addSibling("n1", "Child 1b");
      expect(sib).not.toBeNull();
      editor.exitEditMode();
      editor.moveNode(sib as string, "right");
      expect(editor.getNode(sib as string).parentId).toBe("n1");
      editor.deleteNode(sib as string);
      expect(editor.getNode("n1").children).toEqual([]);
      editor.undo();
      expect(editor.getNode("n1").children).toHaveLength(1);
    });
  });

  test("with FULL_CAPABILITIES the same presentation actions do change the document", () => {
    const before = snapshot(editor);
    editor.nudgeNode("n1", 20, 20);
    expect(snapshot(editor)).not.toBe(before);
    editor.cycleNodeColor("n2", 1);
    expect(editor.getNode("n2").style?.colorIndex).toBeDefined();
    editor.startWidthResize("n2");
    expect(editor.isResizingWidth()).toBe(true);
    editor.endWidthResize();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `just test-file capabilities`
Expected: FAIL, "Cannot find module '../editor/capabilities'".

- [ ] **Step 3: Implement**

`packages/core/src/editor/capabilities.ts`:
```ts
// ABOUTME: Describes which presentation features a document's backing store can hold.
// ABOUTME: Hosts set this once per document; the Editor and dispatch consult it.

export interface DocumentCapabilities {
  /** Free drag offsets, nudge, and setNodePosition. Off means layout is always canonical. */
  freePosition: boolean;
  /** Children may sit left of a root; side flips are meaningful. */
  sides: boolean;
  /** Users may constrain a node's text width. */
  widthResize: boolean;
  /** Users may pick per-node branch colors. */
  nodeColor: boolean;
  /** Collapse state survives a save/load cycle in this store. */
  collapsePersisted: boolean;
}

export const FULL_CAPABILITIES: DocumentCapabilities = {
  freePosition: true,
  sides: true,
  widthResize: true,
  nodeColor: true,
  collapsePersisted: true,
};

/** A Markdown nested list: structure and text only; collapse rides on the bullet marker. */
export const OUTLINE_CAPABILITIES: DocumentCapabilities = {
  freePosition: false,
  sides: false,
  widthResize: false,
  nodeColor: false,
  collapsePersisted: true,
};
```

`packages/core/src/editor/Editor.ts`:

Import at top:
```ts
import { FULL_CAPABILITIES } from "./capabilities";
import type { DocumentCapabilities } from "./capabilities";
```

Field, next to `protected meta`:
```ts
  // What the backing document can hold; hosts set this once per document
  private capabilities: DocumentCapabilities = FULL_CAPABILITIES;
```

Accessors, in the "State access" section after `getNodeDepth`:
```ts
  getCapabilities(): DocumentCapabilities {
    return this.capabilities;
  }

  setCapabilities(caps: DocumentCapabilities): void {
    this.capabilities = { ...caps };
    this.notify();
  }
```

Enforcement, first line of each method:
```ts
  setNodeColorIndex(id: string, colorIndex: number): void {
    if (!this.capabilities.nodeColor) return;
    ...
  cycleNodeColor(id: string, direction: 1 | -1): void {
    if (!this.capabilities.nodeColor) return;
    ...
  nudgeNode(nodeId: string, dx: number, dy: number): void {
    if (!this.capabilities.freePosition) return;
    ...
  setNodePosition(nodeId: string, x: number, y: number): void {
    if (!this.capabilities.freePosition) return;
    ...
  startWidthResize(nodeId: string): void {
    if (!this.capabilities.widthResize) return;
    ...
```
In `resizeNode`, the `else` (text width) branch begins with:
```ts
    } else {
      if (!this.capabilities.widthResize) return;
      const newWidth = clampNodeWidth(node.width + delta);
```
In `addChild`, before `positionNewChild`:
```ts
    const sideHint = this.capabilities.sides ? direction : 1;
    positionNewChild(this.store, id, sideHint);
```
In `flipBranchSide`, first line:
```ts
    if (!this.capabilities.sides) return;
```
In `spatialReparent`, where `directionHint` is computed for the horizontal case:
```ts
      const directionHint = !this.capabilities.sides
        ? 1
        : target.parentId === null
          ? (direction === "right" ? -1 : 1)
          : branchDirection(this.store, target.id);
```

`packages/core/src/index.ts`:
```ts
export { FULL_CAPABILITIES, OUTLINE_CAPABILITIES } from "./editor/capabilities";
export type { DocumentCapabilities } from "./editor/capabilities";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `just test-file capabilities` then `just test`
Expected: PASS. If "Alt+Left on a root child does nothing" fails: `moveNode("n1","left")` on a right-side child of a root goes through `moveNodeHorizontal` -> towardParent -> parent is root -> `flipBranchSide`, which now returns early; confirm no `pushUndo` happened before the guard.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/editor/capabilities.ts packages/core/src/editor/Editor.ts packages/core/src/index.ts packages/core/src/__tests__/capabilities.test.ts
git commit -F - <<'MSG'
Add DocumentCapabilities and enforce them in the Editor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 7: Capability gating in dispatch, shortcut help, and the web resize handle

**Files:**
- Modify: `packages/core/src/keybindings/dispatch.ts`
- Modify: `packages/core/src/keybindings/shortcutHelp.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/web/src/components/ShortcutsDialog.tsx`, `packages/web/src/components/HamburgerMenu.tsx`, `packages/web/src/components/NodeView.tsx`, `packages/web/src/components/MindMapCanvas.tsx`
- Test: `packages/core/src/__tests__/capabilities.test.ts`, `packages/core/src/__tests__/shortcut-help.test.ts`

**Interfaces:**
- Consumes: `Editor.getCapabilities()` from Task 6.
- Produces:
  ```ts
  // dispatch.ts: KeyBinding.requires?: keyof DocumentCapabilities  (internal)
  // shortcutHelp.ts
  export interface ShortcutEntry { keys: string[]; description: string; altKeys?: string[]; requires?: keyof DocumentCapabilities }
  export function filterShortcutGroups(groups: ShortcutGroup[], caps: DocumentCapabilities): ShortcutGroup[]
  // web
  ShortcutsDialogProps.capabilities?: DocumentCapabilities
  NodeViewProps.showResizeHandle?: boolean   (default true)
  ```

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/__tests__/capabilities.test.ts` inside `describe("DocumentCapabilities")`:
```ts
  describe("dispatch gating", () => {
    test("Ctrl+ArrowRight nudges under full capabilities and is unhandled under outline capabilities", () => {
      editor.select("n1");
      const x0 = editor.getNode("n1").x;
      editor.pressKey("ArrowRight", { ctrl: true });
      expect(editor.getNode("n1").x).toBe(x0 + 20);

      editor.setCapabilities(OUTLINE_CAPABILITIES);
      const x1 = editor.getNode("n1").x;
      editor.pressKey("ArrowRight", { ctrl: true });
      editor.pressKey("l", { ctrl: true });
      expect(editor.getNode("n1").x).toBe(x1);
    });

    test("c and Shift+c are unhandled under outline capabilities", () => {
      editor.setCapabilities(OUTLINE_CAPABILITIES);
      editor.select("n1");
      editor.pressKey("c");
      editor.pressKey("c", { shift: true });
      expect(editor.getNode("n1").style?.colorIndex).toBeUndefined();
    });
  });
```
Also assert the return value of `dispatch` directly. Add to the same describe:
```ts
    test("dispatch returns false for a gated binding so hosts can let the key propagate", () => {
      editor.setCapabilities(OUTLINE_CAPABILITIES);
      editor.select("n1");
      expect(dispatch(editor, "c")).toBe(false);
      expect(dispatch(editor, "ArrowUp", { ctrl: true })).toBe(false);
      expect(dispatch(editor, "ArrowUp", { alt: true })).toBe(true);
    });
```
with `import { dispatch } from "../keybindings/dispatch";` at the top of the file.

Add to `packages/core/src/__tests__/shortcut-help.test.ts` (read the file first; add a new `describe` at the end using its existing imports plus `filterShortcutGroups`, `FULL_CAPABILITIES`, `OUTLINE_CAPABILITIES`):
```ts
describe("filterShortcutGroups", () => {
  test("full capabilities keep every group and entry", () => {
    const filtered = filterShortcutGroups(SHORTCUT_GROUPS, FULL_CAPABILITIES);
    expect(filtered).toEqual(SHORTCUT_GROUPS);
  });

  test("outline capabilities drop nudge and color entries and drop a group that becomes empty", () => {
    const filtered = filterShortcutGroups(SHORTCUT_GROUPS, OUTLINE_CAPABILITIES);
    const descriptions = filtered.flatMap((g) => g.entries.map((e) => e.description));
    expect(descriptions).not.toContain("Nudge node");
    expect(descriptions).not.toContain("Cycle branch color forward");
    expect(descriptions).toContain("Reflow children to computed layout");
    expect(descriptions).toContain("Toggle collapse");
    for (const group of filtered) expect(group.entries.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `just test-file capabilities` and `just test-file shortcut-help`
Expected: FAIL (nudge still applied; `filterShortcutGroups` missing).

- [ ] **Step 3: Implement**

`packages/core/src/keybindings/dispatch.ts`:
```ts
import type { DocumentCapabilities } from "../editor/capabilities";

interface KeyBinding {
  key: string;
  modifiers?: Modifiers;
  mode: "nav" | "edit" | "both";
  /** Capability the binding needs; the binding is skipped when the Editor's document lacks it. */
  requires?: keyof DocumentCapabilities;
  action: (editor: Editor) => void;
}
```
Add `requires: "freePosition",` to the eight nudge bindings (`Ctrl+ArrowUp/Down/Left/Right` and `Ctrl+k/j/h/l`) and `requires: "nodeColor",` to the two `c` bindings. Do not mark the `Ctrl+Alt` resize bindings (the Editor decides per node whether it is an image or a text resize).

In `dispatch`, inside the loop after the modifiers check:
```ts
    if (binding.requires && !editor.getCapabilities()[binding.requires]) continue;
```

`packages/core/src/keybindings/shortcutHelp.ts`:
```ts
import type { DocumentCapabilities } from "../editor/capabilities";

export interface ShortcutEntry {
  keys: string[];        // each element = one kbd box, e.g. ["Cmd", "Z"]
  description: string;
  altKeys?: string[];    // alternate keys shown as "or" in keys column, e.g. ["h"]
  requires?: keyof DocumentCapabilities;  // hidden when the document lacks this capability
}
```
Add `requires: "nodeColor"` to the two color entries in "Node Operations" and `requires: "freePosition"` to the eight "Nudge node" / "Nudge node (fine)" entries in "Positioning". Then:
```ts
/** Drop entries (and then empty groups) whose capability the document lacks. */
export function filterShortcutGroups(
  groups: ShortcutGroup[],
  caps: DocumentCapabilities,
): ShortcutGroup[] {
  return groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((e) => !e.requires || caps[e.requires]),
    }))
    .filter((group) => group.entries.length > 0);
}
```

`packages/core/src/index.ts`: add `filterShortcutGroups` to the `shortcutHelp` export line.

`packages/web/src/components/ShortcutsDialog.tsx`:
```ts
import { SHORTCUT_GROUPS, filterShortcutGroups, displayKey, getHost } from "@limn/core";
import type { ShortcutEntry, ShortcutGroup, DocumentCapabilities } from "@limn/core";

export interface ShortcutsDialogProps {
  onClose: () => void;
  capabilities?: DocumentCapabilities;
}

export function ShortcutsDialog({ onClose, capabilities }: ShortcutsDialogProps) {
  const groups = capabilities ? filterShortcutGroups(SHORTCUT_GROUPS, capabilities) : SHORTCUT_GROUPS;
```
and render `groups.map(...)` where it currently renders `SHORTCUT_GROUPS.map(...)`.

`packages/web/src/components/HamburgerMenu.tsx`, at the render site:
```tsx
{showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} capabilities={editor.getCapabilities()} />}
```

`packages/web/src/components/NodeView.tsx`: add `showResizeHandle?: boolean` to `NodeViewProps`, destructure it with default `true`, and change the resize handle condition to `{isSelected && showResizeHandle && (`.

`packages/web/src/components/MindMapCanvas.tsx`: where `<NodeView` is rendered, pass `showResizeHandle={editor.getCapabilities().widthResize}`.

- [ ] **Step 4: Run the tests and the full check**

Run: `just test-file capabilities`, `just test-file shortcut-help`, then `just check`
Expected: all PASS; typecheck green for web.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/keybindings/dispatch.ts packages/core/src/keybindings/shortcutHelp.ts packages/core/src/index.ts packages/core/src/__tests__/capabilities.test.ts packages/core/src/__tests__/shortcut-help.test.ts packages/web/src/components/ShortcutsDialog.tsx packages/web/src/components/HamburgerMenu.tsx packages/web/src/components/NodeView.tsx packages/web/src/components/MindMapCanvas.tsx
git commit -F - <<'MSG'
Gate keybindings, shortcut help, and the resize handle on DocumentCapabilities

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---
### Task 8: Canonical whole-document layout (`relayoutAll`)

**Files:**
- Modify: `packages/core/src/layout/layout.ts`
- Modify: `packages/core/src/editor/Editor.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/relayout-all.test.ts`

**Interfaces:**
- Consumes: `Editor.getCapabilities()` (Task 6), `TestEditor.pointerDown/Move/Up`.
- Produces:
  ```ts
  // layout.ts
  export const TREE_PADDING = 40;
  export function reflowSubtree(store: MindMapStore, nodeId: string, forceDirection?: number): void
  export function relayoutSubtree(store: MindMapStore, nodeId: string, includeCollapsed?: boolean): void
  export function relayoutAll(store: MindMapStore): void
  // Editor
  relayoutAll(): void            // lays out from structure and notifies
  ```
  Behavior: when `capabilities.freePosition` is false, `Editor.notify()` runs `relayoutAll` first unless a drag is in progress, so every observable state is in canonical layout and drags that neither reorder nor reparent snap back on release.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/__tests__/relayout-all.test.ts`:
```ts
// ABOUTME: Tests for the canonical whole-document layout used by outline-backed documents.
// ABOUTME: Covers determinism, root stacking, collapsed subtrees, and snap-back under OUTLINE_CAPABILITIES.

import { describe, test, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { OUTLINE_CAPABILITIES } from "../editor/capabilities";
import { TREE_PADDING, treeBoundingBox } from "../layout/layout";
import type { MindMapFileFormat } from "../serialization/schema";

/** Two roots; the first has a left-side child, a right-side child, and a collapsed child with a hidden grandchild. */
const scattered: MindMapFileFormat = {
  version: 1,
  meta: { id: "layout", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
  camera: { x: 0, y: 0, zoom: 1 },
  roots: [
    {
      id: "n0",
      text: "Root A",
      x: 300,
      y: 500,
      width: 100,
      height: 32,
      children: [
        { id: "n1", text: "Left child", x: -100, y: 400, width: 100, height: 32, children: [] },
        { id: "n2", text: "Right child", x: 700, y: 650, width: 100, height: 32, children: [] },
        {
          id: "n3",
          text: "Collapsed",
          x: 700,
          y: 700,
          width: 100,
          height: 32,
          collapsed: true,
          children: [{ id: "n4", text: "Hidden", x: 0, y: 0, width: 100, height: 32, children: [] }],
        },
      ],
    },
    { id: "n5", text: "Root B", x: -400, y: -900, width: 100, height: 32, children: [] },
  ],
  assets: [],
};

function positions(editor: TestEditor): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const root of editor.getRoots()) {
    const visit = (id: string) => {
      const n = editor.getNode(id);
      out[id] = [n.x, n.y];
      for (const c of n.children) visit(c);
    };
    visit(root.id);
  }
  return out;
}

describe("relayoutAll", () => {
  let editor: TestEditor;

  beforeEach(() => {
    editor = new TestEditor();
    editor.loadJSON(scattered);
  });

  test("puts every child to the right of its parent and every root at x = 0", () => {
    editor.relayoutAll();
    for (const id of ["n1", "n2", "n3"]) {
      expect(editor.getNode(id).x).toBeGreaterThan(editor.getNode("n0").x + editor.getNode("n0").width);
    }
    expect(editor.getNode("n0").x).toBe(0);
    expect(editor.getNode("n5").x).toBe(0);
  });

  test("siblings are stacked top to bottom in array order", () => {
    editor.relayoutAll();
    expect(editor.getNode("n1").y).toBeLessThan(editor.getNode("n2").y);
    expect(editor.getNode("n2").y).toBeLessThan(editor.getNode("n3").y);
  });

  test("roots are stacked in root order with TREE_PADDING between visible bounding boxes", () => {
    editor.relayoutAll();
    expect(editor.getNode("n0").y).toBe(0);
    const store = editor["store"];
    const boxA = treeBoundingBox(store, "n0");
    const boxB = treeBoundingBox(store, "n5");
    expect(boxB.minY).toBeCloseTo(boxA.maxY + TREE_PADDING, 6);
  });

  test("hidden children of a collapsed node are still positioned to the right of their parent", () => {
    editor.relayoutAll();
    expect(editor.getNode("n4").x).toBeGreaterThan(editor.getNode("n3").x);
    expect(editor.getNode("n3").collapsed).toBe(true);
  });

  test("is idempotent", () => {
    editor.relayoutAll();
    const once = positions(editor);
    editor.relayoutAll();
    expect(positions(editor)).toEqual(once);
  });

  describe("under OUTLINE_CAPABILITIES", () => {
    beforeEach(() => {
      editor.setCapabilities(OUTLINE_CAPABILITIES);
    });

    test("setting the capabilities lays the document out canonically", () => {
      const canonical = positions(editor);
      const fresh = new TestEditor();
      fresh.loadJSON(scattered);
      fresh.relayoutAll();
      expect(canonical).toEqual(positions(fresh));
    });

    test("a drag that neither reorders nor reparents snaps back on release", () => {
      const before = positions(editor);
      const n2 = editor.getNode("n2");
      editor.pointerDown("n2", n2.x + 10, n2.y + 10);
      editor.pointerMove(n2.x + 15, n2.y + 12);
      expect(editor.getNode("n2").x).not.toBe(before["n2"]?.[0]);
      editor.pointerUp();
      expect(positions(editor)).toEqual(before);
    });

    test("structural changes keep the layout canonical", () => {
      editor.addChild("n2", "new");
      editor.exitEditMode();
      const after = positions(editor);
      const fresh = new TestEditor();
      fresh.loadJSON(editor.toJSON());
      fresh.relayoutAll();
      expect(after).toEqual(positions(fresh));
    });

    test("undo returns to the canonical layout of the previous structure", () => {
      const before = positions(editor);
      editor.addChild("n0", "temp");
      editor.exitEditMode();
      editor.undo();
      expect(positions(editor)).toEqual(before);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `just test-file relayout-all`
Expected: FAIL (`relayoutAll` is not a function; `TREE_PADDING` not exported).

- [ ] **Step 3: Implement in layout.ts**

Change `reflowSubtree`:
```ts
/**
 * Reflow a node's descendants so children are on the correct side.
 * By default a root's children keep their own side and a non-root's children share
 * the parent's branch direction; `forceDirection` (1 or -1) overrides both.
 */
export function reflowSubtree(store: MindMapStore, nodeId: string, forceDirection?: number): void {
  const node = store.getNode(nodeId);
  const children = store.getChildren(nodeId);
  if (children.length === 0) return;

  const isRoot = node.parentId === null;
  const parentDir = isRoot ? 0 : branchDirection(store, nodeId);

  for (const child of children) {
    const dir = forceDirection ?? (isRoot ? branchDirection(store, child.id) : parentDir);
    const expectedX = childXFromParent(node.x, node.width, dir, child.width);
    if (Math.abs(child.x - expectedX) > 0.001) {
      store.setNodePosition(child.id, expectedX, child.y);
    }
    reflowSubtree(store, child.id, forceDirection);
  }
}
```

Change `relayoutSubtree`:
```ts
/** Recursively re-center children bottom-up through an entire subtree.
 *  Collapsed subtrees are skipped unless `includeCollapsed` is true. */
export function relayoutSubtree(store: MindMapStore, nodeId: string, includeCollapsed = false): void {
  const node = store.getNode(nodeId);
  if ((node.collapsed && !includeCollapsed) || node.children.length === 0) return;
  for (const childId of node.children) {
    relayoutSubtree(store, childId, includeCollapsed);
  }
  centerChildren(store, nodeId);
}
```

Export the padding constant (it is currently `const TREE_PADDING = 40;` above `resolveTreeOverlap`):
```ts
export const TREE_PADDING = 40;
```

Add at the end of the file:
```ts
/**
 * Lay out every tree from structure alone: children to the right of their parent,
 * each subtree centered on its parent, roots stacked top to bottom in root order
 * with TREE_PADDING between visible bounding boxes. Deterministic for a given set
 * of node sizes; existing positions are overwritten, never read.
 */
export function relayoutAll(store: MindMapStore): void {
  let previousBottom: number | null = null;
  for (const root of store.getRoots()) {
    store.setNodePosition(root.id, 0, root.y);
    reflowSubtree(store, root.id, 1);
    relayoutSubtree(store, root.id, true);
    if (previousBottom === null) {
      shiftSubtree(store, root.id, -store.getNode(root.id).y);
    } else {
      const box = treeBoundingBox(store, root.id);
      shiftSubtree(store, root.id, previousBottom + TREE_PADDING - box.minY);
    }
    previousBottom = treeBoundingBox(store, root.id).maxY;
  }
}
```

- [ ] **Step 4: Implement in Editor.ts**

Import (extend the existing `../layout/layout` import list):
```ts
  relayoutAll as relayoutAllTrees,
```

Public method, after `reflowChildren`:
```ts
  /** Lay out every tree from structure alone; see layout.relayoutAll. */
  relayoutAll(): void {
    relayoutAllTrees(this.store);
    this.notify();
  }
```

`notify()`:
```ts
  /** Notify all subscribers that state has changed.
   *  Documents without free positioning are laid out canonically first, except mid-drag
   *  so reorder and reparent detection can follow the pointer. */
  protected notify(): void {
    if (!this.capabilities.freePosition && !this.drag.active) {
      relayoutAllTrees(this.store);
    }
    this.version++;
    for (const listener of this.listeners) {
      listener();
    }
  }
```

`packages/core/src/index.ts`: add `relayoutAll` and `TREE_PADDING` to the `./layout/layout` export list.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `just test-file relayout-all`, then `just test` (the layout and drag suites must still pass; `reflowSubtree`'s default behavior is unchanged).
Expected: PASS.

If "a drag that neither reorders nor reparents snaps back" fails because positions differ before and after: check that `endDrag` sets `this.drag = initialDragState()` before calling `notify()` (it does), and that the pointer move stayed small enough not to cross a sibling center (n2's neighbors are 20 px apart vertically after canonical layout, so keep the y delta under 10).

- [ ] **Step 6: Run the full check and commit**

Run: `just check`

```bash
git add packages/core/src/layout/layout.ts packages/core/src/editor/Editor.ts packages/core/src/index.ts packages/core/src/__tests__/relayout-all.test.ts
git commit -F - <<'MSG'
Add canonical relayoutAll and use it for documents without free positioning

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 9: Id reconciliation for external updates

**Files:**
- Create: `packages/core/src/serialization/reconcile.ts`
- Modify: `packages/core/src/editor/Editor.ts` (`applyExternalUpdate` option)
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/reconcile.test.ts`

**Interfaces:**
- Consumes: `generateNodeId`, `outlineToFileNodes`, `parseSubtree` (Task 5).
- Produces:
  ```ts
  export function reconcileIds(store: MindMapStore, incoming: MindMapFileNode[]): MindMapFileNode[]
  // Editor
  applyExternalUpdate(data: MindMapFileFormat, options?: { reconcileIds?: boolean }): void
  ```
  Matching per parent: first pass exact text (first unused existing sibling), second pass same index; matched nodes take the existing id and recurse; unmatched keep their fresh ids. Default `reconcileIds: false` keeps today's cross-tab behavior in web.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/__tests__/reconcile.test.ts`:
```ts
// ABOUTME: Tests for reconcileIds, which re-attaches existing ids to a freshly parsed forest.
// ABOUTME: Also covers Editor.applyExternalUpdate with reconciliation keeping selection.

import { describe, test, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { reconcileIds } from "../serialization/reconcile";
import { parseSubtree, outlineToFileNodes } from "../markdown/outline";
import { generateNodeId } from "../store/MindMapStore";
import type { MindMapFileFormat, MindMapFileNode } from "../serialization/schema";

const base: MindMapFileFormat = {
  version: 1,
  meta: { id: "rec", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
  camera: { x: 0, y: 0, zoom: 1 },
  roots: [
    {
      id: "n0",
      text: "Root",
      x: 0,
      y: 0,
      width: 100,
      height: 32,
      children: [
        { id: "n1", text: "Alpha", x: 250, y: -30, width: 100, height: 32, children: [] },
        {
          id: "n2",
          text: "Beta",
          x: 250,
          y: 30,
          width: 100,
          height: 32,
          children: [{ id: "n3", text: "Beta child", x: 500, y: 30, width: 100, height: 32, children: [] }],
        },
      ],
    },
  ],
  assets: [],
};

function incoming(md: string): MindMapFileNode[] {
  return outlineToFileNodes(parseSubtree(md), generateNodeId);
}

function ids(nodes: MindMapFileNode[]): unknown {
  return nodes.map((n) => ({ id: n.id, text: n.text, children: ids(n.children) }));
}

describe("reconcileIds", () => {
  let editor: TestEditor;

  beforeEach(() => {
    editor = new TestEditor();
    editor.loadJSON(base);
  });

  test("identical structure keeps every id", () => {
    const result = reconcileIds(editor["store"], incoming("- Root\n  - Alpha\n  - Beta\n    - Beta child"));
    expect(ids(result)).toEqual([
      { id: "n0", text: "Root", children: [
        { id: "n1", text: "Alpha", children: [] },
        { id: "n2", text: "Beta", children: [{ id: "n3", text: "Beta child", children: [] }] },
      ] },
    ]);
  });

  test("reordered siblings keep their ids by text", () => {
    const result = reconcileIds(editor["store"], incoming("- Root\n  - Beta\n    - Beta child\n  - Alpha"));
    const root = result[0] as MindMapFileNode;
    expect(root.children.map((c) => [c.id, c.text])).toEqual([["n2", "Beta"], ["n1", "Alpha"]]);
    expect(root.children[0]?.children[0]?.id).toBe("n3");
  });

  test("a renamed node at the same position keeps its id; a new node gets a fresh id", () => {
    const result = reconcileIds(editor["store"], incoming("- Root\n  - Alpha renamed\n  - Beta\n  - Gamma"));
    const root = result[0] as MindMapFileNode;
    expect(root.children[0]?.id).toBe("n1");
    expect(root.children[1]?.id).toBe("n2");
    expect(root.children[2]?.id).toMatch(/^n\d+$/);
    expect(["n0", "n1", "n2", "n3"]).not.toContain(root.children[2]?.id);
  });

  test("a deleted node's id disappears and is not reused", () => {
    const result = reconcileIds(editor["store"], incoming("- Root\n  - Beta"));
    const root = result[0] as MindMapFileNode;
    expect(root.children.map((c) => c.id)).toEqual(["n2"]);
  });

  test("a new root keeps a fresh id; existing roots match by text", () => {
    const result = reconcileIds(editor["store"], incoming("- Brand new\n- Root\n  - Alpha"));
    expect(result[0]?.id).not.toBe("n0");
    expect(result[1]?.id).toBe("n0");
    expect(result[1]?.children[0]?.id).toBe("n1");
  });
});

describe("Editor.applyExternalUpdate with reconcileIds", () => {
  test("selection and edit mode survive when the selected node still exists", () => {
    const editor = new TestEditor();
    editor.loadJSON(base);
    editor.select("n2");
    editor.enterEditMode();
    const data: MindMapFileFormat = { ...base, roots: incoming("- Root\n  - Alpha\n  - Beta\n    - Beta child\n  - Gamma") };
    editor.applyExternalUpdate(data, { reconcileIds: true });
    expect(editor.getSelectedId()).toBe("n2");
    expect(editor.isEditing()).toBe(true);
    expect(editor.getNode("n0").children).toHaveLength(3);
  });

  test("without the option, ids come from the incoming data (existing cross-tab behavior)", () => {
    const editor = new TestEditor();
    editor.loadJSON(base);
    editor.select("n2");
    const data: MindMapFileFormat = { ...base, roots: incoming("- Root\n  - Alpha\n  - Beta") };
    editor.applyExternalUpdate(data);
    expect(editor.getSelectedId()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `just test-file reconcile`
Expected: FAIL, "Cannot find module '../serialization/reconcile'".

- [ ] **Step 3: Implement**

`packages/core/src/serialization/reconcile.ts`:
```ts
// ABOUTME: Re-attaches existing node ids to a freshly parsed forest by matching per parent.
// ABOUTME: Lets external updates keep selection and edit state for nodes that survived.

import type { MindMapNode } from "../model/types";
import type { MindMapStore } from "../store/MindMapStore";
import type { MindMapFileNode } from "./schema";

/**
 * For each parent, match incoming children to existing children first by exact text
 * (first unused sibling), then by index. Matched nodes take the existing id and recurse;
 * unmatched nodes keep the fresh ids they arrived with.
 */
export function reconcileIds(store: MindMapStore, incoming: MindMapFileNode[]): MindMapFileNode[] {
  return reconcileLevel(store, store.getRoots(), incoming);
}

function reconcileLevel(
  store: MindMapStore,
  existing: MindMapNode[],
  incoming: MindMapFileNode[],
): MindMapFileNode[] {
  const used = new Set<string>();
  const matches: (MindMapNode | undefined)[] = incoming.map(() => undefined);

  incoming.forEach((node, i) => {
    const hit = existing.find((e) => !used.has(e.id) && e.text === node.text);
    if (hit) {
      used.add(hit.id);
      matches[i] = hit;
    }
  });

  incoming.forEach((_node, i) => {
    if (matches[i]) return;
    const candidate = existing[i];
    if (candidate && !used.has(candidate.id)) {
      used.add(candidate.id);
      matches[i] = candidate;
    }
  });

  return incoming.map((node, i) => {
    const hit = matches[i];
    if (!hit) return node;
    return {
      ...node,
      id: hit.id,
      children: reconcileLevel(store, store.getChildren(hit.id), node.children),
    };
  });
}
```

`packages/core/src/editor/Editor.ts`:
```ts
import { reconcileIds } from "../serialization/reconcile";
```
and change the signature and first lines of `applyExternalUpdate`:
```ts
  /**
   * Apply an external update (from another tab or the backing file) preserving local session state.
   * Replaces document data but keeps selection (if node still exists), camera,
   * and sets isExternalUpdate so auto-save can skip. With `reconcileIds`, incoming
   * nodes take the ids of matching existing nodes so selection survives a reparse.
   */
  applyExternalUpdate(data: MindMapFileFormat, options: { reconcileIds?: boolean } = {}): void {
    const roots = options.reconcileIds ? reconcileIds(this.store, data.roots) : data.roots;
    this.store = deserialize({ ...data, roots });
```
(the rest of the method is unchanged).

`packages/core/src/index.ts`:
```ts
export { reconcileIds } from "./serialization/reconcile";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `just test-file reconcile`, then `just test`
Expected: PASS.

- [ ] **Step 5: Run the full check and commit**

Run: `just check`

```bash
git add packages/core/src/serialization/reconcile.ts packages/core/src/editor/Editor.ts packages/core/src/index.ts packages/core/src/__tests__/reconcile.test.ts
git commit -F - <<'MSG'
Add reconcileIds and an option to keep ids across external updates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 10: Align the spec with the shipped core API

**Files:**
- Modify: `docs/specs/2026-08-15-markdown-backed-mind-maps-design.md` (section 6.1 and 6.4)

- [ ] **Step 1: Update section 6.1**

Replace the `ParsedOutline` description so it matches the code: `ParsedOutline = { frontmatterLines: string[]; regions: OutlineRegion[] }` with `OutlineRegion = { kind: "prose"; lines: string[] } | { kind: "list"; roots: OutlineNode[] }` (list regions own their roots; `outlineRoots(parsed)` flattens them), and name the helpers as shipped: `writeNodes`, `writeSubtree`, `parseSubtree`, `escapeLine`, `unescapeLine`, `outlineToFileNodes(nodes, nextId)`, `fileNodesToOutline(nodes)`, `OUTLINE_IMAGE_PLACEHOLDER`.

- [ ] **Step 2: Update section 6.4**

State the shipped signature `reconcileIds(store, incoming)` and that `applyExternalUpdate(data, { reconcileIds: true })` is opt-in.

- [ ] **Step 3: Commit**

```bash
git add docs/specs/2026-08-15-markdown-backed-mind-maps-design.md
git commit -F - <<'MSG'
Spec: align outline codec and reconcile signatures with core

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

## What plans 2 and 3 will consume from this plan

- Obsidian view (plan 2): `parseOutline`, `writeOutline` (preserve the `ParsedOutline` object, including `lineEnding`, between parse and write), `outlineToFileNodes(roots, generateNodeId)`, `fileNodesToOutline`, `imageRefToOutline`, `OUTLINE_CAPABILITIES`, `Editor.setCapabilities`, `Editor.applyExternalUpdate(data, { reconcileIds: true })`, `Editor.relayoutAll()` after `remeasureAllNodes()`. Image dimensions the note did not specify arrive as `OUTLINE_IMAGE_UNKNOWN_SIZE` (0); the host resolves the natural size (and calls `setNodeImage`) before its first write, and image resize is a no-op while a dimension is 0.

Post-review hardening (after Task 10, see the ledger rulings in git history): `%%` toggles only on a bare `%%` line; fenced code inside an item is node text and round-trips verbatim; continuation threshold is canonical (`2*depth+2`) with ancestor attachment; escapes are reversible for leading backslashes; CRLF preserved via `ParsedOutline.lineEnding`; embeds write `|WxH` / `|W` / bare; the shortcut help lists the resize keys instead of "Nudge node (fine)". The task texts above predate these changes; the spec is authoritative.
- Web/desktop clipboard (plan 3): `writeSubtree`, `parseSubtree`, `outlineToFileNodes`, `Editor.importRoots` or a new "add parsed nodes under a parent" method.
