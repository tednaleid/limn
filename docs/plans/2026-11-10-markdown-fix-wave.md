# Markdown-Backed Mind Maps: Review Fix Wave

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A map edit can no longer damage a note. Notes containing Markdown the outline dialect cannot round-trip are refused by the map view and opened as Markdown with a notice; the parser bugs and routing bugs found in the 2026-11-10 review are fixed.

**Architecture:** The codec in `packages/core/src/markdown/outline.ts` gains two things: it stops treating thematic breaks, setext underlines, math blocks, and HTML comments as bullets, and it reports the constructs it cannot round-trip through a new `findOutlineIssues(text)`. `OutlineDocument` refuses to load a note with issues and hands back the on-disk text untouched; `LimnMarkdownView` shows a notice and switches the pane to the Markdown editor. Routing learns to tell navigation from restore.

**Tech Stack:** TypeScript, vitest (`just test`, `just test-file <path>`), Obsidian `TextFileView`, `monkey-around`.

**Spec:** `docs/specs/2026-08-15-markdown-backed-mind-maps-design.md` (amended in Task 8).

**Branch:** `markdown-obsidian-view` (continue on it; do not merge or push).

## Global Constraints

- Red/green: write the failing test first, see it fail, then implement. Commit after each task, only when `just check` and `just lint-obsidian` pass. Never `--no-verify`. Commit messages via heredoc, no command substitution.
- `packages/core` has zero browser or Obsidian dependencies.
- No `any`. No eslint-disable for `obsidianmd/*` rules. Use `bunx`, not `npx`.
- Every code file starts with two `// ABOUTME: ` lines. Comments are evergreen: no history, no "now", no ticket ids.
- No emoji or em dashes anywhere, including test names and commit messages.
- No change to `schema.ts` or the `.limn` file format.
- A note with no issues must produce byte-identical `writeOutline(parseOutline(x))` output to what it produces before this plan, except for the specific inputs named in Task 1.
- The writer's own output must never be reported as an issue (Task 2 has a test for this).

## Decisions already made (do not reopen)

- Unsupported notes are refused, not shown read-only and not partially shown. The Editor has no read-only mode and adding one is out of scope.
- Refusal is per note, not per list region.
- Detection is structural, in core, with no Markdown parser dependency and no use of Obsidian's metadata cache.
- A wikilink is not recognized when the character before `[[` is a word character or `]`. Host-gated wikilink parsing is out of scope.

## File map

| File | Change |
|---|---|
| `packages/core/src/markdown/outline.ts` | Parser fixes (Task 1); `OutlineIssue`, `findOutlineIssues`, table delimiter escape (Task 2) |
| `packages/core/src/index.ts` | Export `findOutlineIssues`, `OutlineIssue` |
| `packages/core/src/__tests__/outline.test.ts` | Tests for Tasks 1 and 2 |
| `packages/core/src/markdown/fixtures/unsupported-blocks.md` | New fixture: a note that must report issues |
| `packages/core/src/markdown/fixtures/prose-lookalikes.md` | New fixture: rules, math, comments that must stay prose |
| `packages/obsidian/src/markdown/OutlineDocument.ts` | Blocked state (Task 3); drop natural sizes on clear (Task 6) |
| `packages/obsidian/src/markdown/LimnMarkdownView.ts` | Notice and switch to Markdown (Task 3) |
| `packages/obsidian/src/markdown/unsupportedNotice.ts` | New: `describeIssues(issues)` message builder (Task 3) |
| `packages/obsidian/src/markdown/routing.ts`, `leafRouting.ts` | `navigating` input (Task 4) |
| `packages/core/src/markdown/inlineMarkdown.ts` | Wikilink boundary rule (Task 5) |
| `packages/obsidian/src/main.ts` | Unload ordering and comment (Task 6) |
| `packages/obsidian/src/__tests__/text-file-view-cycle.test.ts` | New: drives `OutlineDocument` through the `TextFileView` sequence (Task 7) |
| spec, `OBSIDIAN-PLUGIN.md` | Task 8 |

---

### Task 1: Parser stops reading non-list Markdown as bullets

**Files:**
- Modify: `packages/core/src/markdown/outline.ts` (`parseOutline`, `splitFrontmatter` untouched)
- Test: `packages/core/src/__tests__/outline.test.ts`
- Create: `packages/core/src/markdown/fixtures/prose-lookalikes.md`

