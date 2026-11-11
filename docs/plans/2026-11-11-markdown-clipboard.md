# Markdown Copy, Cut, and Paste

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In every Limn map (web, desktop, Obsidian `.limn` view, Obsidian Markdown-backed view), Cmd+C copies the selected node's subtree to the clipboard as a Markdown bullet list, Cmd+X does the same and deletes the subtree, and Cmd+V turns a Markdown bullet list on the clipboard into nodes.

**Architecture:** The Editor gains two methods, `copyMarkdown(nodeId)` and `pasteMarkdown(text)`, built on the outline codec that already exists in `packages/core/src/markdown/outline.ts`. A new hook in `packages/web`, `useClipboard`, listens for the DOM `copy`, `cut`, and `paste` events and calls those methods; it also takes over the image paste that `App.tsx` and `LimnViewRoot.ts` each implement today. Both Obsidian views mount through `LimnViewRoot.ts`, so they get the behaviour from the same hook. No key bindings are added to `dispatch.ts`: the browser, WKWebView, and Electron all raise the clipboard events for Cmd+C/X/V themselves.

**Tech Stack:** TypeScript, React hooks, vitest (`just test`, `just test-file <path>`), WebdriverIO for Obsidian (`just obsidian-e2e`).

**Spec:** `docs/specs/2026-08-15-markdown-backed-mind-maps-design.md`, section 9 (amended in Task 5).

**Branch:** create `markdown-clipboard` from `main`. Do not merge or push.

## Global Constraints

- Red/green: write the failing test first, see it fail, then implement. Commit after each task, only when `just check` passes (it includes `just lint-obsidian`). Never `--no-verify`. Commit messages via heredoc, no command substitution.
- `packages/core` has zero browser or Obsidian dependencies.
- No `any`. No eslint-disable for `obsidianmd/*` rules. Use `bunx`, not `npx`. Use `just` recipes, not the underlying tools.
- Shared code must not call `document.createElement(tag)`, use the global `document`, or use bare `setTimeout`; see "Keeping the scorecard green" in `OBSIDIAN-PLUGIN.md`. `just lint-obsidian` must print nothing.
- Every code file starts with two `// ABOUTME: ` lines. Comments are evergreen: no history, no "now", no ticket ids.
- No emoji or em dashes anywhere, including test names and commit messages.
- No change to `schema.ts`, serialization of `.limn` files, or the file format.
- Existing image paste and image drop behave exactly as before.

## Decisions already made (do not reopen)