**Interfaces:**
- Produces: no new exports. `parseOutline` behavior changes only for the inputs below.

- [ ] **Step 1: Write the failing tests.** Add a `describe("prose that looks like bullets")` block. Each case asserts both the region shape and that `writeOutline(parseOutline(text)) === text`.

```ts
const unchanged = (text: string) => expect(writeOutline(parseOutline(text))).toBe(text);
const rootTexts = (text: string) => outlineRoots(parseOutline(text)).map((n) => n.text);

it("keeps a spaced star rule as prose", () => {
  const text = "para\n\n* * *\n\nmore\n";
  expect(rootTexts(text)).toEqual([]);
  unchanged(text);
});
it("keeps a spaced dash rule as prose", () => {
  const text = "para\n\n- - -\n\nmore\n";
  expect(rootTexts(text)).toEqual([]);
  unchanged(text);
});
it("ends a list at a spaced rule", () => {
  const text = "- a\n\n* * *\n\n- b\n";
  expect(parseOutline(text).regions.map((r) => r.kind)).toEqual(["list", "prose", "list", "prose"]);
  expect(rootTexts(text)).toEqual(["a", "b"]);
  unchanged(text);
});
it("keeps a setext underline as prose", () => {
  const text = "Title\n-\n\nbody\n";
  expect(rootTexts(text)).toEqual([]);
  unchanged(text);
});
it("still reads a lone dash after a blank line as an empty bullet", () => {
  expect(parseOutline("para\n\n-\n").regions.some((r) => r.kind === "list")).toBe(true);
});
it("keeps bullets inside a math block as prose", () => {
  const text = "$$\na\n- b + c\n$$\n\n- real\n";
  expect(rootTexts(text)).toEqual(["real"]);
  unchanged(text);
});
it("does not open a math block on a one-line formula", () => {
  expect(rootTexts("$$x$$\n- real\n")).toEqual(["real"]);
});
it("keeps bullets inside a multi-line HTML comment as prose", () => {
  const text = "<!--\n- hidden\n-->\n\n- real\n";
  expect(rootTexts(text)).toEqual(["real"]);
  unchanged(text);
});
it("does not open an HTML comment that closes on its own line", () => {
  expect(rootTexts("<!-- note -->\n- real\n")).toEqual(["real"]);
});
```

Also add `fixtures/prose-lookalikes.md` containing all of the above constructs around two real lists, and add it to the existing fixture round-trip loop (the loop that asserts `writeOutline(parseOutline(fixture)) === fixture`).

- [ ] **Step 2: Run and confirm failure.** `just test-file packages/core/src/__tests__/outline.test.ts`. Expected: the rule, setext, math, and HTML comment cases fail; "lone dash after a blank line" passes already.

- [ ] **Step 3: Implement.** In `outline.ts`:

```ts
/** A bullet match for a line, or null. A thematic break (`* * *`, `- - -`) is not a bullet. */
function matchBullet(line: string): RegExpExecArray | null {
  if (THEMATIC_BREAK_RE.test(line.trim())) return null;
  return BULLET_RE.exec(line);
}
```

Replace both `BULLET_RE.exec(line)` calls in `parseOutline` with `matchBullet(line)`. In list context a rule at indent 0 then falls through `continuedItem` (returns null), closes the list, and becomes prose, which is the behavior the third test wants.

Add two prose-block flags beside `inComment`:

```ts
let inMath = false;
let inHtmlComment = false;
```

Maintain them in the prose branch, after the fence and `%%` handling and only when `fence === null && !inComment`:

```ts
const trimmed = line.trim();
if (!inHtmlComment && trimmed.startsWith("$$") && !(trimmed.length > 2 && trimmed.endsWith("$$"))) inMath = !inMath;
if (!inMath) {
  if (!inHtmlComment && trimmed.includes("<!--") && !trimmed.includes("-->", trimmed.indexOf("<!--"))) inHtmlComment = true;
  else if (inHtmlComment && trimmed.includes("-->")) inHtmlComment = false;
}
```

Gate the "start a list" check on `fence === null && !inComment && !inMath && !inHtmlComment`. A line that toggles a flag is itself prose (it is not a bullet), so the order above is safe.