- Clipboard format is `text/plain` only. No `.limn` JSON on the clipboard.
- Paste takes what it can: every bullet list in the pasted text becomes nodes, text outside the lists is dropped, and constructs the Markdown-backed view would refuse (a numbered list or heading inside a bullet) are not refused here; they land as whatever text the parser gives them. `findOutlineIssues` is not consulted.
- Pasted text with no bullet line at all becomes one node whose text is the trimmed pasted text. Empty or whitespace-only text pastes nothing and records no undo step.
- Paste with a node selected appends the pasted top-level items as that node's last children. Paste with nothing selected makes each top-level item a root.
- After a paste the first pasted top-level node is selected and the editor is not in edit mode. One paste is one undo step.
- Cut is copy followed by `deleteNode`; the delete is the undo step.
- Images: copy writes the `![[assetId|WxH]]` embed exactly as `toMarkdown` does. Paste keeps an image only when the document already has an asset with that id (so copy, cut, and paste inside one map keep their images); otherwise the image is dropped and the node keeps its text. Carrying image data between maps is out of scope.
- Copy, cut, and paste do nothing while a node is being edited (the textarea's native behaviour applies), while focus is in another input, or, for copy and cut, while the page has a non-empty text selection.
- Markdown import and export menu items are out of scope.

## File map

| File | Change |
|---|---|
| `packages/core/src/serialization/serialization.ts` | `subtreeToMarkdown(store, nodeId)`; `toMarkdown` reuses its node conversion (Task 1) |
| `packages/core/src/editor/Editor.ts` | `copyMarkdown` (Task 1), `pasteMarkdown` (Task 2) |
| `packages/core/src/__tests__/clipboard.test.ts` | New: tests for Tasks 1 and 2 |
| `packages/web/src/input/foreignInput.ts` | New: `isForeignInput(target)`, extracted from `useKeyboardHandler.ts` (Task 3) |
| `packages/web/src/input/clipboard.ts` | New: `handleClipboardEvent` plus the `useClipboard` hook (Task 3) |
| `packages/web/src/__tests__/clipboard.test.ts` | New: tests for Task 3 |
| `packages/web/src/App.tsx` | Replace the inline paste effect with `useClipboard` (Task 3) |
| `packages/obsidian/src/LimnViewRoot.ts` | Replace the inline paste effect with `useClipboard` (Task 4) |
| `packages/obsidian/e2e/specs/clipboard.e2e.ts`, `e2e/helpers.ts` | New spec and a helper that raises clipboard events (Task 4) |
| `packages/core/src/keybindings/shortcutHelp.ts`, spec, `README.md`, `OBSIDIAN-PLUGIN.md` | Task 5 |

---

### Task 1: Copy a subtree as Markdown

**Files:**
- Modify: `packages/core/src/serialization/serialization.ts`, `packages/core/src/editor/Editor.ts`
- Create: `packages/core/src/__tests__/clipboard.test.ts`

**Interfaces:**
- Produces: `subtreeToMarkdown(store: MindMapStore, nodeId: string): string` and `Editor.copyMarkdown(nodeId: string): string`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/__tests__/clipboard.test.ts`. Look at `packages/core/src/__tests__/editor.test.ts` for how tests build a map with `TestEditor` (`addRoot`, `addChild`, `exitEditMode` or the equivalent already used there) and follow the same style.

```ts
// ABOUTME: Tests for copying a subtree as Markdown and pasting a Markdown list as nodes.
// ABOUTME: Runs on TestEditor with the stub text measurer; no browser.

import { describe, it, expect } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";

/** A root "Root" with children "A" (children "A1", "A2") and "B". Returns the ids. */
function sampleMap(editor: TestEditor) {
  const root = editor.addRoot("Root");
  const a = editor.addChild(root, "A");
  const a1 = editor.addChild(a, "A1");
  const a2 = editor.addChild(a, "A2");
  const b = editor.addChild(root, "B");
  editor.exitEditMode();
  return { root, a, a1, a2, b };
}

describe("copyMarkdown", () => {
  it("writes the node and its descendants as a nested bullet list", () => {
    const editor = new TestEditor();
    const { a } = sampleMap(editor);
    expect(editor.copyMarkdown(a)).toBe("- A\n  - A1\n  - A2");
  });

  it("writes a leaf as a single bullet", () => {
    const editor = new TestEditor();
    const { b } = sampleMap(editor);
    expect(editor.copyMarkdown(b)).toBe("- B");
  });

  it("writes a root with its whole tree", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    expect(editor.copyMarkdown(root)).toBe("- Root\n  - A\n    - A1\n    - A2\n  - B");
  });

  it("marks a collapsed node with a star and still writes its children", () => {
    const editor = new TestEditor();
    const { a } = sampleMap(editor);
    editor.toggleCollapse(a);
    expect(editor.copyMarkdown(a)).toBe("* A\n  - A1\n  - A2");
  });

  it("writes multi-line text as backslash-continued lines", () => {
    const editor = new TestEditor();
    const root = editor.addRoot("one\ntwo");
    editor.exitEditMode();
    expect(editor.copyMarkdown(root)).toBe("- one\\\n  two");
  });

  it("does not change the document or the undo stack", () => {
    const editor = new TestEditor();
    const { a } = sampleMap(editor);
    const before = JSON.stringify(editor.toJSON());
    const couldUndo = editor.canUndo();
    editor.copyMarkdown(a);
    expect(JSON.stringify(editor.toJSON())).toBe(before);
    expect(editor.canUndo()).toBe(couldUndo);
  });
});
```

If `exitEditMode` or `toggleCollapse` go by other names on `Editor`, use the real names. If the expected string for multi-line or collapsed nodes differs from what `editor.toMarkdown()` already produces for the same node as a root, the existing writer is right: fix the expectation, not the writer.

- [ ] **Step 2: Run to see them fail**

Run: `just test-file packages/core/src/__tests__/clipboard.test.ts`
Expected: FAIL, `editor.copyMarkdown is not a function`.

- [ ] **Step 3: Implement**

In `serialization.ts`, lift the node conversion out of `toMarkdown` so both functions share it:

```ts
function nodeToOutline(store: MindMapStore, node: MindMapNode): OutlineNode {
  const outline: OutlineNode = {
    text: node.text,
    collapsed: node.collapsed && node.children.length > 0,
    children: store.getChildren(node.id).map((child) => nodeToOutline(store, child)),
  };
  if (node.image) outline.image = imageRefToOutline(node.image);
  return outline;
}

/** Nested bullet outline of the store in the Limn Markdown dialect. */
export function toMarkdown(store: MindMapStore): string {
  return writeSubtree(store.getRoots().map((root) => nodeToOutline(store, root)));
}

/** Nested bullet outline of one node and its descendants. */
export function subtreeToMarkdown(store: MindMapStore, nodeId: string): string {
  return writeSubtree([nodeToOutline(store, store.getNode(nodeId))]);
}
```

In `Editor.ts`, next to `toMarkdown()`:

```ts
  /** The node and its descendants as a Markdown bullet list, for the clipboard. */
  copyMarkdown(nodeId: string): string {
    return subtreeToMarkdown(this.store, nodeId);
  }
```

and add `subtreeToMarkdown` to the existing import from `../serialization/serialization`.

- [ ] **Step 4: Run to see them pass**

Run: `just test-file packages/core/src/__tests__/clipboard.test.ts`, then `just check`.
Expected: PASS; existing `toMarkdown` tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/serialization/serialization.ts packages/core/src/editor/Editor.ts packages/core/src/__tests__/clipboard.test.ts
git commit -F - <<'EOF'
Core: copy a subtree as Markdown

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

### Task 2: Paste a Markdown list as nodes

**Files:**
- Modify: `packages/core/src/editor/Editor.ts`
- Test: `packages/core/src/__tests__/clipboard.test.ts`

**Interfaces:**
- Consumes: `parseSubtree(text): OutlineNode[]` from `../markdown/outline`; `Editor.copyMarkdown` from Task 1.
- Produces: `Editor.pasteMarkdown(text: string): string[]`, returning the ids of the pasted top-level nodes in order (empty when nothing was pasted).

- [ ] **Step 1: Write the failing tests**

Append to `clipboard.test.ts`. `texts(editor, id)` is a local helper that returns the texts of a node's children in order, via `editor.getNode(id).children` or whatever accessor the other tests use.

```ts
describe("pasteMarkdown", () => {
  const LIST = "- X\n  - X1\n  - X2\n- Y";

  it("adds the list's top-level items as the selected node's last children", () => {
    const editor = new TestEditor();
    const { root, a, b } = sampleMap(editor);
    editor.select(root);
    const pasted = editor.pasteMarkdown(LIST);
    expect(pasted).toHaveLength(2);
    expect(texts(editor, root)).toEqual(["A", "B", "X", "Y"]);
    expect(texts(editor, pasted[0] as string)).toEqual(["X1", "X2"]);
    editor.expectChildren(root, [a, b, ...pasted]);
  });

  it("selects the first pasted node and is not editing", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    const pasted = editor.pasteMarkdown(LIST);
    editor.expectSelected(pasted[0] as string).expectNotEditing();
  });

  it("is one undo step", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    const before = editor.copyMarkdown(root);
    editor.pasteMarkdown(LIST);
    editor.undo();
    expect(editor.copyMarkdown(root)).toBe(before);
    editor.redo();
    expect(texts(editor, root)).toEqual(["A", "B", "X", "Y"]);
  });

  it("expands a collapsed target", () => {
    const editor = new TestEditor();
    const { a } = sampleMap(editor);
    editor.toggleCollapse(a);
    editor.select(a);
    editor.pasteMarkdown("- New");
    editor.expectExpanded(a);
    expect(texts(editor, a)).toEqual(["A1", "A2", "New"]);
  });

  it("makes each top-level item a root when nothing is selected", () => {
    const editor = new TestEditor();
    sampleMap(editor);
    editor.deselect();
    const rootsBefore = editor.getRoots().length;
    const pasted = editor.pasteMarkdown(LIST);
    expect(editor.getRoots().length).toBe(rootsBefore + 2);
    expect(editor.getRoots().map((r) => r.id)).toEqual(expect.arrayContaining(pasted));
  });

  it("pastes into an empty map", () => {
    const editor = new TestEditor();
    const pasted = editor.pasteMarkdown(LIST);
    expect(editor.getRoots().map((r) => r.text)).toEqual(["X", "Y"]);
    editor.expectSelected(pasted[0] as string);
  });

  it("pastes text without bullets as one node", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    editor.pasteMarkdown("  just some words\nand more  ");
    expect(texts(editor, root)).toEqual(["A", "B", "just some words\nand more"]);
  });

  it("pastes nothing and records no undo step for blank text", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    const version = JSON.stringify(editor.toJSON());
    expect(editor.pasteMarkdown("  \n ")).toEqual([]);
    expect(JSON.stringify(editor.toJSON())).toBe(version);
    editor.undo(); // undoes sampleMap's last step, not a paste
    expect(texts(editor, root)).not.toEqual(["A", "B"]);
  });

  it("keeps the bullets and drops the text around them", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    editor.pasteMarkdown("# Heading\n\nSome prose.\n\n- X\n- Y\n\nMore prose.\n\n- Z");
    expect(texts(editor, root)).toEqual(["A", "B", "X", "Y", "Z"]);
  });

  it("accepts a list whose every line is indented, and tab indents", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    const pasted = editor.pasteMarkdown("    - X\n    \t- X1\n    - Y");
    expect(texts(editor, root)).toEqual(["A", "B", "X", "Y"]);
    expect(texts(editor, pasted[0] as string)).toEqual(["X1"]);
  });

  it("carries collapse markers", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    const pasted = editor.pasteMarkdown("* X\n  - X1");
    editor.expectCollapsed(pasted[0] as string);
  });

  it("round-trips a copied subtree", () => {
    const editor = new TestEditor();
    const { a, b } = sampleMap(editor);
    const copied = editor.copyMarkdown(a);
    editor.select(b);
    const pasted = editor.pasteMarkdown(copied);
    expect(editor.copyMarkdown(pasted[0] as string)).toBe(copied);
  });

  it("gives pasted nodes positions that do not overlap their siblings", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    editor.pasteMarkdown(LIST);
    const kids = editor.getNode(root).children.map((id) => editor.getNode(id));
    const sameSide = kids.filter((k) => k.x > editor.getNode(root).x).sort((p, q) => p.y - q.y);
    for (let i = 1; i < sameSide.length; i++) {
      const prev = sameSide[i - 1]!;
      expect(sameSide[i]!.y).toBeGreaterThanOrEqual(prev.y + prev.height);
    }
  });

  it("puts pasted children on the right in a document without sides", () => {
    const editor = new TestEditor();
    editor.setCapabilities(OUTLINE_CAPABILITIES);
    const root = editor.addRoot("Root");
    editor.exitEditMode();
    editor.select(root);
    const pasted = editor.pasteMarkdown(LIST);
    for (const id of pasted) expect(editor.getNode(id).x).toBeGreaterThan(editor.getNode(root).x);
  });

  it("keeps an image whose asset the document has, and drops one it does not", () => {
    const editor = new TestEditor();
    const root = editor.addRoot("Root");
    editor.exitEditMode();
    editor.setNodeImage(root, { id: "known.png", filename: "known.png", mimeType: "image/png", width: 40, height: 30 }, 40, 30);
    editor.select(root);
    const pasted = editor.pasteMarkdown("- has ![[known.png|40x30]]\n- lost ![[unknown.png|40x30]]");
    expect(editor.getNode(pasted[0] as string).image?.assetId).toBe("known.png");
    expect(editor.getNode(pasted[1] as string).image).toBeUndefined();
    expect(editor.getNode(pasted[1] as string).text).toBe("lost");
  });
});
```

Check the `Asset` type for the exact fields `setNodeImage` wants and adjust the literal. Import `OUTLINE_CAPABILITIES` from `../editor/capabilities`. Where a test uses the non-null `!`, follow whatever the neighbouring tests do to satisfy the linter.

- [ ] **Step 2: Run to see them fail**

Run: `just test-file packages/core/src/__tests__/clipboard.test.ts`
Expected: FAIL, `editor.pasteMarkdown is not a function`.

- [ ] **Step 3: Implement**

Add to `Editor.ts`, after `importRoots`. Read `addRoot`, `addChild`, `importRoots`, and `enterEasyMotionMode` first: this method combines pieces each of them already uses.

```ts
  /**
   * Add the bullet lists in `text` as nodes: children of the selected node, or roots when nothing
   * is selected. Text without any bullet becomes a single node. Returns the top-level node ids.
   */
  pasteMarkdown(text: string): string[] {
    let outline = parseSubtree(text);
    if (outline.length === 0) {
      const plain = text.trim();
      if (plain === "") return [];
      outline = [{ text: plain, collapsed: false, children: [] }];
    }

    this.pushUndo("paste");
    const parentId = this.selectedId;
    if (parentId !== null && this.store.getNode(parentId).collapsed) {
      this.store.toggleCollapse(parentId);
      relayoutFromNode(this.store, parentId);
    }

    const knownAssets = new Map(this.store.getAssets().map((a) => [a.id, a]));
    const addDescendants = (id: string, node: OutlineNode): void => {
      const asset = node.image ? knownAssets.get(node.image.target) : undefined;
      if (node.image && asset) {
        const size = /* display size: node.image.width/height when given, else fitted natural size */;
        this.store.setNodeImage(id, asset, size.width, size.height);
      }
      this.remeasureNode(id);
      for (const child of node.children) {
        const childId = this.store.addChild(id, child.text);
        addDescendants(childId, child);
      }
      if (node.collapsed && node.children.length > 0) this.store.toggleCollapse(id);
    };

    const pasted: string[] = [];
    for (const node of outline) {
      const id = parentId !== null ? this.store.addChild(parentId, node.text) : this.addPastedRoot(node.text);
      addDescendants(id, node);
      // position `id` and lay out its subtree; see below
      pasted.push(id);
    }

    this.selectedId = pasted[0] ?? null;
    this.editing = false;
    if (this.selectedId) this.ensureNodeVisible(this.selectedId);
    this.notify();
    return pasted;
  }