Setext underline, in the same "start a list" check: when the match has empty content (`(m[3] ?? "") === ""`), the marker is `-`, and the last line already in `prose` is non-blank, push the line to `prose` instead of starting a list.

- [ ] **Step 4: Run the file, then `just test`.** All pass, including every pre-existing outline test and fixture.

- [ ] **Step 5: Commit.** `Outline parser: rules, setext underlines, math blocks, and HTML comments are prose`

---

### Task 2: Report Markdown the dialect cannot round-trip

**Files:**
- Modify: `packages/core/src/markdown/outline.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/outline.test.ts`
- Create: `packages/core/src/markdown/fixtures/unsupported-blocks.md`

**Interfaces:**
- Produces:

```ts
export type OutlineIssueKind = "block-in-item" | "indented-list";
export interface OutlineIssue {
  /** 1-based line number in the note, frontmatter included. */
  line: number;
  kind: OutlineIssueKind;
}
/** Constructs in a note that the writer would not reproduce. Empty for any text the writer produced. */
export function findOutlineIssues(text: string): OutlineIssue[];
```

Both exported from `@limn/core`.

Meaning of the kinds:
- `block-in-item`: a line of an item's text (its first line or a continuation line, outside an item fence) that Markdown reads as block syntax: an ordered list item, a blockquote, a heading, a thematic break, a nested bullet marker, a fence opener on the item's first line, or a table delimiter row. The writer would backslash-escape it and so change what it means.
- `indented-list`: a list region whose first bullet is indented two or more columns. Such a list is nested under something that is not a bullet (an ordered item, a paragraph continuation, an indented code block); the writer would move it to column 0.

- [ ] **Step 1: Write the failing tests.**