```

The two places left open above are layout work that must be settled against `packages/core/src/layout/layout.ts`, with the tests as the contract:

1. **Image display size.** Use the same rule the Markdown-backed view uses for an embed with and without a size; find it by following `OUTLINE_IMAGE_UNKNOWN_SIZE` and `getImageDisplaySize`. Do not write a second copy of that rule: extract a helper if one is not already callable.
2. **Positions.** For a child paste, each top-level pasted node is positioned the way `addChild` positions a new child (`positionNewChild(this.store, id, sideHint)` with `sideHint = this.capabilities.sides ? undefined : 1`), its descendants are placed with the existing subtree layout functions (`reflowSubtree` for x, `relayoutSubtree(store, id, true)` for y are the likely pair), and after the loop `relayoutFromNode(this.store, parentId)` and `this.resolveOverlapForNode(parentId)` run once. For a root paste, `addPastedRoot` is a private helper that does what `addRoot` does without its own `pushUndo`, selection, or `notify`: it adds a root at the centre of the viewport in world coordinates (the formula is in `enterEasyMotionMode`), assigns the next branch colour, and each later root is placed below the previous one's tree (`treeBoundingBox`) with `TREE_PADDING`; `resolveOverlapForNode` runs for each. If `addRoot`'s colour assignment would be duplicated, extract it into a private method that `addRoot`, `detachToRoot`, and `addPastedRoot` all call.

If the document has `freePosition` off (the Markdown-backed view), finish with whatever full relayout that mode already applies after structural edits; look at how `addChild` behaves under `OUTLINE_CAPABILITIES` and at `relayoutAll`.

- [ ] **Step 4: Run to see them pass**

Run: `just test-file packages/core/src/__tests__/clipboard.test.ts`, then `just check`.
Expected: PASS, no warnings.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/editor/Editor.ts packages/core/src/__tests__/clipboard.test.ts
git commit -F - <<'EOF'
Core: paste a Markdown list as nodes

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

### Task 3: Clipboard events in the web app

**Files:**
- Create: `packages/web/src/input/foreignInput.ts`, `packages/web/src/input/clipboard.ts`, `packages/web/src/__tests__/clipboard.test.ts`
- Modify: `packages/web/src/input/useKeyboardHandler.ts`, `packages/web/src/App.tsx`

**Interfaces:**
- Consumes: `Editor.copyMarkdown`, `Editor.pasteMarkdown`, `Editor.deleteNode`; `attachImageFile`, `imageFileFromTransfer`, `pastedImageName` from `../assets/attachImage`.
- Produces:
  - `isForeignInput(target: EventTarget | null): boolean`
  - `handleClipboardEvent(kind: "copy" | "cut" | "paste", e: ClipboardEvent, ctx: ClipboardContext): void` where `ClipboardContext = { editor: Editor; provider: PersistenceProvider; hasTextSelection: () => boolean; isActive?: () => boolean }`
  - `useClipboard(editor: Editor, provider: PersistenceProvider, doc: Document, isActive?: () => boolean): void`

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/__tests__/clipboard.test.ts`. The test environment is node, so events are plain objects; `packages/web/src/__tests__/attach-image.test.ts` shows the stubs (`window`, `Image`, object URLs, `fakeProvider`) needed when the image path is exercised. Copy `fakeProvider` into a shared test helper file rather than duplicating it if it is not already shared.

```ts
// ABOUTME: Tests for the clipboard event handler shared by the web app and the Obsidian views.
// ABOUTME: Events are plain objects with a fake clipboardData; no browser.

function fakeEvent(data: Record<string, string> = {}, target: object = { tagName: "DIV", dataset: {} }) {
  const store = new Map(Object.entries(data));
  return {
    target,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    clipboardData: {
      items: [] as unknown[],
      getData: (type: string) => store.get(type) ?? "",
      setData: (type: string, value: string) => { store.set(type, value); },
    },
    written: store,
  };
}
```

Tests (each builds a `TestEditor` with a root "Root" and child "A" that has child "A1", and a context with `hasTextSelection: () => false`):

1. `copy` with "A" selected writes `"- A\n  - A1"` as `text/plain` and prevents default; the map is unchanged.
2. `cut` with "A" selected writes the same text, prevents default, and "A" is gone; `undo` brings it back.
3. `copy` and `cut` with nothing selected do nothing and do not prevent default.
4. `copy` while editing a node does nothing and does not prevent default.
5. `copy` when `hasTextSelection()` is true does nothing and does not prevent default.
6. `copy`, `cut`, and `paste` whose target is `{ tagName: "INPUT" }` do nothing.
7. Every kind does nothing when `isActive` returns false.
8. `paste` with `text/plain` `"- X\n- Y"` and "Root" selected adds X and Y under Root and prevents default.
9. `paste` with empty `text/plain` does nothing and does not prevent default.
10. `paste` while editing does nothing and does not prevent default (the textarea receives the text natively).
11. `paste` with an image item and `text/plain` both present attaches the image and adds no nodes (image takes precedence). Use an `items` entry of `{ type: "image/png", getAsFile: () => file }`.
12. `isForeignInput`: true for INPUT, for a TEXTAREA without `data-limn-edit`, and for a contentEditable element; false for the Limn edit textarea, a DIV, and null.