```ts
const kinds = (text: string) => findOutlineIssues(text).map((i) => `${i.line}:${i.kind}`);

it("reports nothing for a plain outline", () => {
  expect(kinds("- a\n  - b\n* c\n  - d\n")).toEqual([]);
});
it("reports an ordered list inside a bullet", () => {
  expect(kinds("- parent\n  1. one\n  2. two\n")).toEqual(["2:block-in-item", "3:block-in-item"]);
});
it("reports a quote, heading, and rule inside a bullet", () => {
  expect(kinds("- p\n  > q\n- p2\n  # h\n- p3\n  ---\n")).toEqual(
    ["2:block-in-item", "4:block-in-item", "6:block-in-item"]);
});
it("reports block syntax on a bullet's first line", () => {
  expect(kinds("- > quote\n- 1. one\n- # h\n")).toEqual(
    ["1:block-in-item", "2:block-in-item", "3:block-in-item"]);
});
it("reports a table under a bullet at its delimiter row", () => {
  expect(kinds("- p\n  | a | b |\n  |---|---|\n  | 1 | 2 |\n")).toEqual(["3:block-in-item"]);
});
it("reports bullets nested under an ordered item", () => {
  expect(kinds("1. one\n   - sub a\n   - sub b\n2. two\n")).toEqual(["2:indented-list"]);
});
it("reports an indented bullet after a second paragraph", () => {
  expect(kinds("- item\n\n  second para\n  - child\n")).toEqual(["4:indented-list"]);
});
it("counts frontmatter lines", () => {
  expect(kinds("---\nlimn-plugin: true\n---\n- p\n  > q\n")).toEqual(["5:block-in-item"]);
});
it("ignores block syntax inside an item fence", () => {
  expect(kinds("- code\n  ```\n  > not a quote\n  1. not a list\n  ```\n")).toEqual([]);
});
it("ignores escaped lines the writer produced", () => {
  expect(kinds("- p\\\n  \\> q\\\n  1\\. one\n")).toEqual([]);
});
it("never reports the writer's own output", () => {
  const texts = ["> q", "1. one", "1) one", "# h", "---", "* * *", "- dash", "+ plus", "```", "~~~",
    "|---|---|", "| a | b |\n|---|---|", "\\> already", "plain\n> second line\n1. third", "a\n```\ncode\n> x\n```"];
  const nodes: OutlineNode[] = texts.map((text) => ({
    text, collapsed: false, children: [{ text, collapsed: false, children: [] }],
  }));
  const written = writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots: nodes }] });
  expect(findOutlineIssues(written)).toEqual([]);
  expect(outlineRoots(parseOutline(written)).map((n) => n.text)).toEqual(texts);
});
```

Add `fixtures/unsupported-blocks.md` (a realistic note: frontmatter, a heading, a bullet with a nested numbered list, a numbered list with nested bullets, a bullet with a table) and a test asserting `findOutlineIssues(fixture).length > 0`. For every other fixture in the directory assert `findOutlineIssues(fixture)` is `[]`.

- [ ] **Step 2: Run and confirm failure** (`findOutlineIssues` does not exist).

- [ ] **Step 3: Implement.**

1. Table delimiter rows join the escaped set, so the writer never emits a raw one:

```ts
const TABLE_DELIMITER_RE = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?$/;
function isTableDelimiter(body: string): boolean {
  return body.includes("|") && TABLE_DELIMITER_RE.test(body.trimEnd());
}
```

In `escapeLine`, treat `isTableDelimiter(body)` like `ESCAPE_PREFIX_RE` (prefix a backslash). In `unescapeLine`, treat `isTableDelimiter(rest)` like the other escaped prefixes (strip the backslash). The "never reports the writer's own output" test covers the round trip.

2. Block syntax check:

```ts
/** True when Markdown would read this line of item text as block syntax rather than text. */
function isBlockSyntax(body: string): boolean {
  const b = body.trimStart();
  return unescapeLine(b) === b && escapeLine(b) !== b;
}
```

A line the writer escaped fails the first clause; a line that needs no escape fails the second.

3. Turn the body of `parseOutline` into an internal `scan(text): { parsed: ParsedOutline; issues: OutlineIssue[] }`. Iterate `rest` with an index; the note line number is `frontmatterLines.length + index + 1`. Record:
   - in `addBullet`'s two call sites: `block-in-item` when `isBlockSyntax(m[3] ?? "")`;
   - on a continuation line, when the line is not a fence opener and not inside an item fence: `block-in-item` when `isBlockSyntax(body)`;
   - where a new list region starts (prose branch): `indented-list` when `indentWidth(m[1] ?? "") >= 2`.

   Then:

```ts
export function parseOutline(text: string): ParsedOutline {
  return scan(text).parsed;
}
export function findOutlineIssues(text: string): OutlineIssue[] {
  return scan(text).issues;
}
```

4. Export `findOutlineIssues`, `OutlineIssue`, `OutlineIssueKind` from `packages/core/src/index.ts` next to the existing outline exports.

- [ ] **Step 4: Run the file, then `just test`.** If any pre-existing fixture or test reports an issue, stop and report it rather than loosening the check: that is a finding about the detection rule.

- [ ] **Step 5: Commit.** `Outline codec: report Markdown the dialect cannot round-trip`

---

### Task 3: The map view refuses notes with issues

**Files:**
- Modify: `packages/obsidian/src/markdown/OutlineDocument.ts`, `packages/obsidian/src/markdown/LimnMarkdownView.ts`
- Create: `packages/obsidian/src/markdown/unsupportedNotice.ts`
- Test: `packages/obsidian/src/__tests__/outline-document.test.ts`, new `packages/obsidian/src/__tests__/unsupported-notice.test.ts`
- Modify if needed: `packages/obsidian/src/__tests__/mocks/obsidian-module.ts` (add `Notice` if absent)

**Interfaces:**
- Consumes: `findOutlineIssues`, `OutlineIssue` from `@limn/core`; `openLeafAs(plugin, leaf, type)` from `./leafRouting`.
- Produces:
  - `OutlineDocument.blockedBy: readonly OutlineIssue[]` (getter; empty when the note is supported)
  - `describeIssues(issues: readonly OutlineIssue[]): string`

Behavior of a blocked document:
- `load(text, clear)` computes `findOutlineIssues(text)` first. If there are issues: record them, set `diskText = text`, and do not parse into the Editor. With `clear` true the Editor is emptied exactly as `clear()` does; with `clear` false the Editor is left as it is.
- While blocked, `viewData()` returns `diskText` and `attach`'s subscriber never calls `requestSave`. Nothing the map does can reach the file.
- A later `load` of supported text unblocks.
- `clear()` unblocks.

- [ ] **Step 1: Write the failing tests** in `outline-document.test.ts` (use the file's existing `fakeHost` and editor setup helpers):

```ts
const UNSUPPORTED = "---\nlimn-plugin: true\n---\n- parent\n  1. one\n  2. two\n";