- [ ] **Step 2: Run to see them fail**

Run: `just test-file packages/web/src/__tests__/clipboard.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`foreignInput.ts`: move the INPUT / TEXTAREA / contentEditable test out of `useKeyboardHandler.ts` into `isForeignInput` and call it from there, so the rule exists once.

`clipboard.ts`:

```ts
// ABOUTME: Copy, cut, and paste for a mind map: subtrees travel as Markdown bullet lists, images attach.
// ABOUTME: One handler for the web app and the Obsidian views, driven by the DOM clipboard events.

export function handleClipboardEvent(kind: ClipboardKind, e: ClipboardEvent, ctx: ClipboardContext): void {
  const { editor } = ctx;
  if (ctx.isActive && !ctx.isActive()) return;
  if (editor.isEditing() || isForeignInput(e.target)) return;

  if (kind === "paste") {
    const file = imageFileFromTransfer(e.clipboardData);
    if (file) {
      e.preventDefault();
      const selectedId = editor.getSelectedId();
      attachImageFile(
        editor, ctx.provider, file, pastedImageName(file.type, new Date()),
        selectedId ? { nodeId: selectedId } : { x: 0, y: 0 },
      ).catch((err: unknown) => { console.error("Failed to attach image:", err); });
      return;
    }
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (text.trim() === "") return;
    e.preventDefault();
    editor.pasteMarkdown(text);
    return;
  }

  const selectedId = editor.getSelectedId();
  if (selectedId === null || ctx.hasTextSelection() || !e.clipboardData) return;
  e.clipboardData.setData("text/plain", editor.copyMarkdown(selectedId));
  e.preventDefault();
  if (kind === "cut") editor.deleteNode(selectedId);
}