it("blocks a note it cannot round-trip and hands back the exact text", () => {
  doc.load(UNSUPPORTED, true);
  expect(doc.blockedBy.map((i) => i.line)).toEqual([5, 6]);
  expect(editor.getRoots()).toEqual([]);
  expect(doc.viewData()).toBe(UNSUPPORTED);
});
it("never requests a save while blocked", () => {
  host.data = UNSUPPORTED;
  doc.load(UNSUPPORTED, true);
  editor.addRoot();            // any mutation the test helpers already use
  expect(host.requestSave).not.toHaveBeenCalled();
  expect(doc.viewData()).toBe(UNSUPPORTED);
});
it("drops unsaved map edits when an external change makes the note unsupported", () => {
  doc.load("- a\n", true);
  // edit the map so it is dirty, using the helper the neighbouring tests use
  doc.load(UNSUPPORTED, false);
  expect(doc.blockedBy.length).toBe(2);
  expect(doc.viewData()).toBe(UNSUPPORTED);
});
it("unblocks when supported text is loaded", () => {
  doc.load(UNSUPPORTED, true);
  doc.load("- a\n", true);
  expect(doc.blockedBy).toEqual([]);
  expect(editor.getRoots().length).toBe(1);
});
```

`unsupported-notice.test.ts`:

```ts
it("names the first lines and what was found", () => {
  expect(describeIssues([{ line: 5, kind: "block-in-item" }, { line: 9, kind: "indented-list" }])).toBe(
    "Limn cannot show this note as a mind map without changing it, so it was opened as Markdown. "
    + "Line 5: a list item contains a numbered list, quote, heading, rule, or table. "
    + "Line 9: bullets are nested under something that is not a bullet.");
});
it("lists at most three lines and counts the rest", () => {
  const issues = [1, 2, 3, 4, 5].map((line) => ({ line, kind: "block-in-item" as const }));
  expect(describeIssues(issues)).toMatch(/Line 3: .* And 2 more\.$/);
});
```

- [ ] **Step 2: Run and confirm failure.**

- [ ] **Step 3: Implement `OutlineDocument`.** Add `private issues: OutlineIssue[] = []` and `get blockedBy(): readonly OutlineIssue[]`. At the top of `load`:

```ts
this.issues = findOutlineIssues(text);
if (this.issues.length > 0) {
  if (clear) this.emptyEditor();
  this.diskText = text;
  return;
}
```

Extract the `loading`-guarded `editor.loadJSON({... roots: [], assets: [] })` block from `clear()` into `private emptyEditor()` and use it from both places (no duplicated block). `clear()` also sets `this.issues = []`. `viewData()` starts with `if (this.issues.length > 0) return this.diskText;`. The `attach` subscriber starts with `if (this.loading || this.issues.length > 0) return;`.

- [ ] **Step 4: Implement `unsupportedNotice.ts`** (pure, no Obsidian import) to satisfy the two tests: fixed lead sentence, one sentence per issue for the first three, then `And N more.` when there are more.

- [ ] **Step 5: Implement the view.** In `LimnMarkdownView.setViewData`, after `this.doc.load(text, clear)`:

```ts
if (this.doc.blockedBy.length > 0) {
  this.refuse();
  return;
}
```

```ts
/** Tell the user why and hand the pane to the Markdown editor. Deferred because Obsidian is
 *  still loading the file into this view when setViewData runs. */