export function useClipboard(editor: Editor, provider: PersistenceProvider, doc: Document, isActive?: () => boolean): void {
  useEffect(() => {
    const ctx: ClipboardContext = {
      editor, provider, isActive,
      hasTextSelection: () => (doc.getSelection()?.toString() ?? "") !== "",
    };
    const kinds = ["copy", "cut", "paste"] as const;
    const listeners = kinds.map((kind) => {
      const listener = (e: ClipboardEvent) => handleClipboardEvent(kind, e, ctx);
      doc.addEventListener(kind, listener);
      return () => doc.removeEventListener(kind, listener);
    });
    return () => { for (const remove of listeners) remove(); };
  }, [editor, provider, doc, isActive]);
}
```

Note the image paste previously ran while editing in the web app (it had no `isEditing` check). Check `attachImageFile`'s existing behaviour and tests: if an image paste while editing is covered by a test or is plainly intended, keep it by moving the image branch above the `isEditing` return, and add test 11b for it. Existing image behaviour must not change.

`App.tsx`: delete the "Handle paste from clipboard" effect and call `useClipboard(editor, provider, getHost().doc)` (or however `App.tsx` already reaches the document without tripping `obsidianmd/prefer-active-doc`; the old code listened on `window`, and clipboard events bubble to the document, so `document` is equivalent). Remove imports that are no longer used.

- [ ] **Step 4: Run to see them pass**

Run: `just test-file packages/web/src/__tests__/clipboard.test.ts`, then `just check`, then `just build-web`.
Expected: PASS, no lint output.

- [ ] **Step 5: Try it in a browser**

Run `just serve`, open the app, and with the Playwright MCP or by hand: select a node, Cmd+C, select another, Cmd+V; Cmd+X then Cmd+V elsewhere; paste a bullet list copied from a text editor; paste an image. Screenshots go to `/tmp`. Report what happened; do not claim this step passed without doing it.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src
git commit -F - <<'EOF'
Web: copy, cut, and paste subtrees as Markdown

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

### Task 4: The Obsidian views

**Files:**
- Modify: `packages/obsidian/src/LimnViewRoot.ts`, `packages/obsidian/e2e/helpers.ts`
- Create: `packages/obsidian/e2e/specs/clipboard.e2e.ts`

**Interfaces:**
- Consumes: `useClipboard` from `@limn/web/input/clipboard` (import path style as the existing `@limn/web/assets/attachImage` import).

- [ ] **Step 1: Write the failing end-to-end spec**

Read `e2e/specs/markdown-map.e2e.ts` for how the image paste test raises a synthetic clipboard event, and reuse that mechanism through a helper in `e2e/helpers.ts`:

- `copyFromMap(kind: "copy" | "cut"): Promise<string>` dispatches a `ClipboardEvent` with an empty `DataTransfer` on the active view's document and returns what the handler wrote as `text/plain`.
- `pasteTextIntoMap(text: string): Promise<void>` dispatches a `paste` event carrying `text/plain`.

`clipboard.e2e.ts`:

1. `.limn` file: build Root > A > A1 with the keyboard; select A; `copyFromMap("copy")` returns `"- A\n  - A1"`; select Root; `pasteTextIntoMap` of that text; the map shows a second "A" and "A1"; close and reopen the file and they are still there.
2. `.limn` file: `copyFromMap("cut")` on A removes A and A1 from the map; pasting the returned text under Root brings them back.
3. Markdown-backed note (use an existing fixture note with `limn-plugin: true`): select the root, `pasteTextIntoMap("- Pasted\n  - Child")`; after the save debounce the note's text contains the two new bullets nested under the root's bullet, and the rest of the note is unchanged.
4. Markdown-backed note: `copyFromMap("copy")` on a node with children returns the same lines the note holds for that item, with the indent removed.
5. Two map panes open in one window: a paste lands only in the active pane.

- [ ] **Step 2: Run to see it fail**

Run: `just obsidian-e2e`
Expected: the new spec fails (copy returns an empty string; text paste adds nothing); the other four specs pass.

- [ ] **Step 3: Implement**

In `LimnViewRoot.ts`, delete the image paste effect and call `useClipboard(editor, provider, containerEl.ownerDocument, isActive)`. Keep the comment's point about popout windows and `isActive` on the new call. Remove imports that are no longer used.

- [ ] **Step 4: Run to see it pass**

Run: `just obsidian-e2e`, then `just check`.
Expected: all five specs pass, including the existing image paste test.

- [ ] **Step 5: Try the real keys**

Synthetic events do not prove that Obsidian lets Cmd+C/X/V reach a non-editor view. Run `just obsidian-install obsidian_vault/limn_test`, reload Obsidian, and press the real keys in a `.limn` file and a Markdown-backed map. If Obsidian swallows them, claim them in the view scope the way `mapKeys.ts` claims Cmd+Enter, and say so in the report. If this cannot be done from the agent's environment, say so plainly so Ted checks it.

- [ ] **Step 6: Commit**

```bash
git add packages/obsidian
git commit -F - <<'EOF'
Obsidian: copy, cut, and paste subtrees as Markdown in both map views

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