private refuse(): void {
  new Notice(describeIssues(this.doc.blockedBy), 10000);
  const leaf = this.leaf;
  this.contentEl.win.setTimeout(() => {
    void openLeafAs(this.plugin, leaf, MARKDOWN_VIEW_TYPE)
      .catch((err: unknown) => { console.error("Failed to open note as Markdown:", err); });
  }, 0);
}
```

`openLeafAs` saves the view first; a blocked document returns `diskText`, which equals what Obsidian holds, so nothing is written. It also remembers `markdown` for this note in this pane, so routing does not send the pane straight back to the map. If `just lint-obsidian` objects to the timer call, use the form the rule asks for; do not disable the rule.

- [ ] **Step 6: `just test`, `just check`, `just lint-obsidian`.**

- [ ] **Step 7: Commit.** `Obsidian: the map view refuses notes it cannot round-trip`

---

### Task 4: Routing tells navigation from restore

**Files:**
- Modify: `packages/obsidian/src/markdown/routing.ts`, `packages/obsidian/src/markdown/leafRouting.ts`
- Test: `packages/obsidian/src/__tests__/routing.test.ts`
- Modify if needed: the mock, so `FileView` exists and `TextFileView extends FileView` with a `file` field

**Interfaces:**
- `RoutingInput` gains `navigating: boolean`: true when the leaf currently shows a different file than the one requested.

Rule: when `navigating` is true and there is no explicit choice, the requested type is ignored for `.md` files and the note routes purely by marker and setting (map only when `hasMarker && openMarkedNotesAs === "mindmap"`, otherwise Markdown). When `navigating` is false the existing rules apply unchanged, so a restored or deferred map leaf of a marked note stays a map under either setting.

- [ ] **Step 1: Failing tests** in `routing.test.ts`. Add `navigating: false` to the existing default input helper so current tests keep their meaning, then:

```ts
it("opens the next marked note as Markdown when the setting says so, even from a map pane", () => {
  expect(resolveViewType({ ...base, requestedType: VIEW_TYPE_LIMN_MARKDOWN, hasMarker: true,
    openMarkedNotesAs: "markdown", navigating: true })).toBe(MARKDOWN_VIEW_TYPE);
});
it("opens the next marked note as a map from a map pane when the setting is mindmap", () => {
  expect(resolveViewType({ ...base, requestedType: VIEW_TYPE_LIMN_MARKDOWN, hasMarker: true,
    openMarkedNotesAs: "mindmap", navigating: true })).toBe(VIEW_TYPE_LIMN_MARKDOWN);
});
it("keeps an explicit choice while navigating", () => {
  expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE, hasMarker: false,
    chosenType: VIEW_TYPE_LIMN_MARKDOWN, navigating: true })).toBe(VIEW_TYPE_LIMN_MARKDOWN);
});
it("keeps a restored map leaf of a marked note as a map under the markdown setting", () => {
  expect(resolveViewType({ ...base, requestedType: VIEW_TYPE_LIMN_MARKDOWN, hasMarker: true,
    openMarkedNotesAs: "markdown", navigating: false })).toBe(VIEW_TYPE_LIMN_MARKDOWN);
});
```

Plus one wrapper-level test using the file's `MockLeaf`: a leaf whose `view.file.path` is `A.md` receiving `setViewState({ type: VIEW_TYPE_LIMN_MARKDOWN, state: { file: "B.md" } })` with B marked and the setting `markdown` forwards type `markdown`.

- [ ] **Step 2: Confirm failure.**

- [ ] **Step 3: Implement.** In `resolveViewType`, after the `chosenType` line:

```ts
if (navigating) return hasMarker && openMarkedNotesAs === "mindmap" ? VIEW_TYPE_LIMN_MARKDOWN : MARKDOWN_VIEW_TYPE;
```

In the wrapper:

```ts
const current = this.view instanceof FileView ? this.view.file?.path : undefined;
// ...
navigating: filePath !== undefined && current !== undefined && current !== filePath,
```

- [ ] **Step 4: `just test`, `just check`, `just lint-obsidian`.**

- [ ] **Step 5: Commit.** `Obsidian routing: a note opened from a map pane routes by marker and setting`

---

### Task 5: Wikilinks need a boundary before `[[`

**Files:**
- Modify: `packages/core/src/markdown/inlineMarkdown.ts`
- Test: `packages/core/src/__tests__/inline-markdown.test.ts`

- [ ] **Step 1: Failing tests.**

```ts
it("does not read index syntax as a wikilink", () => {
  const segs = parseInlineMarkdown("matrix[[0]] = 1");
  expect(segs.map((s) => s.text).join("")).toBe("matrix[[0]] = 1");
  expect(segs.some((s) => s.style.link)).toBe(false);
});
it("does not read nested brackets as a wikilink", () => {
  expect(parseInlineMarkdown("a]][[b]]").some((s) => s.style.link)).toBe(false);
});
it("still reads a wikilink after a space, punctuation, or at the start", () => {
  for (const line of ["[[Note]]", "see [[Note]]", "([[Note]])", "x: [[Note|alias]]"]) {
    expect(parseInlineMarkdown(line).some((s) => s.style.link === "[[Note]]")).toBe(true);
  }
});
```

- [ ] **Step 2: Confirm the first two fail.**

- [ ] **Step 3: Implement.** In the wikilink branch condition, replace `line[i - 1] !== "!"` with a helper:

```ts
/** A wikilink may not follow `!` (that is an embed), a word character, or `]`. */
function canStartWikilink(line: string, i: number): boolean {
  const prev = line[i - 1];
  return prev === undefined || !/[\w\]!]/.test(prev);
}
```

Check any other caller of the wikilink parse (the `displayText` path used for measurement) goes through the same branch, so measured width and rendered text agree.

- [ ] **Step 4: `just test`. Commit.** `Inline Markdown: a wikilink needs a boundary before its brackets`

---

### Task 6: Small corrections

**Files:**
- Modify: `packages/obsidian/src/markdown/OutlineDocument.ts`, `packages/obsidian/src/main.ts`
- Test: `packages/obsidian/src/__tests__/outline-document.test.ts`

- [ ] **Step 1: Natural sizes do not outlive the note (failing test first).**

```ts
it("forgets natural sizes when a different note is loaded", () => {
  doc.load("- a\n  ![[image.png]]\n", true);
  doc.setImageNaturalSize("image.png", 800, 600);
  doc.load("- b\n  ![[image.png]]\n", true);
  expect(doc.hasNaturalSize("image.png")).toBe(false);
});
it("keeps natural sizes across an external update of the same note", () => {
  doc.load("- a\n  ![[image.png]]\n", true);
  doc.setImageNaturalSize("image.png", 800, 600);
  doc.load("- a2\n  ![[image.png]]\n", false);
  expect(doc.hasNaturalSize("image.png")).toBe(true);
});
```

Implement: `this.naturalSizes.clear()` at the start of `load` when `clear` is true, and in `clear()`.

- [ ] **Step 2: Unload order.** Obsidian runs a plugin's registered cleanups (including the one `registerView` adds) before it calls `onunload`, in reverse registration order. Move the routing uninstall and the hand-back loop out of `onunload` into a cleanup registered immediately after the `registerView(VIEW_TYPE_LIMN_MARKDOWN, ...)` call, so it runs while the view type still exists:

```ts
// Registered after the view type so it runs before the type is unregistered.
this.register(() => this.handBackMapLeaves());
```

`handBackMapLeaves()` holds the existing body (uninstall the wrapper first, then `setViewState` each map leaf to Markdown with the `.catch`). `onunload` keeps nothing for routing. Remove the comment that claims the old ordering. There is no unit test for Obsidian's unload order; this step is verified by the manual checklist item added in Task 8. If the manual check still shows a blank pane, report it rather than guessing further.

- [ ] **Step 3: `just test`, `just check`, `just lint-obsidian`. Commit.** `Obsidian: natural sizes are per note; hand map panes back before the view type unregisters`

---

### Task 7: Drive OutlineDocument through the TextFileView sequence

Test-only. The review confirmed these behaviors with a throwaway probe; this task makes them permanent.

**Files:**
- Create: `packages/obsidian/src/__tests__/text-file-view-cycle.test.ts`

Write a small in-test `FakeTextFileView` that reproduces the base class's bookkeeping and nothing else:

```ts
class FakeTextFileView implements SaveHost {
  data = "";
  disk = "";
  writes: string[] = [];
  dirty = false;
  constructor(private readonly doc: OutlineDocument) {}
  requestSave(): void { this.dirty = true; }
  open(text: string): void { this.disk = text; this.data = text; this.dirty = false; this.doc.load(text, true); }
  /** What the debounce or a close does. */
  save(): void {
    const next = this.doc.viewData();
    this.dirty = false;
    if (next === this.data) return;
    this.data = next; this.disk = next; this.writes.push(next);
  }
  /** Another writer changed the file. A dirty view saves first, as TextFileView does. */
  externalChange(text: string): void {
    this.disk = text;
    this.data = text;
    this.doc.load(text, false);
  }
}
```

Cases, each a separate `it`:
1. Open a hand-formatted note (`*` bullets, 4-space indents), change selection and camera, `save()`: `writes` is empty.
2. Edit a node's text, `save()`: one write, equal to the canonical text with the edit.
3. Edit then undo on a non-canonical note before `save()`: `writes` is empty.
4. Edit, `save()`, undo, `save()`: second write is the canonical original.
5. Dirty edit, then `externalChange` with an unrelated added bullet, then `save()`: node ids of unchanged nodes are the same as before, and the selection is kept.
6. `open(A)`, edit, `save()`, `open(B)`, `save()`: `writes` contains only the write to A.
7. `open` an unsupported note (Task 3), edit the map, `save()`: `writes` is empty.
8. Tab to add an empty child, `externalChange` with the same text: assert the current behavior (the empty node is dropped and nothing is written). Name the test for what it asserts; it documents a known limitation.

- [ ] **Step 1:** Write the tests. Cases 1 to 6 and 8 should pass against current code; if one fails, stop and report it as a finding rather than changing the assertion.
- [ ] **Step 2:** `just test`, `just check`. Commit. `Tests: OutlineDocument through the TextFileView load, save, and external-change sequence`

---

### Task 8: Spec, docs, checklist

**Files:**
- Modify: `docs/specs/2026-08-15-markdown-backed-mind-maps-design.md`, `OBSIDIAN-PLUGIN.md`

- [ ] **Step 1: Spec.**
  - 5.1: thematic breaks (including spaced forms), setext underlines, `$$` math blocks, and multi-line HTML comments are prose, alongside fences and `%%` comments.
  - New 5.7 "Unsupported content": the two issue kinds from Task 2, what each means, and that a note with any issue is not opened as a map.
  - 6.1: `findOutlineIssues` in the codec's API list; table delimiter rows in the escape set.
  - 7.1: blocked documents (never write, hand back disk text); natural sizes are dropped when a different note loads.
  - 7.2: the `navigating` rule from Task 4, and that the load sweep runs only when the setting is `mindmap`.
  - 8.4: opening an unsupported note shows a notice and opens it as Markdown; an external change that introduces unsupported content while the map has unsaved edits discards those edits in favor of the file.
  - 5.2: the wikilink boundary rule.
  - 11 (risks): replace any claim that arbitrary notes are safe to open with the refusal rule.

- [ ] **Step 2: `OBSIDIAN-PLUGIN.md`.** Document the refusal behavior in the "Markdown-backed mind maps" section. Remove the stale checklist line "Paste image, verify sidecar `.limn-assets/` folder created". Add manual checklist items:
  - Open a note with a numbered list inside a bullet as a mind map: a notice appears, the note opens as Markdown, the file is byte-identical.
  - With "open marked notes as: Markdown", use "Open as mind map" on note A, then click marked note B in the same pane: B opens as Markdown.
  - With a map open and an edit made less than two seconds ago, disable the plugin: the pane becomes a Markdown pane (not blank) and the edit is in the file.
  - Update the plugin (re-run `just obsidian-install`, reload) with a map pane open: the pane is usable afterwards.
  - A note with `* * *` between paragraphs and a `$$` block containing `- x`: open as a map, edit a node, the rule and the math block are unchanged.

- [ ] **Step 3: `just check`. Commit.** `Docs: unsupported-content refusal, routing while navigating, manual checks`

---

## Not in this wave

Recorded so they are not lost; none of them can damage a note.

- "Open as" choices are forgotten on rename, split, popout, and restart.
- A restored map leaf can fall back to Markdown when the metadata cache has not indexed the file yet.
- Embeds of non-images or missing files (`![[Some Note]]`) render as a blank node.
- The theme picker in one map pane does not update other open map panes.
- A frontmatter opener with trailing whitespace is not recognized (needs a check of what Obsidian itself accepts).
- Mixed line endings are normalized to CRLF when any CRLF is present.
- Dropping a `.limn` file with images onto a Markdown-backed map leaves dangling image refs.
- Spec section 9 (Markdown copy and paste in web and desktop) and the README update: plan 3.