### Task 5: Help, spec, and docs

**Files:**
- Modify: `packages/core/src/keybindings/shortcutHelp.ts` and its test `packages/core/src/__tests__/shortcut-help.test.ts`, `docs/specs/2026-08-15-markdown-backed-mind-maps-design.md`, `README.md`, `OBSIDIAN-PLUGIN.md`

- [ ] **Step 1: Shortcut help, test first**

Add a failing assertion to `shortcut-help.test.ts` that the "Global" group lists `Cmd C` "Copy subtree as Markdown", `Cmd X` "Cut subtree", and `Cmd V` "Paste Markdown list or image", and that they are present under `OUTLINE_CAPABILITIES` filtering as well. Then add the three entries after "Redo" in `SHORTCUT_GROUPS`. If an entry for image paste already exists, fold it into the new paste entry rather than listing paste twice.

- [ ] **Step 2: Amend the spec**

Rewrite section 9 of the spec to state what was built: the three keys, where pasted nodes go, what is dropped, the image rule, the no-op conditions, and that all four hosts share it. Replace `serializeSubtree(node)` with `Editor.copyMarkdown`. Update the "Web/desktop" row of the decision table near the top and the phase list at the end to match. Keep the line that import and export are follow-ups.

- [ ] **Step 3: User docs**

`README.md`: a short "Copy and paste" subsection near "Markdown notes as mind maps": what the three keys do, that the clipboard holds a plain Markdown list so it pastes into any editor, and that images only survive inside one map.

`OBSIDIAN-PLUGIN.md`: one paragraph under "Markdown-backed mind maps" and a line in the e2e spec list for `clipboard`; add "Cmd+C, Cmd+X, Cmd+V with the real keys in both map views" to the manual checks.

Desktop: add to the same manual list "Copy, cut, and paste in the desktop app". The Edit menu's standard pasteboard commands are untouched by `MenuCommands.swift`, so the events should arrive; this is unverified until someone runs the app.

- [ ] **Step 4: Verify and commit**

Run: `just check` and `just scorecard`.
Expected: PASS; lint prints nothing; no advisories.

```bash
git add packages/core docs README.md OBSIDIAN-PLUGIN.md
git commit -F - <<'EOF'
Docs: Markdown copy, cut, and paste

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

## Not in this plan

- Markdown import (open a `.md` outline as a new `.limn`) and a Markdown export menu item.
- Carrying image data between maps or to other apps.
- Multi-node selection.
- A release. Ted decides when to merge and bump.
