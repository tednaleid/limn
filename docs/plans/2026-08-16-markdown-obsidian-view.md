# Markdown-backed mind maps in Obsidian (plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Obsidian half of issue #8: a `TextFileView` that shows a Markdown note's nested bullet lists as an editable Limn mind map, routes marked notes to it, and stores images as vault attachments.

**Architecture:** Plan 1 (merged) put the codec (`parseOutline`/`writeOutline`), `DocumentCapabilities`, `relayoutAll`, and `reconcileIds` in core. This plan adds one core piece that plan 1 left open (how an image whose note embed has no size gets drawn) and then builds the Obsidian side in small modules: `OutlineDocument` (pure note-to-Editor bridge, unit tested), `ObsidianOutlineAssetProvider` (vault attachments), `LimnMarkdownView` (thin `TextFileView` subclass), a pure routing decision plus a `WorkspaceLeaf.setViewState` wrapper (monkey-around), commands, menus, and a settings tab. The existing `.limn` view is refactored only to share its React root and theme code.

**Tech Stack:** TypeScript, Bun, vitest, Preact-via-esbuild (Obsidian bundle), Obsidian API 1.5.7+, `monkey-around` 3.0.0.

**Spec:** `docs/specs/2026-08-15-markdown-backed-mind-maps-design.md` (sections 7, 8, 10, 11 are the ones this plan implements). Task 1 aligns the spec with three decisions taken while writing this plan; after Task 1 the spec is authoritative again.

## Global Constraints

Copied from the spec and the repo rules; every task's requirements include these.

- **Editor is the sole source of truth.** All mutations go through Editor methods. Nothing in `packages/core/` imports React, DOM APIs, or browser globals.
- **File format unchanged.** No edits to `schema.ts`, serialization, or the `.limn` shape. Schema stays at version 1.
- **Names are fixed:** view type `limn-markdown-view`; commands `Open as mind map`, `Open as Markdown`, `Create new mind map note`, `Add mind map marker to note`; the `.limn` command becomes `Create new mind map file (.limn)`; setting `Open notes with limn-plugin: true as` (Mind map / Markdown, default Mind map); frontmatter marker key `limn-plugin`.
- **The map view never writes on open.** A note is written only after a document change (structure, text, collapse, image). Camera and selection changes never write. First write normalizes list formatting (spec 5.5).
- **No `AutoSaveController` in the Markdown view.** `TextFileView.requestSave()` is the debounce; `onModify`, `onLoadFile`, `onUnloadFile` are not overridden.
- **Prototype patch is minimal and removable.** Only `WorkspaceLeaf.prototype.setViewState` is wrapped, via `monkey-around`; the uninstaller runs first thing in `onunload`. Never disable `obsidianmd/prefer-active-doc`, `no-global-this`, or `prefer-window-timers` (repo memory: doing so fails the community review).
- **Testing:** logic that can be tested without a browser must be. New Obsidian modules split pure logic (tested) from Obsidian wiring. `just check` (coverage 90/80/90/90 on core, lint, typecheck, Obsidian build) must be green at every commit; the pre-commit hook runs it. `bunx`, never `npx`.
- **Style:** two `ABOUTME:` lines at the top of every new file; comments describe current behavior only (no "for now", dates, ticket ids); no emojis or em dashes anywhere; match surrounding formatting; commit messages via heredoc, never `--no-verify`, never command substitution in the commit command.
- **Coverage note:** `vitest.config.ts` counts only `packages/core/src/**` (excluding `model/**` and fixtures). New core code goes where it is counted (`editor/`, not `model/`).

---

## File map

| Path | Task | Responsibility |
|---|---|---|
| `docs/specs/2026-08-15-markdown-backed-mind-maps-design.md` | 1 | Spec text for 7.2, 7.4, 8.1, 8.3, 10 aligned with this plan |
| `packages/core/src/editor/imageSize.ts` (new) | 2 | `imageDisplaySize`, `DEFAULT_IMAGE_DISPLAY_WIDTH` |
| `packages/core/src/editor/Editor.ts` | 2 | `getImageDisplaySize`, `setAssetNaturalSize`, remeasure and resize use display size, undo keeps known natural sizes |
| `packages/core/src/editor/resize.ts` | 2 | `initImageResize(node, size)` |
| `packages/core/src/persistence/types.ts` | 4 | optional `importAsset` |
| `packages/core/src/index.ts` | 2 | exports |
| `packages/web/src/components/NodeView.tsx`, `MindMapCanvas.tsx` | 3, 4 | draw with the display size; drop uses the shared helper |
| `packages/web/src/assets/attachImage.ts` (new) | 4 | shared paste/drop image helper |
| `packages/web/src/App.tsx` | 4 | paste uses the shared helper |
| `packages/obsidian/src/LimnViewRoot.ts` (new) | 5, 6 | shared React root and mount for both views; image paste |
| `packages/obsidian/src/viewTheme.ts` (new) | 5 | `applyThemeToContainer` |
| `packages/obsidian/src/LimnView.ts` | 5 | uses the shared modules |
| `packages/obsidian/src/markdown/OutlineDocument.ts` (new) | 7 | note text in, note text out, save signal |
| `packages/obsidian/src/markdown/ObsidianOutlineAssetProvider.ts` (new) | 8 | vault attachments as assets |
| `packages/obsidian/src/settings.ts`, `LimnSettingTab.ts` (new) | 9 | settings type, defaults, merge; settings tab |
| `packages/obsidian/src/main.ts` | 9, 10, 11, 12 | settings, view registration, routing, commands |
| `packages/obsidian/src/markdown/LimnMarkdownView.ts` (new) | 10 | the `TextFileView` |
| `packages/obsidian/src/markdown/routing.ts` (new) | 11 | pure routing decision, view type constant, marker helper |
| `packages/obsidian/src/markdown/leafRouting.ts` (new) | 11 | `setViewState` wrapper, leaf choices, `openLeafAs`, `openFileAs` |
| `packages/obsidian/src/__tests__/mocks/obsidian-module.ts` (new), `vitest.config.ts` | 11 | runtime stand-in for the `obsidian` package |
| `packages/obsidian/src/markdown/commands.ts` (new) | 12 | commands and menu items |
| `packages/core/src/markdown/inlineMarkdown.ts`, `packages/obsidian/src/openLink.ts` (new) | 13 | wikilinks render as links and open through the host |
| `OBSIDIAN-PLUGIN.md`, `ONBOARDING.md` | 14 | docs and manual checklist |

---

### Task 1: Align the spec with the plan's decisions

Three decisions were taken while writing this plan; they replace the corresponding spec text so the spec stays the binding authority during execution. No code changes.

**Files:**
- Modify: `docs/specs/2026-08-15-markdown-backed-mind-maps-design.md` (sections 7.2, 7.4, 8.1, 8.3, 10)

**Decisions (each is a ruling; the "why" is in the replacement text):**
1. Explicit "Open as ..." choices are remembered per note per pane in a `WeakMap<WorkspaceLeaf, Map<path, type>>`, so no `detach` patch is needed and no reliance on the undocumented `leaf.id`.
2. Assets are stored through one optional provider method, `importAsset(filename, blob) -> Promise<assetId>`, because the id written inside `![[...]]` is the link text Obsidian derives from the created file and the user's link settings, which is only known after the file exists.
3. An embed dimension the note does not specify stays 0 in the map's `ImageRef` and the map draws the image at its natural size (capped) instead: the note text never changes just because the map learned the image size, and resize materializes explicit dimensions.

- [ ] **Step 1: Replace section 7.2's first three bullets**

Replace the three bullets that begin "Add `monkey-around`...", "Patch `WorkspaceLeaf.prototype.setViewState`...", and "Patch `detach`..." with:

```markdown
- Add `monkey-around` (3.x) as a dependency (the same helper Kanban and Excalidraw use).
- Wrap `WorkspaceLeaf.prototype.setViewState`. For a `.md` file (`state.state.file` ends in `.md`) whose requested type is `markdown` or `limn-markdown-view`: if the user made an explicit "Open as ..." choice for this note in this leaf, use it; else if the requested type is `markdown`, the note's frontmatter has a truthy `limn-plugin`, and the setting says map, rewrite to `limn-markdown-view`; else if the requested type is `limn-markdown-view` and the note has no marker, rewrite to `markdown` (covers the `canAcceptExtension` shortcut where a map leaf opens an unmarked note and workspace restore after a marker was removed). Any other type or file passes through untouched. Frontmatter comes from `metadataCache.getCache(path)?.frontmatter`.
- Explicit choices live in `WeakMap<WorkspaceLeaf, Map<string, "markdown" | "limn-markdown-view">>` keyed by note path, so a choice lasts as long as the leaf and needs no `detach` patch and no leaf id.
```

- [ ] **Step 2: Replace section 7.4's first two bullets (the asset-id bullet, and the `ObsidianOutlineAssetProvider` bullet with its sub-bullets)**

Replace from "- In this view an asset id is the embed target..." through the "Paste/drop flow" sub-bullet with:

```markdown
- In this view an asset id is the link text inside the embed (`![[link text|WxH]]`), so `ImageRef.assetId` is exactly what gets written and what `metadataCache.getFirstLinkpathDest` resolves.
- `PersistenceProvider` gains an optional `importAsset(filename: string, blob: Blob): Promise<string>`: store a new asset under a host-chosen id derived from the filename and return that id. Hosts that generate opaque ids (web IndexedDB, desktop, the `.limn` Obsidian view) leave it undefined and keep receiving `saveAsset(assetId, blob)`.
- `ObsidianOutlineAssetProvider` implements `PersistenceProvider` (`load`/`save` are no-ops; `TextFileView` owns the note):
  - `importAsset(filename, blob)`: `path = fileManager.getAvailablePathForAttachment(filename, notePath)`, `file = vault.createBinary(path, bytes)`, returns `metadataCache.fileToLinktext(file, notePath)`, which is exactly what goes inside `![[...]]` and honors the user's link format setting.
  - `loadAssetUrls(ids)`: for each id, `metadataCache.getFirstLinkpathDest(id, notePath)`; if found, `vault.getResourcePath(file)`. `loadAsset(id)` reads the same file as a `Blob` (used by SVG export).
  - Paste/drop flow (shared web helper `attachImageFile`): read the natural size, `assetId = await provider.importAsset(filename, blob)`, `editor.setNodeImage(nodeId, {id: assetId, filename, mimeType, width, height}, displayW, displayH)` with the display size fitted to 300 px wide, then announce the object URL with the `limn:asset-added` event. Pasted images are named `Pasted image YYYYMMDDHHmmss.ext`; dropped files keep their name.
```

- [ ] **Step 3: Replace section 8.1's second bullet**

Replace "- "Open as Markdown" sticks for that leaf until it is closed. Removing the marker..." with:

```markdown
- "Open as Markdown" and "Open as mind map" stick for that note in that pane until the pane is closed; other notes opened in the pane route by their marker. Removing the marker in Markdown view changes the default for the next open; an already open map keeps working.
```

- [ ] **Step 4: Replace section 8.3 entirely**

```markdown
### 8.3 Image size resolution

- On parse, an embed with `|W` only has no height, and a bare embed has neither. An unspecified dimension is stored as 0 in the node's `ImageRef` and stays 0: the note text is never changed by the map learning an image's size.
- Core draws and measures an image at `imageDisplaySize(imageRef, asset)`: stored dimensions win; a missing width is the asset's natural width capped at `DEFAULT_IMAGE_DISPLAY_WIDTH` (300); a missing height keeps the natural aspect ratio. While the natural size is unknown the image is not drawn and adds nothing to the node's size.
- The view resolves each image's natural size once per session (`Image` load from the resource URL, cached by target) and calls `editor.setAssetNaturalSize(target, w, h)`, which updates the asset entry, remeasures the nodes that draw it, and is not undoable. Undo never forgets a known natural size. The cache is fed back into every later `setViewData`, so external updates draw immediately.
- Image resize (handle or keys) starts from the display size and stores explicit dimensions, so the embed becomes `|WxH` on the next save. Resize is a no-op while the display size is unknown.
```

- [ ] **Step 5: Replace section 7.1's "Save wiring" bullet**

Replace "- Save wiring: subscribe to the Editor; on every notification, if `getViewData() !== this.data` call `this.requestSave()`. ..." with:

```markdown
- Save wiring: subscribe to the Editor; on every notification compute the note text and call `this.requestSave()` when it differs from `this.data` (the text last loaded from or saved to disk) and also from the canonical form of the text last loaded. The second comparison stops a note whose only difference is formatting (5.5) from being rewritten by a selection or camera change right after opening; it lapses on the first `getViewData()` call, so once the note has been written canonically only the disk comparison matters (an undo back to the original state is then saved). Keeping `dirty` in step with real document changes is what makes the base three-way merge protect in-progress edits. `Cmd+S` (`editor.onSave`) calls `this.save()`.
```

- [ ] **Step 6: Add one line to section 10 (Testing), Obsidian bullet**

Append to the "Obsidian, vitest with the existing mocks" bullet: `The obsidian package ships types only; vitest resolves `obsidian` to a small runtime stand-in (`packages/obsidian/src/__tests__/mocks/obsidian-module.ts`) so modules that import it can be tested.`

- [ ] **Step 7: Commit**

```bash
git add docs/specs/2026-08-15-markdown-backed-mind-maps-design.md
git commit -F - <<'MSG'
Spec: leaf choices per note, importAsset, and unresolved image sizes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 2: Core: draw unresolved images at their natural size

An outline note may embed `![[pic.png]]` (no size) or `![[pic.png|300]]` (no height). Plan 1 stores the missing dimension as 0. This task makes the Editor draw and measure such images from the asset's natural size once the host reports it, without changing the stored `ImageRef` (so the note text stays untouched), and makes resize start from that display size.

**Files:**
- Create: `packages/core/src/editor/imageSize.ts`
- Modify: `packages/core/src/editor/Editor.ts` (image branch of `resizeNode`, `startImageResize`, `remeasureNode`, `restoreState`, new `getImageDisplaySize` and `setAssetNaturalSize`)
- Modify: `packages/core/src/editor/resize.ts` (`initImageResize` signature)
- Modify: `packages/core/src/index.ts` (exports)
- Test: `packages/core/src/__tests__/image-size.test.ts` (new)
- Test: `packages/core/src/__tests__/capabilities.test.ts` (one existing test keeps passing; add nothing there)

**Interfaces:**
- Produces: `imageDisplaySize(image: ImageRef, asset: Asset | undefined): ImageSize | null`, `DEFAULT_IMAGE_DISPLAY_WIDTH = 300`, `interface ImageSize { width: number; height: number }`, `Editor.getImageDisplaySize(nodeId): ImageSize | null`, `Editor.setAssetNaturalSize(assetId, width, height): void`. Tasks 3, 4, 7, 10 consume these.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/__tests__/image-size.test.ts`:

```ts
// ABOUTME: Tests for drawing images whose stored size is unknown from the asset's natural size.
// ABOUTME: Covers imageDisplaySize, Editor.setAssetNaturalSize, measurement, resize, and undo.

import { describe, it, expect } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { imageDisplaySize, DEFAULT_IMAGE_DISPLAY_WIDTH } from "../editor/imageSize";
import { OUTLINE_CAPABILITIES } from "../editor/capabilities";
import type { Asset } from "../model/types";

const natural: Asset = { id: "pic.png", filename: "pic.png", mimeType: "image/png", width: 800, height: 600 };
const unknown: Asset = { id: "pic.png", filename: "pic.png", mimeType: "image/png", width: 0, height: 0 };

describe("imageDisplaySize", () => {
  it("uses stored dimensions when both are known", () => {
    expect(imageDisplaySize({ assetId: "pic.png", width: 120, height: 50 }, natural)).toEqual({ width: 120, height: 50 });
  });

  it("derives a missing height from the natural aspect ratio", () => {
    expect(imageDisplaySize({ assetId: "pic.png", width: 400, height: 0 }, natural)).toEqual({ width: 400, height: 300 });
  });

  it("caps a missing width at DEFAULT_IMAGE_DISPLAY_WIDTH and keeps the aspect ratio", () => {
    expect(imageDisplaySize({ assetId: "pic.png", width: 0, height: 0 }, natural))
      .toEqual({ width: DEFAULT_IMAGE_DISPLAY_WIDTH, height: 225 });
    expect(imageDisplaySize({ assetId: "pic.png", width: 0, height: 0 }, { ...natural, width: 200, height: 100 }))
      .toEqual({ width: 200, height: 100 });
  });

  it("is null while a dimension is missing and the natural size is unknown", () => {
    expect(imageDisplaySize({ assetId: "pic.png", width: 0, height: 0 }, unknown)).toBeNull();
    expect(imageDisplaySize({ assetId: "pic.png", width: 300, height: 0 }, undefined)).toBeNull();
  });
});

describe("Editor.setAssetNaturalSize", () => {
  function editorWithBareImage(): TestEditor {
    const editor = new TestEditor();
    editor.setCapabilities(OUTLINE_CAPABILITIES);
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();
    editor.setNodeImage("n0", unknown, 0, 0);
    return editor;
  }

  it("draws nothing and measures text only until the natural size is known", () => {
    const editor = editorWithBareImage();
    expect(editor.getImageDisplaySize("n0")).toBeNull();
    const heightBefore = editor.getNode("n0").height;
    editor.setAssetNaturalSize("pic.png", 800, 600);
    expect(editor.getImageDisplaySize("n0")).toEqual({ width: 300, height: 225 });
    expect(editor.getNode("n0").height).toBe(heightBefore + 225 + 10);
    expect(editor.getNode("n0").width).toBe(300 + 20);
  });

  it("does not touch the stored image reference and is not undoable", () => {
    const editor = editorWithBareImage();
    const undoBefore = editor.canUndo();
    editor.setAssetNaturalSize("pic.png", 800, 600);
    expect(editor.getNode("n0").image).toEqual({ assetId: "pic.png", width: 0, height: 0 });
    expect(editor.canUndo()).toBe(undoBefore);
    expect(editor.getAssets().find((a) => a.id === "pic.png")).toMatchObject({ width: 800, height: 600 });
  });

  it("ignores unknown assets and non-positive sizes", () => {
    const editor = editorWithBareImage();
    const versionBefore = editor.getVersion();
    editor.setAssetNaturalSize("missing.png", 10, 10);
    editor.setAssetNaturalSize("pic.png", 0, 600);
    expect(editor.getVersion()).toBe(versionBefore);
    expect(editor.getImageDisplaySize("n0")).toBeNull();
  });

  it("resize starts from the display size and stores explicit dimensions", () => {
    const editor = editorWithBareImage();
    editor.setAssetNaturalSize("pic.png", 800, 600);
    editor.resizeNode("n0", 20);
    expect(editor.getNode("n0").image).toEqual({ assetId: "pic.png", width: 320, height: 240 });
    editor.startImageResize("n0");
    expect(editor.isResizingImage()).toBe(true);
    editor.updateImageResize(400);
    editor.endImageResize();
    expect(editor.getNode("n0").image).toEqual({ assetId: "pic.png", width: 400, height: 300 });
  });

  it("undo does not forget a natural size learned after the snapshot", () => {
    const editor = editorWithBareImage();
    editor.setText("n0", "renamed");          // snapshot taken while the asset size is unknown
    editor.setAssetNaturalSize("pic.png", 800, 600);
    editor.undo();
    expect(editor.getNode("n0").text).toBe("root");
    expect(editor.getImageDisplaySize("n0")).toEqual({ width: 300, height: 225 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `just test-file image-size`
Expected: FAIL (cannot find `../editor/imageSize`).

- [ ] **Step 3: Create `packages/core/src/editor/imageSize.ts`**

```ts
// ABOUTME: Resolves the size an image is drawn at from its stored size and its asset's natural size.
// ABOUTME: A stored dimension of 0 means "not specified"; the natural size fills it in once known.

import type { Asset, ImageRef } from "../model/types";

/** Widest an image is drawn when the document does not specify a width. */
export const DEFAULT_IMAGE_DISPLAY_WIDTH = 300;

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * The size to draw an image at, or null while it cannot be determined.
 * Stored dimensions win. A missing width falls back to the natural width capped at
 * DEFAULT_IMAGE_DISPLAY_WIDTH; a missing height keeps the natural aspect ratio.
 */
export function imageDisplaySize(image: ImageRef, asset: Asset | undefined): ImageSize | null {
  const natural = asset && asset.width > 0 && asset.height > 0 ? asset : null;
  const width = image.width > 0
    ? image.width
    : natural ? Math.min(natural.width, DEFAULT_IMAGE_DISPLAY_WIDTH) : 0;
  const height = image.height > 0
    ? image.height
    : natural ? Math.round((width * natural.height) / natural.width) : 0;
  return width > 0 && height > 0 ? { width, height } : null;
}
```

- [ ] **Step 4: Change `initImageResize` in `packages/core/src/editor/resize.ts`**

Replace the function (keep its doc comment style):

```ts
/** Initialize image resize from a node and the size it is drawn at. Returns null when the node has
 *  no image or its display size is not known yet. */
export function initImageResize(node: MindMapNode, size: ImageSize | null): ImageResizeState | null {
  if (!node.image || !size) return null;
  return {
    active: true,
    nodeId: node.id,
    aspectRatio: size.height / size.width,
    changed: false,
  };
}
```

Add `import type { ImageSize } from "./imageSize";` at the top.

- [ ] **Step 5: Edit `packages/core/src/editor/Editor.ts`**

Add the import next to the other `./` imports:

```ts
import { imageDisplaySize } from "./imageSize";
import type { ImageSize } from "./imageSize";
```

In the `// --- Image/asset management ---` section, after `getAssets()`, add:

```ts
  /** Size the node's image is drawn at, or null when it has no image or the size is not known yet. */
  getImageDisplaySize(nodeId: string): ImageSize | null {
    const image = this.store.getNode(nodeId).image;
    if (!image) return null;
    return imageDisplaySize(image, this.store.getAssets().find((a) => a.id === image.assetId));
  }

  /**
   * Record an asset's natural size once the host has loaded the image. Nodes drawing the asset
   * without a stored size are remeasured. Not undoable: the size is a fact about the file, not an edit.
   */
  setAssetNaturalSize(assetId: string, width: number, height: number): void {
    const asset = this.store.getAssets().find((a) => a.id === assetId);
    if (!asset || width <= 0 || height <= 0) return;
    if (asset.width === width && asset.height === height) return;
    asset.width = width;
    asset.height = height;
    for (const node of this.store.getAllNodes()) {
      if (node.image?.assetId !== assetId) continue;
      this.remeasureNode(node.id);
      relayoutFromNode(this.store, node.id);
    }
    this.notify();
  }
```

In `resizeNode`, replace the image branch's first lines so the aspect ratio and starting width come from the display size:

```ts
    if (node.image) {
      const size = this.getImageDisplaySize(nodeId);
      if (!size) return;
      const aspectRatio = size.width / size.height;
      const newImgWidth = Math.max(MIN_IMAGE_WIDTH, size.width + delta);
      if (newImgWidth === size.width) return;
      if (this.lastUndoLabel !== squashLabel) {
        this.pushUndo(squashLabel);
      }
      const newImgHeight = Math.round(newImgWidth / aspectRatio);
      node.image = { ...node.image, width: newImgWidth, height: newImgHeight };
      this.remeasureNode(nodeId);
      relayoutFromNode(this.store, nodeId);
      this.notify();
    } else {
```

In `startImageResize`, replace the first line:

```ts
    const state = initImageResize(this.store.getNode(nodeId), this.getImageDisplaySize(nodeId));
```

In `remeasureNode`, replace the `// Include image dimensions in node size` block:

```ts
    // Include image dimensions in node size
    const imageSize = this.getImageDisplaySize(nodeId);
    if (imageSize) {
      const minImageWidth = imageSize.width + 2 * IMAGE_PADDING_X;
      if (node.width < minImageWidth) {
        node.width = minImageWidth;
      }
      node.height += imageSize.height + IMAGE_PADDING_X;
    }
```

Replace `restoreState` so it keeps natural sizes learned after the snapshot was taken (`known` must be read from the store being replaced, hence its position):

```ts
  private restoreState(entry: HistoryEntry): void {
    // A natural size is a fact about the file: a snapshot taken before it was known must not
    // forget it.
    const known = new Map(this.store.getAssets().map((a) => [a.id, a]));
    const newStore = new MindMapStore();
    for (const node of entry.nodes.values()) {
      newStore.loadNode({ ...node, children: [...node.children] });
    }
    for (const rootId of entry.rootIds) {
      newStore.addRootId(rootId);
    }
    this.store = newStore;
    this.store.setAssets(entry.assets.map((a) => {
      const current = known.get(a.id);
      const unresolved = a.width <= 0 || a.height <= 0;
      return unresolved && current && current.width > 0 && current.height > 0
        ? { ...a, width: current.width, height: current.height }
        : { ...a };
    }));

    // Fix selection if selected node no longer exists
    if (this.selectedId !== null && !entry.nodes.has(this.selectedId)) {
      this.selectedId = null;
      this.editing = false;
    }
  }
```

- [ ] **Step 6: Export from `packages/core/src/index.ts`**

After the capabilities exports add:

```ts
export { imageDisplaySize, DEFAULT_IMAGE_DISPLAY_WIDTH } from "./editor/imageSize";
export type { ImageSize } from "./editor/imageSize";
```

- [ ] **Step 7: Run the tests**

Run: `just test-file image-size` then `just test`
Expected: all PASS, including the existing `capabilities.test.ts` case "an image whose size is unresolved is not resized by keyboard or by handle" (its asset has natural size 0, so the display size is still null) and `image.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/editor/imageSize.ts packages/core/src/editor/Editor.ts packages/core/src/editor/resize.ts packages/core/src/index.ts packages/core/src/__tests__/image-size.test.ts
git commit -F - <<'MSG'
Draw images with an unknown stored size at the asset's natural size

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 3: Web: render images with the display size

`NodeView` draws `node.image.width/height` directly, which is 0 for outline images until resized. Draw with `editor.getImageDisplaySize(node.id)` instead. No test can run React here (node environment); the change is mechanical and covered by the existing Playwright visual suite for `.limn` maps.

**Files:**
- Modify: `packages/web/src/components/NodeView.tsx`
- Modify: `packages/web/src/components/MindMapCanvas.tsx` (the `<NodeView ...>` element)

**Interfaces:**
- Consumes: `Editor.getImageDisplaySize`, `ImageSize` (Task 2).

- [ ] **Step 1: `NodeView.tsx`**

Add `imageSize?: ImageSize;` to `NodeViewProps` (import `type { ImageSize } from "@limn/core"`), destructure it in the component, and change:

```tsx
  const hasImage = node.image && imageUrl && imageSize;
```

and, in the image group, use `imageSize.width` / `imageSize.height` for the `<image>` `width`/`height` and for the resize dot's `cx`/`cy` (guard the JSX with `{hasImage && node.image && imageSize && (` so TypeScript narrows).

- [ ] **Step 2: `MindMapCanvas.tsx`**

Add the prop where `NodeView` is rendered:

```tsx
                  imageSize={editor.getImageDisplaySize(node.id) ?? undefined}
```

- [ ] **Step 3: Verify**

Run: `just check`
Expected: green (typecheck is the real gate here).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/NodeView.tsx packages/web/src/components/MindMapCanvas.tsx
git commit -F - <<'MSG'
Web: draw node images at the Editor's display size

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 4: Shared image attach helper and `importAsset`

Web paste (`App.tsx`) and canvas drop (`MindMapCanvas.tsx`) each contain a copy of "load image, make asset, set node image, save asset, announce URL". Extract one helper that both use, and let a provider choose the asset id (`importAsset`) so the Obsidian outline provider can return the vault link text.

**Files:**
- Modify: `packages/core/src/persistence/types.ts` (optional `importAsset`)
- Create: `packages/web/src/assets/attachImage.ts`
- Modify: `packages/web/src/App.tsx` (paste handler)
- Modify: `packages/web/src/components/MindMapCanvas.tsx` (image branch of `handleDrop`)
- Test: `packages/web/src/__tests__/attach-image.test.ts` (new)

**Interfaces:**
- Produces: `attachImageFile(editor, provider, file, filename, target)`, `fitDisplaySize(w, h)`, `pastedImageName(mimeType, now)`, `imageFileFromTransfer(data)`, `loadImageSize(blob)`; `PersistenceProvider.importAsset?(filename, blob): Promise<string>`. Tasks 6 and 8 consume these.

- [ ] **Step 1: Add `importAsset` to `packages/core/src/persistence/types.ts`**

After `saveAsset`:

```ts
  /**
   * Store a new binary asset under an id the host derives from the suggested filename (for
   * example a vault attachment's link text) and return that id. Hosts that generate opaque ids
   * leave this undefined and receive saveAsset(assetId, blob) instead.
   */
  importAsset?(filename: string, blob: Blob): Promise<string>;
```

- [ ] **Step 2: Write the failing test `packages/web/src/__tests__/attach-image.test.ts`**

```ts
// ABOUTME: Tests for the shared image attach helper used by paste and drop.
// ABOUTME: Stubs Image, object URLs, and window so the helper runs in the node test environment.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Editor, stubTextMeasurer } from "@limn/core";
import type { PersistenceProvider } from "@limn/core";

const g = globalThis as Record<string, unknown>;
if (typeof g.window === "undefined") g.window = globalThis;
const win = g.window as Record<string, unknown>;
if (typeof win.dispatchEvent !== "function") win.dispatchEvent = vi.fn();
if (!globalThis.URL.createObjectURL) {
  let counter = 0;
  globalThis.URL.createObjectURL = () => `blob:mock-${++counter}`;
  globalThis.URL.revokeObjectURL = () => {};
}
class FakeImage {
  naturalWidth = 800;
  naturalHeight = 600;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) {
    queueMicrotask(() => this.onload?.());
  }
}
g.Image = FakeImage;

const { attachImageFile, fitDisplaySize, pastedImageName } = await import("../assets/attachImage");

function fakeProvider(overrides: Partial<PersistenceProvider> = {}): PersistenceProvider {
  return {
    load: () => Promise.resolve(null),
    save: () => Promise.resolve(),
    saveAsset: vi.fn(() => Promise.resolve()),
    loadAsset: () => Promise.resolve(undefined),
    loadAssetUrls: () => Promise.resolve(new Map()),
    onExternalChange: () => () => {},
    dispose: () => {},
    ...overrides,
  };
}

describe("fitDisplaySize", () => {
  it("shrinks wide images to 300 wide keeping the aspect ratio", () => {
    expect(fitDisplaySize(800, 600)).toEqual({ width: 300, height: 225 });
  });
  it("leaves small images alone", () => {
    expect(fitDisplaySize(120, 80)).toEqual({ width: 120, height: 80 });
  });
});

describe("pastedImageName", () => {
  it("uses Obsidian's timestamp style and maps jpeg to jpg", () => {
    const at = new Date(2026, 7, 16, 9, 5, 7);
    expect(pastedImageName("image/png", at)).toBe("Pasted image 20260816090507.png");
    expect(pastedImageName("image/jpeg", at)).toBe("Pasted image 20260816090507.jpg");
  });
});

describe("attachImageFile", () => {
  let editor: Editor;
  const blob = new Blob(["x"], { type: "image/png" });

  beforeEach(() => {
    editor = new Editor(stubTextMeasurer);
    (window.dispatchEvent as ReturnType<typeof vi.fn>).mockClear();
  });

  it("asks the provider for the id when it can import, and attaches at the fitted size", async () => {
    const importAsset = vi.fn(() => Promise.resolve("Pasted image 1.png"));
    const provider = fakeProvider({ importAsset });
    const rootId = editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    await attachImageFile(editor, provider, blob, "Pasted image 1.png", { nodeId: rootId });

    expect(importAsset).toHaveBeenCalledWith("Pasted image 1.png", blob);
    expect(provider.saveAsset).not.toHaveBeenCalled();
    expect(editor.getNode(rootId).image).toEqual({ assetId: "Pasted image 1.png", width: 300, height: 225 });
    expect(editor.getAssets()[0]).toMatchObject({ id: "Pasted image 1.png", width: 800, height: 600, mimeType: "image/png" });
    expect(window.dispatchEvent).toHaveBeenCalledOnce();
  });

  it("falls back to a generated id and saveAsset, and creates a root when there is no target node", async () => {
    const provider = fakeProvider();
    await attachImageFile(editor, provider, blob, "photo.png", { x: 40, y: 50 });

    const roots = editor.getRoots();
    expect(roots).toHaveLength(1);
    const root = roots[0]!;
    expect(root.image?.assetId).toMatch(/^a\d+$/);
    expect(provider.saveAsset).toHaveBeenCalledWith(root.image?.assetId, blob);
    expect(editor.isEditing()).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun run test -- --run packages/web/src/__tests__/attach-image.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Create `packages/web/src/assets/attachImage.ts`**

```ts
// ABOUTME: Attaches an image file to a node (or a new root) and stores it through the persistence provider.
// ABOUTME: Shared by web paste, canvas drop, and the Obsidian views so naming, sizing, and ids agree.

import type { Editor, PersistenceProvider } from "@limn/core";
import { DEFAULT_IMAGE_DISPLAY_WIDTH } from "@limn/core";
import type { AssetAddedDetail } from "../limn-window";

export interface ImageSize {
  width: number;
  height: number;
}

/** Where a new image goes: onto an existing node, or a new root at a canvas position. */
export type ImageTarget = { nodeId: string } | { x: number; y: number };

/** Display size for a freshly added image: natural size, shrunk to fit DEFAULT_IMAGE_DISPLAY_WIDTH. */
export function fitDisplaySize(naturalWidth: number, naturalHeight: number): ImageSize {
  const scale = Math.min(1, DEFAULT_IMAGE_DISPLAY_WIDTH / naturalWidth);
  return { width: Math.round(naturalWidth * scale), height: Math.round(naturalHeight * scale) };
}

/** File name for a pasted image, in the style Obsidian uses: "Pasted image 20260816090507.png". */
export function pastedImageName(mimeType: string, now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const subtype = mimeType.split("/")[1] ?? "png";
  const ext = subtype === "jpeg" ? "jpg" : subtype;
  return `Pasted image ${stamp}.${ext}`;
}

/** The first image file on a clipboard payload, or null. */
export function imageFileFromTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of data.items) {
    if (item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}

/** Natural size of an image blob, decoded through an Image element. */
export function loadImageSize(blob: Blob): Promise<ImageSize> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

/**
 * Store an image and attach it to the target. The provider chooses the asset id when it can
 * (importAsset); otherwise a timestamp id is used and the blob goes through saveAsset. Announces the
 * display URL with a `limn:asset-added` event once the node is updated.
 */
export async function attachImageFile(
  editor: Editor,
  provider: PersistenceProvider,
  file: Blob,
  filename: string,
  target: ImageTarget,
): Promise<void> {
  const natural = await loadImageSize(file);
  let assetId: string;
  if (provider.importAsset) {
    assetId = await provider.importAsset(filename, file);
  } else {
    assetId = `a${Date.now()}`;
    await provider.saveAsset(assetId, file);
  }
  const asset = { id: assetId, filename, mimeType: file.type, width: natural.width, height: natural.height };
  const display = fitDisplaySize(natural.width, natural.height);
  if ("nodeId" in target) {
    editor.setNodeImage(target.nodeId, asset, display.width, display.height);
  } else {
    // setNodeImage before exitEditMode so the image keeps the empty node from being deleted
    const rootId = editor.addRoot("", target.x, target.y);
    editor.setNodeImage(rootId, asset, display.width, display.height);
    editor.exitEditMode();
  }
  const detail: AssetAddedDetail = { assetId, blobUrl: URL.createObjectURL(file) };
  window.dispatchEvent(new CustomEvent("limn:asset-added", { detail }));
}
```

- [ ] **Step 5: Use it in `packages/web/src/App.tsx`**

Replace the whole `// Handle paste from clipboard` effect with:

```tsx
  // Handle paste from clipboard
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const file = imageFileFromTransfer(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      const selectedId = editor.getSelectedId();
      void attachImageFile(
        editor, provider, file, pastedImageName(file.type, new Date()),
        selectedId ? { nodeId: selectedId } : { x: 0, y: 0 },
      );
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [editor, provider]);
```

Import `attachImageFile, imageFileFromTransfer, pastedImageName` from `./assets/attachImage`. The `limn:asset-added` listener already in `App.tsx` picks up the URL, so the `setAssetUrls` call inside the old handler goes away with it. Remove any import that becomes unused.

- [ ] **Step 6: Use it in `packages/web/src/components/MindMapCanvas.tsx`**

In `handleDrop`, replace everything from `// Read image dimensions and create blob URL` to the end of the image branch with:

```ts
      void attachImageFile(
        editor, provider, imageFile, imageFile.name,
        targetNodeId ? { nodeId: targetNodeId } : { x: world.x, y: world.y },
      );
```

Add `provider` to the `useCallback` dependency list (`[editor, provider, screenToWorld]`) and import `attachImageFile` from `../assets/attachImage`.

- [ ] **Step 7: Run tests and check**

Run: `bun run test -- --run packages/web/src/__tests__/attach-image.test.ts` then `just check`
Expected: PASS; check green.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/persistence/types.ts packages/web/src/assets/attachImage.ts packages/web/src/App.tsx packages/web/src/components/MindMapCanvas.tsx packages/web/src/__tests__/attach-image.test.ts
git commit -F - <<'MSG'
Share one image attach helper between paste and drop; providers may choose asset ids

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 5: Obsidian: share the React root and theme code between views

Pure refactor: move `LimnViewRoot` and the React mount out of `LimnView.ts` into `LimnViewRoot.ts`, and `applyThemeToContainer` into `viewTheme.ts`, so the Markdown view (Task 10) can reuse them. No behavior change; `just check` and the Obsidian build are the tests.

**Files:**
- Create: `packages/obsidian/src/LimnViewRoot.ts`
- Create: `packages/obsidian/src/viewTheme.ts`
- Modify: `packages/obsidian/src/LimnView.ts`

**Interfaces:**
- Produces: `mountLimnRoot(contentEl: HTMLElement, editor: Editor, provider: PersistenceProvider): Root`, `applyThemeToContainer(el: HTMLElement, editor: Editor): void`.

- [ ] **Step 1: Create `packages/obsidian/src/viewTheme.ts`**

Move the body of `LimnView.applyThemeToContainer` verbatim into a function that takes the element and editor:

```ts
// ABOUTME: Applies the Editor's theme to an Obsidian view container as inline CSS variables.
// ABOUTME: In system mode the inline overrides are removed so Obsidian's own stylesheet takes over.

import type { Editor } from "@limn/core";
import { resolveTheme, deriveThemeVars, THEME_CSS_VARS } from "@limn/core";
import { resolveActiveThemeKey } from "@limn/web/theme/themes";

/**
 * Apply or clear inline theme CSS on a view container.
 * In "system" mode, remove inline properties so Obsidian's stylesheet takes over.
 * In "light" or "dark" mode, resolve the theme and set CSS vars as inline styles.
 */
export function applyThemeToContainer(el: HTMLElement, editor: Editor): void {
  const mode = editor.getTheme();
  if (mode === "system") {
    for (const name of THEME_CSS_VARS) {
      el.style.removeProperty(name);
    }
    el.style.removeProperty("color");
    return;
  }
  const themeKey = resolveActiveThemeKey(mode, editor.getLightTheme(), editor.getDarkTheme());
  const effective: "light" | "dark" = themeKey.includes("light") || themeKey.includes("latte") ? "light" : "dark";
  const theme = resolveTheme(themeKey, effective);
  const vars = deriveThemeVars(theme);
  for (const key of THEME_CSS_VARS) {
    el.style.setProperty(key, vars[key]);
  }
  // Set color directly so buttons (which use `inherit`) get the right color.
  // This bypasses Obsidian's --text-color variable that shadows ours.
  el.style.color = vars["--text-color"];
}
```

(`resolveActiveThemeKey` expects `ThemeKey` arguments; keep whatever casts `LimnView.ts` uses today so the call type-checks unchanged.)

- [ ] **Step 2: Create `packages/obsidian/src/LimnViewRoot.ts`**

Move the `LimnViewRoot` component (unchanged) and add the mount function that `LimnView.mountReact` used to inline:

```ts
// ABOUTME: React tree shared by the .limn and Markdown mind map views inside Obsidian.
// ABOUTME: Wires keyboard handling, asset URLs, and the overlay menus around MindMapCanvas.

// ...the imports LimnViewRoot needs, moved from LimnView.ts...
import { createRoot, type Root } from "react-dom/client";
import type { Editor, PersistenceProvider } from "@limn/core";
import { EditorContext } from "@limn/web/hooks/useEditor";
import { PersistenceContext } from "@limn/web/hooks/usePersistence";

/** Wrapper component that sets up keyboard handling inside the Obsidian view. */
export function LimnViewRoot({ editor, containerEl }: { editor: Editor; containerEl: HTMLElement }) {
  // ...unchanged body...
}

/** Mount the shared tree into a sub-div of the view container. The measurement element (a sibling
 *  in contentEl) stays outside React's managed subtree. Returns the root for unmounting. */
export function mountLimnRoot(contentEl: HTMLElement, editor: Editor, provider: PersistenceProvider): Root {
  const container = contentEl.createDiv({ cls: "limn-react-root" });
  const root = createRoot(container);
  root.render(
    createElement(PersistenceContext.Provider, { value: provider },
      createElement(EditorContext.Provider, { value: editor },
        createElement(LimnViewRoot, { editor, containerEl: contentEl }),
      ),
    ),
  );
  return root;
}
```

- [ ] **Step 3: Slim `packages/obsidian/src/LimnView.ts`**

- Delete the moved component and its now-unused imports.
- `private applyThemeToContainer()` becomes a one-liner: `applyThemeToContainer(this.contentEl, this.editor);` (or call the shared function directly at the two call sites and delete the method).
- `mountReact()` becomes `this.reactRoot = mountLimnRoot(this.contentEl, this.editor, this.provider);`.
- Update the ABOUTME lines if they no longer describe the file.

- [ ] **Step 4: Verify**

Run: `just check`
Expected: green; `packages/obsidian/dist/main.js` builds.

- [ ] **Step 5: Commit**

```bash
git add packages/obsidian/src/LimnViewRoot.ts packages/obsidian/src/viewTheme.ts packages/obsidian/src/LimnView.ts
git commit -F - <<'MSG'
Obsidian: move the shared React root and theme application out of LimnView

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 6: Obsidian: image paste in the shared view root

The Obsidian views support image drop (through `MindMapCanvas`) but not paste; the web app handles paste in `App.tsx`. Add a paste listener to `LimnViewRoot` that uses the Task 4 helper. Listen on the container's document (not the global `window`) so popout windows work, and only act when this view's leaf is active.

**Files:**
- Modify: `packages/obsidian/src/LimnViewRoot.ts`

**Interfaces:**
- Consumes: `attachImageFile`, `imageFileFromTransfer`, `pastedImageName` from `@limn/web/assets/attachImage`.

- [ ] **Step 1: Add the effect to `LimnViewRoot`, after `useKeyboardHandler(editor, isActive);`**

```ts
  // Image paste: attach to the selected node, or create a root. Listens on the view's own document
  // so popout windows work; isActive keeps other leaves in the same window from reacting.
  useEffect(() => {
    const doc = containerEl.ownerDocument;
    const handlePaste = (e: ClipboardEvent) => {
      if (!isActive()) return;
      const file = imageFileFromTransfer(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      const selectedId = editor.getSelectedId();
      void attachImageFile(
        editor, provider, file, pastedImageName(file.type, new Date()),
        selectedId ? { nodeId: selectedId } : { x: 0, y: 0 },
      );
    };
    doc.addEventListener("paste", handlePaste);
    return () => doc.removeEventListener("paste", handlePaste);
  }, [editor, provider, containerEl, isActive]);
```

Import the three helpers from `@limn/web/assets/attachImage`.

- [ ] **Step 2: Verify**

Run: `just check` (lint must stay clean under `obsidianmd/prefer-active-doc`: `ownerDocument` is not the global `document`).
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add packages/obsidian/src/LimnViewRoot.ts
git commit -F - <<'MSG'
Obsidian: paste images into the mind map view

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 7: Obsidian: `OutlineDocument`, the note-to-Editor bridge

The heart of the feature, kept free of Obsidian and DOM imports so it is unit-tested with `Editor` + `stubTextMeasurer`. It parses note text into the Editor, regenerates note text from the Editor (prose regions verbatim, list regions from the roots that belong to them), tells the host when a save is needed, and carries image natural sizes across reloads.

**Files:**
- Create: `packages/obsidian/src/markdown/OutlineDocument.ts`
- Test: `packages/obsidian/src/__tests__/outline-document.test.ts` (new)

**Interfaces:**
- Consumes (core, plan 1 and Task 2): `parseOutline`, `writeOutline`, `outlineToFileNodes`, `fileNodesToOutline`, `generateNodeId`, `CURRENT_FORMAT_VERSION`, `Editor.loadJSON`, `Editor.applyExternalUpdate(data, { reconcileIds: true })`, `Editor.remeasureAllNodes`, `Editor.relayoutAll`, `Editor.subscribe`, `Editor.toJSON`, `Editor.getRoots`, `Editor.getCamera`, `Editor.getAssets`, `Editor.setAssetNaturalSize`.
- Produces: `class OutlineDocument { constructor(editor, theme: () => OutlineTheme); load(text, clear); text(); viewData(); clear(); attach(host: SaveHost): () => void; hasNaturalSize(id); setImageNaturalSize(id, w, h) }`, `interface SaveHost { readonly data: string; requestSave(): void }`, `interface OutlineTheme { mode; lightTheme; darkTheme }`, `mimeTypeForName(name)`. Tasks 8 and 10 consume these.

**Save rule (the subtle part, spelled out):** the host is asked to save when the map's text differs from BOTH the text on disk (`host.data`, which `TextFileView` keeps equal to the last loaded or saved text) AND the canonical text of the last load (`baseline`). The second condition keeps a non-canonical note (spec 5.5 normalizations pending) from being rewritten by a mere selection or pan after opening; the first keeps undo-back-to-original saved once the note has been written canonically. `viewData()` (called by the view's `getViewData`, which `TextFileView` calls when it saves) sets `baseline` to the returned text, so after the first real save only the disk comparison matters.

- [ ] **Step 1: Write the failing tests `packages/obsidian/src/__tests__/outline-document.test.ts`**

```ts
// ABOUTME: Tests for OutlineDocument: note text into the Editor, Editor back to note text, save signal.
// ABOUTME: Runs on Editor + stubTextMeasurer; no Obsidian or DOM involved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Editor, stubTextMeasurer, OUTLINE_CAPABILITIES, parseOutline, writeOutline, resetIdCounter } from "@limn/core";
import { OutlineDocument, mimeTypeForName } from "../markdown/OutlineDocument";
import type { SaveHost } from "../markdown/OutlineDocument";

const THEME = { mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" };

const NOTE = [
  "---",
  "limn-plugin: true",
  "---",
  "# Weekly plan",
  "",
  "Some prose before the list.",
  "",
  "- Monday",
  "  - Standup",
  "* Tuesday",
  "  - Hidden",
  "",
  "A paragraph between two lists.",
  "",
  "- Friday",
  "  - Retro",
  "",
].join("\n");

function makeDoc(): { editor: Editor; doc: OutlineDocument } {
  const editor = new Editor(stubTextMeasurer);
  editor.setCapabilities(OUTLINE_CAPABILITIES);
  return { editor, doc: new OutlineDocument(editor, () => THEME) };
}

function fakeHost(data: string): SaveHost & { requestSave: ReturnType<typeof vi.fn> } {
  return { data, requestSave: vi.fn() };
}

const rootTexts = (editor: Editor) => editor.getRoots().map((r) => r.text);

describe("OutlineDocument.load", () => {
  beforeEach(() => resetIdCounter());

  it("loads every top-level item as a root, in document order, with collapse and children", () => {
    const { editor, doc } = makeDoc();
    doc.load(NOTE, true);
    expect(rootTexts(editor)).toEqual(["Monday", "Tuesday", "Friday"]);
    const tuesday = editor.getRoots()[1]!;
    expect(tuesday.collapsed).toBe(true);
    expect(editor.getChildren(tuesday.id).map((c) => c.text)).toEqual(["Hidden"]);
    expect(editor.getRoots().every((r) => r.x === 0)).toBe(true);
    expect(editor.getTheme()).toBe("system");
  });

  it("writes an untouched note back as its canonical form, prose intact", () => {
    const { doc } = makeDoc();
    doc.load(NOTE, true);
    expect(doc.text()).toBe(writeOutline(parseOutline(NOTE)));
    expect(doc.text()).toContain("A paragraph between two lists.");
  });

  it("is byte-identical for an already canonical note", () => {
    const canonical = writeOutline(parseOutline(NOTE));
    const { doc } = makeDoc();
    doc.load(canonical, true);
    expect(doc.text()).toBe(canonical);
  });

  it("keeps CRLF notes CRLF", () => {
    const { doc } = makeDoc();
    doc.load("- a\r\n  - b\r\n", true);
    expect(doc.text()).toBe("- a\r\n  - b\r\n");
  });
});

describe("OutlineDocument.text after edits", () => {
  beforeEach(() => resetIdCounter());

  it("puts a new child in its root's region and a new root in the last list region", () => {
    const { editor, doc } = makeDoc();
    doc.load(NOTE, true);
    const monday = editor.getRoots()[0]!;
    editor.addChild(monday.id, "Review");
    editor.exitEditMode();
    editor.addRoot("Saturday");
    editor.exitEditMode();
    const text = doc.text();
    const lines = text.split("\n");
    expect(lines.indexOf("  - Review")).toBe(lines.indexOf("- Monday") + 2);
    expect(lines.indexOf("- Saturday")).toBe(lines.indexOf("  - Retro") + 1);
  });

  it("appends the first list after prose with a blank line, keeping trailing blank lines last", () => {
    const { editor, doc } = makeDoc();
    doc.load("Just prose.\n", true);
    editor.addRoot("First");
    editor.exitEditMode();
    expect(doc.text()).toBe("Just prose.\n\n- First\n");
  });

  it("starts an empty note and a frontmatter-only note with the list itself", () => {
    const empty = makeDoc();
    empty.doc.load("", true);
    empty.editor.addRoot("First");
    empty.editor.exitEditMode();
    expect(empty.doc.text()).toBe("- First\n");

    const marked = makeDoc();
    marked.doc.load("---\nlimn-plugin: true\n---\n", true);
    marked.editor.addRoot("First");
    marked.editor.exitEditMode();
    expect(marked.doc.text()).toBe("---\nlimn-plugin: true\n---\n- First\n");
  });

  it("writes a region whose roots were all deleted as empty and leaves the prose", () => {
    const { editor, doc } = makeDoc();
    doc.load("Intro\n\n- Only\n\nOutro\n", true);
    editor.deleteNode(editor.getRoots()[0]!.id);
    expect(doc.text()).toBe("Intro\n\n\nOutro\n");
    expect(doc.text()).not.toContain("- Only");
  });

  it("does not write empty leaf nodes that are still being edited", () => {
    const { editor, doc } = makeDoc();
    doc.load("- a\n", true);
    editor.addChild(editor.getRoots()[0]!.id, "");
    expect(doc.text()).toBe("- a\n");
  });
});

describe("OutlineDocument.attach", () => {
  beforeEach(() => resetIdCounter());

  it("does not request a save for camera or selection changes, even on a non-canonical note", () => {
    const { editor, doc } = makeDoc();
    const raw = "-   Monday\n    -   Standup\n";      // non-canonical indent
    const host = fakeHost(raw);
    doc.attach(host);
    doc.load(raw, true);
    editor.select(editor.getRoots()[0]!.id);
    editor.setCamera(10, 20, 1.5);
    editor.setTheme("dark");
    expect(host.requestSave).not.toHaveBeenCalled();
  });

  it("requests a save on a document change, and again on undo once the note was written", () => {
    const { editor, doc } = makeDoc();
    const raw = "-   Monday\n";
    const host = fakeHost(raw);
    doc.attach(host);
    doc.load(raw, true);
    editor.setText(editor.getRoots()[0]!.id, "Tuesday");
    expect(host.requestSave).toHaveBeenCalledTimes(1);
    host.data = doc.viewData();                       // TextFileView.save(): getViewData, then data = result
    expect(host.data).toBe("- Tuesday\n");
    editor.undo();
    expect(host.requestSave).toHaveBeenCalledTimes(2);
    expect(doc.text()).toBe("- Monday\n");
  });

  it("stops after detach", () => {
    const { editor, doc } = makeDoc();
    const host = fakeHost("- a\n");
    const detach = doc.attach(host);
    doc.load("- a\n", true);
    detach();
    editor.setText(editor.getRoots()[0]!.id, "b");
    expect(host.requestSave).not.toHaveBeenCalled();
  });
});

describe("OutlineDocument external updates", () => {
  beforeEach(() => resetIdCounter());

  it("keeps selection and camera when the note changes elsewhere", () => {
    const { editor, doc } = makeDoc();
    doc.load("- a\n- b\n", true);
    const b = editor.getRoots()[1]!;
    editor.select(b.id);
    editor.setCamera(5, 6, 2);
    doc.load("- a\n  - a1\n- b\n- c\n", false);
    expect(editor.getSelectedId()).toBe(b.id);
    expect(editor.getCamera()).toEqual({ x: 5, y: 6, zoom: 2 });
    expect(rootTexts(editor)).toEqual(["a", "b", "c"]);
    expect(doc.text()).toBe("- a\n  - a1\n- b\n- c\n");
  });

  it("re-maps roots to regions after an external load", () => {
    const { editor, doc } = makeDoc();
    doc.load("- a\n\nprose\n\n- b\n", true);
    doc.load("- a\n- a2\n\nprose\n\n- b\n", false);
    editor.addRoot("new");
    editor.exitEditMode();
    expect(doc.text()).toBe("- a\n- a2\n\nprose\n\n- b\n- new\n");
  });
});

describe("OutlineDocument images", () => {
  beforeEach(() => resetIdCounter());

  it("registers embed targets as assets with unknown size and guesses the mime type", () => {
    const { editor, doc } = makeDoc();
    doc.load("- ![[pic.png]]\n- Caption\\\n  ![[photo.jpg|200]]\n", true);
    expect(editor.getAssets()).toEqual([
      { id: "pic.png", filename: "pic.png", mimeType: "image/png", width: 0, height: 0 },
      { id: "photo.jpg", filename: "photo.jpg", mimeType: "image/jpeg", width: 0, height: 0 },
    ]);
    expect(editor.getImageDisplaySize(editor.getRoots()[0]!.id)).toBeNull();
  });

  it("draws the image once the natural size is known and never changes the note text for it", () => {
    const { editor, doc } = makeDoc();
    const host = fakeHost("- ![[pic.png]]\n");
    doc.attach(host);
    doc.load("- ![[pic.png]]\n", true);
    doc.setImageNaturalSize("pic.png", 800, 600);
    expect(doc.hasNaturalSize("pic.png")).toBe(true);
    expect(editor.getImageDisplaySize(editor.getRoots()[0]!.id)).toEqual({ width: 300, height: 225 });
    expect(doc.text()).toBe("- ![[pic.png]]\n");
    expect(host.requestSave).not.toHaveBeenCalled();
  });

  it("remembers natural sizes across external loads, including sizes learned from pasted assets", () => {
    const { editor, doc } = makeDoc();
    doc.load("- ![[pic.png]]\n", true);
    doc.setImageNaturalSize("pic.png", 800, 600);
    editor.setNodeImage(editor.getRoots()[0]!.id, { id: "new.png", filename: "new.png", mimeType: "image/png", width: 40, height: 20 }, 40, 20);
    doc.load("- ![[pic.png]]\n- ![[new.png]]\n", false);
    expect(editor.getImageDisplaySize(editor.getRoots()[0]!.id)).toEqual({ width: 300, height: 225 });
    expect(editor.getImageDisplaySize(editor.getRoots()[1]!.id)).toEqual({ width: 40, height: 20 });
  });

  it("mimeTypeForName", () => {
    expect(mimeTypeForName("a/b/x.JPG")).toBe("image/jpeg");
    expect(mimeTypeForName("x.webp")).toBe("image/webp");
    expect(mimeTypeForName("x.pdf")).toBe("application/octet-stream");
  });
});

describe("OutlineDocument.clear", () => {
  it("empties the map and the note text", () => {
    const { editor, doc } = makeDoc();
    doc.load(NOTE, true);
    doc.clear();
    expect(editor.getRoots()).toHaveLength(0);
    expect(doc.text()).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test -- --run packages/obsidian/src/__tests__/outline-document.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `packages/obsidian/src/markdown/OutlineDocument.ts`**

```ts
// ABOUTME: Keeps an Editor in step with a Markdown note's outline: note text in, note text out.
// ABOUTME: Pure TypeScript with no Obsidian or DOM dependencies so the sync rules are unit-testable.

import {
  parseOutline, writeOutline, outlineToFileNodes, fileNodesToOutline, generateNodeId,
  CURRENT_FORMAT_VERSION,
} from "@limn/core";
import type {
  Editor, Asset, MindMapFileFormat, MindMapFileNode, OutlineNode, OutlineRegion, ParsedOutline,
} from "@limn/core";

/** Theme the map is drawn with; the note stores none, so the host supplies it. */
export interface OutlineTheme {
  mode: string;
  lightTheme: string;
  darkTheme: string;
}

/** The part of TextFileView the document talks to. */
export interface SaveHost {
  /** Text last loaded from or saved to disk. */
  readonly data: string;
  requestSave(): void;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};

/** Mime type guessed from a file name's extension; unknown extensions are octet-stream. */
export function mimeTypeForName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

/**
 * Adds an empty list region to a note that had none. The region goes after the note's prose,
 * separated by a blank line, and before the note's trailing blank lines so those stay trailing.
 * Returns the new region's index.
 */
function appendListRegion(regions: OutlineRegion[]): number {
  const last = regions[regions.length - 1];
  if (!last || last.kind !== "prose") {
    regions.push({ kind: "list", roots: [] });
    return regions.length - 1;
  }
  let end = last.lines.length;
  while (end > 0 && (last.lines[end - 1] ?? "").trim() === "") end--;
  const content = last.lines.slice(0, end);
  const trailing = last.lines.slice(end);
  regions.pop();
  if (content.length > 0) regions.push({ kind: "prose", lines: [...content, ""] });
  regions.push({ kind: "list", roots: [] });
  const index = regions.length - 1;
  if (trailing.length > 0) regions.push({ kind: "prose", lines: trailing });
  return index;
}

export class OutlineDocument {
  private parsed: ParsedOutline = { frontmatterLines: [], regions: [] };
  /** Index into parsed.regions of the list region each root came from. */
  private regionOfRoot = new Map<string, number>();
  private naturalSizes = new Map<string, { width: number; height: number }>();
  /** Canonical text of the note as last loaded (see attach). */
  private baseline = "";
  private loading = false;
  private readonly docId = crypto.randomUUID();

  constructor(readonly editor: Editor, private readonly theme: () => OutlineTheme) {}

  /**
   * Replace the map with the note's outline. `clear` for a fresh file; otherwise the note changed
   * elsewhere and is merged into the current map, keeping ids (and so selection) where nodes match.
   */
  load(text: string, clear: boolean): void {
    if (!clear) this.rememberNaturalSizes();
    const parsed = parseOutline(text);
    const roots: MindMapFileNode[] = [];
    const regionByRootIndex: number[] = [];
    parsed.regions.forEach((region, index) => {
      if (region.kind !== "list") return;
      for (const root of outlineToFileNodes(region.roots, generateNodeId)) {
        roots.push(root);
        regionByRootIndex.push(index);
      }
    });
    const data: MindMapFileFormat = {
      version: CURRENT_FORMAT_VERSION,
      meta: { id: this.docId, ...this.theme() },
      camera: clear ? { x: 0, y: 0, zoom: 1 } : this.editor.getCamera(),
      roots,
      assets: this.assetsFor(roots),
    };
    this.loading = true;
    try {
      if (clear) this.editor.loadJSON(data);
      else this.editor.applyExternalUpdate(data, { reconcileIds: true });
      this.parsed = parsed;
      // Reconciliation renames incoming roots but keeps their order, so the Editor's roots line up
      // with regionByRootIndex one to one.
      this.regionOfRoot = new Map();
      this.editor.getRoots().forEach((root, i) => {
        const region = regionByRootIndex[i];
        if (region !== undefined) this.regionOfRoot.set(root.id, region);
      });
      this.editor.remeasureAllNodes();
      this.editor.relayoutAll();
    } finally {
      this.loading = false;
    }
    this.baseline = this.text();
  }

  /** The note text for the current map: prose regions verbatim, list regions regenerated. */
  text(): string {
    const regions = this.parsed.regions.slice();
    const listIndexes = regions.flatMap((region, i) => (region.kind === "list" ? [i] : []));
    let lastList = listIndexes[listIndexes.length - 1];
    if (lastList === undefined) {
      if (this.editor.getRoots().length === 0) return writeOutline(this.parsed);
      lastList = appendListRegion(regions);
    }
    const rootsByRegion = new Map<number, OutlineNode[]>();
    for (const root of this.editor.toJSON().roots) {
      const index = this.regionOfRoot.get(root.id) ?? lastList;
      const list = rootsByRegion.get(index) ?? [];
      list.push(...fileNodesToOutline([root]));
      rootsByRegion.set(index, list);
    }
    const out: OutlineRegion[] = regions.map((region, i) =>
      region.kind === "list" ? { kind: "list", roots: rootsByRegion.get(i) ?? [] } : region,
    );
    return writeOutline({ ...this.parsed, regions: out });
  }

  /** Text for the host to write. From here on the map counts as in step with the note. */
  viewData(): string {
    const text = this.text();
    this.baseline = text;
    return text;
  }

  /** Forget the note; the map becomes empty. */
  clear(): void {
    this.parsed = { frontmatterLines: [], regions: [] };
    this.regionOfRoot = new Map();
    this.loading = true;
    try {
      this.editor.loadJSON({
        version: CURRENT_FORMAT_VERSION,
        meta: { id: this.docId, ...this.theme() },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [],
        assets: [],
      });
    } finally {
      this.loading = false;
    }
    this.baseline = "";
  }

  /**
   * Ask the host to save whenever the map's text departs from what is on disk. Until the note has
   * been written once, its canonical form also counts as "on disk", so a note that only differs by
   * formatting is not rewritten by a selection or camera change. Returns the unsubscribe function.
   */
  attach(host: SaveHost): () => void {
    return this.editor.subscribe(() => {
      if (this.loading) return;
      const text = this.text();
      if (text !== host.data && text !== this.baseline) host.requestSave();
    });
  }

  hasNaturalSize(assetId: string): boolean {
    return this.naturalSizes.has(assetId);
  }

  /** Record an image's natural size and let the map draw it. Sizes survive later loads. */
  setImageNaturalSize(assetId: string, width: number, height: number): void {
    this.naturalSizes.set(assetId, { width, height });
    this.editor.setAssetNaturalSize(assetId, width, height);
  }

  private rememberNaturalSizes(): void {
    for (const asset of this.editor.getAssets()) {
      if (asset.width > 0 && asset.height > 0) {
        this.naturalSizes.set(asset.id, { width: asset.width, height: asset.height });
      }
    }
  }

  /** One asset per distinct embed target, with the natural size when it is already known. */
  private assetsFor(roots: MindMapFileNode[]): Asset[] {
    const assets = new Map<string, Asset>();
    const visit = (node: MindMapFileNode) => {
      const id = node.image?.assetId;
      if (id !== undefined && !assets.has(id)) {
        const size = this.naturalSizes.get(id);
        assets.set(id, {
          id, filename: id, mimeType: mimeTypeForName(id),
          width: size?.width ?? 0, height: size?.height ?? 0,
        });
      }
      node.children.forEach(visit);
    };
    roots.forEach(visit);
    return [...assets.values()];
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `bun run test -- --run packages/obsidian/src/__tests__/outline-document.test.ts`
Expected: PASS. If the "puts a new child..." test disagrees on line indexes, print `doc.text()` and check the fixture rather than loosening the assertion: `- Monday`, `  - Standup`, `  - Review` must be consecutive lines (new children append after existing ones), and `- Saturday` must directly follow `  - Retro`.

- [ ] **Step 5: Run `just check`, then commit**

```bash
git add packages/obsidian/src/markdown/OutlineDocument.ts packages/obsidian/src/__tests__/outline-document.test.ts
git commit -F - <<'MSG'
Obsidian: OutlineDocument bridges a note's outline and the Editor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 8: Obsidian: `ObsidianOutlineAssetProvider`

Images in a Markdown-backed map are vault attachments. Asset ids are the link text inside `![[...]]`. This provider resolves ids to files for display and export, and stores pasted or dropped images as attachments (returning the link text) through `importAsset`. `load`/`save` are no-ops because `TextFileView` owns the note.

**Files:**
- Create: `packages/obsidian/src/markdown/ObsidianOutlineAssetProvider.ts`
- Test: `packages/obsidian/src/__tests__/outline-asset-provider.test.ts` (new)

**Interfaces:**
- Consumes: `PersistenceProvider` with `importAsset` (Task 4), `mimeTypeForName` (Task 7).
- Produces: `class ObsidianOutlineAssetProvider implements PersistenceProvider { constructor(app: App, notePath: () => string) }`. Task 11 consumes it.

- [ ] **Step 1: Write the failing test `packages/obsidian/src/__tests__/outline-asset-provider.test.ts`**

```ts
// ABOUTME: Tests for ObsidianOutlineAssetProvider against a fake vault, metadata cache, and file manager.
// ABOUTME: Covers importAsset link text, resource URL lookup, blob loading, and unknown ids.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { App, TFile } from "obsidian";
import { ObsidianOutlineAssetProvider } from "../markdown/ObsidianOutlineAssetProvider";

interface FakeFile { path: string; name: string; bytes: ArrayBuffer }

function fakeApp() {
  const files = new Map<string, FakeFile>();
  const app = {
    fileManager: {
      getAvailablePathForAttachment: vi.fn((filename: string) => Promise.resolve(`attachments/${filename}`)),
    },
    vault: {
      createBinary: vi.fn((path: string, bytes: ArrayBuffer) => {
        const file: FakeFile = { path, name: path.split("/").pop() ?? path, bytes };
        files.set(path, file);
        return Promise.resolve(file);
      }),
      readBinary: vi.fn((file: FakeFile) => Promise.resolve(file.bytes)),
      getResourcePath: vi.fn((file: FakeFile) => `app://vault/${file.path}`),
    },
    metadataCache: {
      fileToLinktext: vi.fn((file: FakeFile) => file.name),
      getFirstLinkpathDest: vi.fn((link: string) =>
        [...files.values()].find((f) => f.name === link || f.path === link) ?? null),
    },
  };
  return { app: app as unknown as App, files };
}

describe("ObsidianOutlineAssetProvider", () => {
  let app: App;
  let files: Map<string, FakeFile>;
  let provider: ObsidianOutlineAssetProvider;

  beforeEach(() => {
    ({ app, files } = fakeApp());
    provider = new ObsidianOutlineAssetProvider(app, () => "notes/plan.md");
  });

  it("importAsset writes the attachment next to the note and returns its link text", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const id = await provider.importAsset("Pasted image 1.png", blob);
    expect(id).toBe("Pasted image 1.png");
    expect(app.fileManager.getAvailablePathForAttachment).toHaveBeenCalledWith("Pasted image 1.png", "notes/plan.md");
    expect(files.get("attachments/Pasted image 1.png")?.bytes.byteLength).toBe(3);
    expect(app.metadataCache.fileToLinktext).toHaveBeenCalledWith(files.get("attachments/Pasted image 1.png"), "notes/plan.md");
  });

  it("loadAssetUrls resolves link texts through the metadata cache and skips unknown ones", async () => {
    await provider.importAsset("pic.png", new Blob([new Uint8Array([9])]));
    const urls = await provider.loadAssetUrls(["pic.png", "missing.png"]);
    expect(urls).toEqual(new Map([["pic.png", "app://vault/attachments/pic.png"]]));
    expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith("pic.png", "notes/plan.md");
  });

  it("loadAsset returns the file bytes as a Blob with a guessed mime type", async () => {
    await provider.importAsset("photo.jpg", new Blob([new Uint8Array([7, 7])]));
    const blob = await provider.loadAsset("photo.jpg");
    expect(blob?.type).toBe("image/jpeg");
    expect(blob?.size).toBe(2);
    expect(await provider.loadAsset("nope.png")).toBeUndefined();
  });

  it("load and save are no-ops", async () => {
    expect(await provider.load()).toBeNull();
    await expect(provider.save()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test -- --run packages/obsidian/src/__tests__/outline-asset-provider.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `packages/obsidian/src/markdown/ObsidianOutlineAssetProvider.ts`**

```ts
// ABOUTME: PersistenceProvider for Markdown-backed maps: images are vault attachments, ids are link texts.
// ABOUTME: load/save are no-ops because TextFileView owns the note; only the asset methods do work.

import type { App, TFile } from "obsidian";
import type { MindMapFileFormat, PersistenceProvider } from "@limn/core";
import { mimeTypeForName } from "./OutlineDocument";

export class ObsidianOutlineAssetProvider implements PersistenceProvider {
  constructor(private readonly app: App, private readonly notePath: () => string) {}

  load(): Promise<MindMapFileFormat | null> {
    return Promise.resolve(null);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }

  /** Write the blob as an attachment next to the note and return the link text that reaches it. */
  async importAsset(filename: string, blob: Blob): Promise<string> {
    const notePath = this.notePath();
    const path = await this.app.fileManager.getAvailablePathForAttachment(filename, notePath);
    const file = await this.app.vault.createBinary(path, await blob.arrayBuffer());
    return this.app.metadataCache.fileToLinktext(file, notePath);
  }

  /** Callers use importAsset; this exists to satisfy the interface and stores under the given name. */
  async saveAsset(assetId: string, blob: Blob): Promise<void> {
    await this.importAsset(assetId, blob);
  }

  async loadAsset(assetId: string): Promise<Blob | undefined> {
    const file = this.resolve(assetId);
    if (!file) return undefined;
    const bytes = await this.app.vault.readBinary(file);
    return new Blob([bytes], { type: mimeTypeForName(file.name) });
  }

  loadAssetUrls(assetIds: string[]): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    for (const id of assetIds) {
      const file = this.resolve(id);
      if (file) urls.set(id, this.app.vault.getResourcePath(file));
    }
    return Promise.resolve(urls);
  }

  onExternalChange(): () => void {
    return () => {};
  }

  dispose(): void {}

  private resolve(linkText: string): TFile | null {
    return this.app.metadataCache.getFirstLinkpathDest(linkText, this.notePath());
  }
}
```

- [ ] **Step 4: Run tests and check**

Run: `bun run test -- --run packages/obsidian/src/__tests__/outline-asset-provider.test.ts` then `just check`
Expected: PASS; check green.

- [ ] **Step 5: Commit**

```bash
git add packages/obsidian/src/markdown/ObsidianOutlineAssetProvider.ts packages/obsidian/src/__tests__/outline-asset-provider.test.ts
git commit -F - <<'MSG'
Obsidian: asset provider that stores map images as vault attachments

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 9: Obsidian: plugin settings and settings tab

Two settings: how marked notes open, and the theme for Markdown-backed maps (mode plus the light and dark palettes the hamburger picker chooses). The `.limn` view keeps its per-file theme. `main.ts` loads and saves them.

**Files:**
- Create: `packages/obsidian/src/settings.ts` (pure: type, defaults, merge; no `obsidian` import so it is testable before the runtime stand-in exists)
- Create: `packages/obsidian/src/LimnSettingTab.ts` (the UI)
- Modify: `packages/obsidian/src/main.ts`
- Test: `packages/obsidian/src/__tests__/settings.test.ts` (new)

**Interfaces:**
- Produces: `interface LimnSettings { openMarkedNotesAs: "mindmap" | "markdown"; themeMode: string; lightTheme: string; darkTheme: string }`, `DEFAULT_SETTINGS`, `mergeSettings(saved: unknown): LimnSettings`, `class LimnSettingTab`; on `LimnPlugin`: `settings: LimnSettings`, `saveSettings(): Promise<void>`, `applyThemeSettingToMarkdownViews(): void` (a no-op until Task 11 fills it in). Tasks 10, 11, 12 consume these.

- [ ] **Step 1: Write the failing test `packages/obsidian/src/__tests__/settings.test.ts`**

```ts
// ABOUTME: Tests for plugin settings defaults and merging of saved data.
// ABOUTME: Unknown or malformed saved values fall back to the defaults.

import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "../settings";

describe("mergeSettings", () => {
  it("returns the defaults for missing data", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.openMarkedNotesAs).toBe("mindmap");
    expect(DEFAULT_SETTINGS.themeMode).toBe("system");
  });

  it("keeps known values and ignores unknown or malformed ones", () => {
    expect(mergeSettings({ openMarkedNotesAs: "markdown", themeMode: "dark", extra: 1 }))
      .toEqual({ ...DEFAULT_SETTINGS, openMarkedNotesAs: "markdown", themeMode: "dark" });
    expect(mergeSettings({ openMarkedNotesAs: "kanban", themeMode: 3 })).toEqual(DEFAULT_SETTINGS);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test -- --run packages/obsidian/src/__tests__/settings.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `packages/obsidian/src/settings.ts`**

```ts
// ABOUTME: Plugin settings for Limn: how marked notes open and the theme for Markdown-backed maps.
// ABOUTME: mergeSettings validates saved data; the Settings UI lives in LimnSettingTab.ts.

import { DEFAULT_LIGHT_THEME, DEFAULT_DARK_THEME } from "@limn/core";

export type OpenMarkedNotesAs = "mindmap" | "markdown";

export interface LimnSettings {
  openMarkedNotesAs: OpenMarkedNotesAs;
  themeMode: string;
  lightTheme: string;
  darkTheme: string;
}

export const DEFAULT_SETTINGS: LimnSettings = {
  openMarkedNotesAs: "mindmap",
  themeMode: "system",
  lightTheme: DEFAULT_LIGHT_THEME,
  darkTheme: DEFAULT_DARK_THEME,
};

export const THEME_MODES: ReadonlySet<string> = new Set(["system", "light", "dark"]);

/** Saved plugin data merged over the defaults; values of the wrong shape are dropped. */
export function mergeSettings(saved: unknown): LimnSettings {
  const settings = { ...DEFAULT_SETTINGS };
  if (typeof saved !== "object" || saved === null) return settings;
  const data = saved as Record<string, unknown>;
  if (data.openMarkedNotesAs === "mindmap" || data.openMarkedNotesAs === "markdown") {
    settings.openMarkedNotesAs = data.openMarkedNotesAs;
  }
  if (typeof data.themeMode === "string" && THEME_MODES.has(data.themeMode)) settings.themeMode = data.themeMode;
  if (typeof data.lightTheme === "string") settings.lightTheme = data.lightTheme;
  if (typeof data.darkTheme === "string") settings.darkTheme = data.darkTheme;
  return settings;
}
```

- [ ] **Step 4: Create `packages/obsidian/src/LimnSettingTab.ts`**

```ts
// ABOUTME: Settings tab for the Limn plugin.
// ABOUTME: Two settings: how marked notes open, and the theme mode for Markdown-backed mind maps.

import { PluginSettingTab, Setting, type App } from "obsidian";
import { THEME_MODES } from "./settings";
import type LimnPlugin from "./main";

export class LimnSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: LimnPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Open notes with limn-plugin: true as")
      .setDesc("Notes with this frontmatter key open as a mind map by default. Any note can still be opened either way from its menu.")
      .addDropdown((dropdown) => dropdown
        .addOption("mindmap", "Mind map")
        .addOption("markdown", "Markdown")
        .setValue(this.plugin.settings.openMarkedNotesAs)
        .onChange(async (value) => {
          this.plugin.settings.openMarkedNotesAs = value === "markdown" ? "markdown" : "mindmap";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Theme")
      .setDesc("Color mode for mind map notes. .limn files keep their own theme.")
      .addDropdown((dropdown) => dropdown
        .addOption("system", "System")
        .addOption("light", "Light")
        .addOption("dark", "Dark")
        .setValue(this.plugin.settings.themeMode)
        .onChange(async (value) => {
          this.plugin.settings.themeMode = THEME_MODES.has(value) ? value : "system";
          await this.plugin.saveSettings();
          this.plugin.applyThemeSettingToMarkdownViews();
        }));
  }
}
```

- [ ] **Step 5: Wire into `packages/obsidian/src/main.ts`**

```ts
import { DEFAULT_SETTINGS, mergeSettings, type LimnSettings } from "./settings";
import { LimnSettingTab } from "./LimnSettingTab";

export default class LimnPlugin extends Plugin {
  settings: LimnSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    setHost(obsidianHost);
    this.settings = mergeSettings(await this.loadData());
    this.registerView(VIEW_TYPE_LIMN, (leaf) => new LimnView(leaf, this));
    this.registerExtensions(["limn"], VIEW_TYPE_LIMN);
    this.addSettingTab(new LimnSettingTab(this.app, this));
    // ...existing create-new command...
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Re-apply the theme setting to open Markdown mind map views (filled in with the view). */
  applyThemeSettingToMarkdownViews(): void {}
```

`onload` becomes `async`; keep `onunload` as is. `loadData()` returns `Promise<any>`; passing it to `mergeSettings(saved: unknown)` needs no cast.

- [ ] **Step 6: Run tests and check, then commit**

Run: `bun run test -- --run packages/obsidian/src/__tests__/settings.test.ts` then `just check`.

```bash
git add packages/obsidian/src/settings.ts packages/obsidian/src/LimnSettingTab.ts packages/obsidian/src/main.ts packages/obsidian/src/__tests__/settings.test.ts
git commit -F - <<'MSG'
Obsidian: plugin settings for marked-note routing and mind map note theme

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 10: Obsidian: routing marked notes to the map view

Two modules: `routing.ts` holds the view type constant, the marker check, and the pure `resolveViewType` decision; `leafRouting.ts` holds the `WorkspaceLeaf.setViewState` wrapper (monkey-around), the per-leaf choice memory, and the two switch helpers commands and menus use. `main.ts` installs the wrapper on load, uninstalls it first thing on unload, switches map leaves back to Markdown on unload, and routes already-open marked notes once the layout is ready. This task also adds the runtime stand-in for the `obsidian` package that later tests need.

**Files:**
- Create: `packages/obsidian/src/markdown/routing.ts`
- Create: `packages/obsidian/src/markdown/leafRouting.ts`
- Create: `packages/obsidian/src/__tests__/mocks/obsidian-module.ts`
- Modify: `vitest.config.ts` (alias), `packages/obsidian/package.json` (dependency), `packages/obsidian/src/main.ts`
- Test: `packages/obsidian/src/__tests__/routing.test.ts` (new)

**Interfaces:**
- Consumes: `plugin.settings.openMarkedNotesAs` (Task 9).
- Produces: `VIEW_TYPE_LIMN_MARKDOWN = "limn-markdown-view"`, `MARKDOWN_VIEW_TYPE = "markdown"`, `MARKER_KEY = "limn-plugin"`, `type NoteViewType`, `hasMindMapMarker(frontmatter)`, `resolveViewType(input)`; `type LeafChoices = WeakMap<WorkspaceLeaf, Map<string, NoteViewType>>`, `rememberChoice(choices, leaf, path, type)`, `installRoutingPatch(plugin): () => void`, `openLeafAs(plugin, leaf, type)`, `openFileAs(plugin, file, leaf | undefined, type)`; on `LimnPlugin`: `leafChoices: LeafChoices`. Tasks 11 and 12 consume these.

- [ ] **Step 1: Add the dependency**

Run: `cd packages/obsidian && bun add monkey-around@3.0.0` (then `cd ../..`). Confirm `packages/obsidian/package.json` lists `"monkey-around": "3.0.0"` under `dependencies` and `bun.lock` changed. It is bundled by esbuild (not in `external`).

- [ ] **Step 2: Create the runtime stand-in `packages/obsidian/src/__tests__/mocks/obsidian-module.ts`**

The `obsidian` npm package ships only type declarations (`"main": ""`), so any module that imports a value from it cannot load under vitest. This file is what `import ... from "obsidian"` resolves to in tests. Keep it minimal; grow it only when a tested module needs another export.

```ts
// ABOUTME: Runtime stand-in for the `obsidian` package under vitest (the real package ships types only).
// ABOUTME: Wired in through resolve.alias in vitest.config.ts; carries just enough behavior for unit tests.

export class WorkspaceLeaf {
  lastState: unknown = null;
  view: unknown = null;
  setViewState(state: unknown): Promise<void> {
    this.lastState = state;
    return Promise.resolve();
  }
  getViewState(): unknown {
    return this.lastState;
  }
  openFile(_file?: unknown): Promise<void> {
    return Promise.resolve();
  }
}

export class TAbstractFile {
  path = "";
  name = "";
}

export class TFile extends TAbstractFile {
  basename = "";
  extension = "";
}

export class TFolder extends TAbstractFile {}

export class Component {}

export class View extends Component {
  constructor(public leaf: WorkspaceLeaf) {
    super();
  }
}

export class FileView extends View {
  file: TFile | null = null;
}

export class TextFileView extends FileView {
  data = "";
  requestSave(): void {}
  save(): Promise<void> {
    return Promise.resolve();
  }
}

export class MarkdownView extends TextFileView {}

export class Plugin extends Component {}

export class PluginSettingTab {
  containerEl = { empty(): void {} };
  constructor(public app: unknown, public plugin: unknown) {}
}

export class Setting {
  constructor(_containerEl: unknown) {}
  setName(): this { return this; }
  setDesc(): this { return this; }
  addDropdown(): this { return this; }
}

export class Notice {
  constructor(public message: string) {}
}

export class Menu {}

export const Platform = { isMacOS: false };
```

Add to `vitest.config.ts` (root), keeping everything else:

```ts
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./packages/obsidian/src/__tests__/mocks/obsidian-module.ts", import.meta.url)),
    },
  },
  test: { /* unchanged */ },
});
```

- [ ] **Step 3: Write the failing test `packages/obsidian/src/__tests__/routing.test.ts`**

```ts
// ABOUTME: Tests for note routing: the pure view-type decision and the WorkspaceLeaf.setViewState wrapper.
// ABOUTME: Uses the obsidian runtime stand-in so the real monkey-around wrapper is exercised.

import { describe, it, expect, beforeEach } from "vitest";
import { WorkspaceLeaf, TFile, TextFileView } from "obsidian";
import type LimnPlugin from "../main";
import { resolveViewType, hasMindMapMarker, VIEW_TYPE_LIMN_MARKDOWN, MARKDOWN_VIEW_TYPE } from "../markdown/routing";
import { installRoutingPatch, rememberChoice, openLeafAs, openFileAs, type LeafChoices } from "../markdown/leafRouting";

const base = { filePath: "a.md", hasMarker: true, openMarkedNotesAs: "mindmap" as const, chosenType: undefined };

describe("resolveViewType", () => {
  it("routes marked notes to the map and unmarked notes to Markdown", () => {
    expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE })).toBe(VIEW_TYPE_LIMN_MARKDOWN);
    expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE, hasMarker: false })).toBe(MARKDOWN_VIEW_TYPE);
    expect(resolveViewType({ ...base, requestedType: VIEW_TYPE_LIMN_MARKDOWN, hasMarker: false })).toBe(MARKDOWN_VIEW_TYPE);
    expect(resolveViewType({ ...base, requestedType: VIEW_TYPE_LIMN_MARKDOWN })).toBe(VIEW_TYPE_LIMN_MARKDOWN);
  });

  it("honors the setting to keep marked notes in Markdown, without forcing restored map leaves back", () => {
    expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE, openMarkedNotesAs: "markdown" })).toBe(MARKDOWN_VIEW_TYPE);
    expect(resolveViewType({ ...base, requestedType: VIEW_TYPE_LIMN_MARKDOWN, openMarkedNotesAs: "markdown" })).toBe(VIEW_TYPE_LIMN_MARKDOWN);
  });

  it("lets an explicit choice win in both directions", () => {
    expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE, chosenType: MARKDOWN_VIEW_TYPE })).toBe(MARKDOWN_VIEW_TYPE);
    expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE, hasMarker: false, chosenType: VIEW_TYPE_LIMN_MARKDOWN })).toBe(VIEW_TYPE_LIMN_MARKDOWN);
  });

  it("leaves other files and other view types alone", () => {
    expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE, filePath: "map.limn" })).toBe(MARKDOWN_VIEW_TYPE);
    expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE, filePath: undefined })).toBe(MARKDOWN_VIEW_TYPE);
    expect(resolveViewType({ ...base, requestedType: "kanban" })).toBe("kanban");
  });
});

describe("hasMindMapMarker", () => {
  it("is true for a truthy limn-plugin key only", () => {
    expect(hasMindMapMarker({ "limn-plugin": true })).toBe(true);
    expect(hasMindMapMarker({ "limn-plugin": false })).toBe(false);
    expect(hasMindMapMarker({ tags: ["x"] })).toBe(false);
    expect(hasMindMapMarker(undefined)).toBe(false);
  });
});

describe("installRoutingPatch", () => {
  const frontmatter = new Map<string, Record<string, unknown> | undefined>();
  let leafChoices: LeafChoices;
  let plugin: LimnPlugin;
  let uninstall: () => void;

  beforeEach(() => {
    frontmatter.clear();
    frontmatter.set("marked.md", { "limn-plugin": true });
    frontmatter.set("plain.md", { tags: [] });
    leafChoices = new WeakMap();
    plugin = {
      settings: { openMarkedNotesAs: "mindmap" },
      leafChoices,
      app: { metadataCache: { getCache: (path: string) => ({ frontmatter: frontmatter.get(path) }) } },
    } as unknown as LimnPlugin;
    uninstall = installRoutingPatch(plugin);
  });

  it("rewrites the view type through the wrapper and stops after uninstall", async () => {
    const leaf = new WorkspaceLeaf();
    await leaf.setViewState({ type: "markdown", state: { file: "marked.md" } });
    expect(leaf.lastState).toEqual({ type: VIEW_TYPE_LIMN_MARKDOWN, state: { file: "marked.md" } });
    await leaf.setViewState({ type: "markdown", state: { file: "plain.md" } });
    expect(leaf.lastState).toEqual({ type: "markdown", state: { file: "plain.md" } });
    uninstall();
    await leaf.setViewState({ type: "markdown", state: { file: "marked.md" } });
    expect(leaf.lastState).toEqual({ type: "markdown", state: { file: "marked.md" } });
  });

  it("uses the remembered choice for that note in that leaf only", async () => {
    const leaf = new WorkspaceLeaf();
    const other = new WorkspaceLeaf();
    rememberChoice(leafChoices, leaf, "marked.md", MARKDOWN_VIEW_TYPE);
    await leaf.setViewState({ type: "markdown", state: { file: "marked.md" } });
    expect((leaf.lastState as { type: string }).type).toBe("markdown");
    await other.setViewState({ type: "markdown", state: { file: "marked.md" } });
    expect((other.lastState as { type: string }).type).toBe(VIEW_TYPE_LIMN_MARKDOWN);
    await leaf.setViewState({ type: "markdown", state: { file: "plain.md" } });
    expect((leaf.lastState as { type: string }).type).toBe("markdown");
    uninstall();
  });

  it("openLeafAs saves the current view, remembers the choice, and switches the leaf", async () => {
    const leaf = new WorkspaceLeaf();
    let saved = 0;
    leaf.view = Object.assign(new TextFileView(leaf), { save: () => { saved++; return Promise.resolve(); } });
    leaf.lastState = { type: VIEW_TYPE_LIMN_MARKDOWN, state: { file: "marked.md" } };
    await openLeafAs(plugin, leaf, MARKDOWN_VIEW_TYPE);
    expect(saved).toBe(1);
    expect(leafChoices.get(leaf)?.get("marked.md")).toBe(MARKDOWN_VIEW_TYPE);
    expect(leaf.lastState).toEqual({ type: MARKDOWN_VIEW_TYPE, state: { file: "marked.md" } });
    uninstall();
  });

  it("openFileAs remembers the choice on the target leaf and opens the file there", async () => {
    const leaf = new WorkspaceLeaf();
    let opened: unknown = null;
    leaf.openFile = (file: unknown) => { opened = file; return Promise.resolve(); };
    const file = Object.assign(new TFile(), { path: "plain.md", extension: "md" });
    await openFileAs(plugin, file, leaf, VIEW_TYPE_LIMN_MARKDOWN);
    expect(leafChoices.get(leaf)?.get("plain.md")).toBe(VIEW_TYPE_LIMN_MARKDOWN);
    expect(opened).toBe(file);
    uninstall();
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `bun run test -- --run packages/obsidian/src/__tests__/routing.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 5: Create `packages/obsidian/src/markdown/routing.ts`**

```ts
// ABOUTME: Decides which view type a leaf should use for a Markdown note: Obsidian's editor or the mind map.
// ABOUTME: Pure decision logic; leafRouting.ts feeds it from the WorkspaceLeaf wrapper and applies the answer.

import type { OpenMarkedNotesAs } from "../settings";

export const VIEW_TYPE_LIMN_MARKDOWN = "limn-markdown-view";
export const MARKDOWN_VIEW_TYPE = "markdown";
/** Frontmatter key that marks a note as a mind map. */
export const MARKER_KEY = "limn-plugin";

export type NoteViewType = typeof VIEW_TYPE_LIMN_MARKDOWN | typeof MARKDOWN_VIEW_TYPE;

/** True when frontmatter marks the note as a mind map (a truthy `limn-plugin`). */
export function hasMindMapMarker(frontmatter: Record<string, unknown> | undefined): boolean {
  return Boolean(frontmatter?.[MARKER_KEY]);
}

export interface RoutingInput {
  requestedType: string;
  filePath: string | undefined;
  hasMarker: boolean;
  openMarkedNotesAs: OpenMarkedNotesAs;
  /** The user's explicit "Open as ..." choice for this note in this leaf, if any. */
  chosenType: NoteViewType | undefined;
}

/**
 * The view type to actually open. Only Markdown notes requested as `markdown` or as the map view are
 * touched; an explicit choice wins, then the marker and the setting decide in both directions.
 */
export function resolveViewType(input: RoutingInput): string {
  const { requestedType, filePath, hasMarker, openMarkedNotesAs, chosenType } = input;
  if (requestedType !== MARKDOWN_VIEW_TYPE && requestedType !== VIEW_TYPE_LIMN_MARKDOWN) return requestedType;
  if (filePath === undefined || !filePath.endsWith(".md")) return requestedType;
  if (chosenType) return chosenType;
  if (requestedType === MARKDOWN_VIEW_TYPE && hasMarker && openMarkedNotesAs === "mindmap") return VIEW_TYPE_LIMN_MARKDOWN;
  if (requestedType === VIEW_TYPE_LIMN_MARKDOWN && !hasMarker) return MARKDOWN_VIEW_TYPE;
  return requestedType;
}
```

- [ ] **Step 6: Create `packages/obsidian/src/markdown/leafRouting.ts`**

```ts
// ABOUTME: Routes notes between the Markdown editor and the mind map view by wrapping WorkspaceLeaf.setViewState.
// ABOUTME: Same technique as Kanban and Excalidraw; remembers explicit choices per note per leaf.

import { WorkspaceLeaf, TextFileView, type TFile, type ViewState } from "obsidian";
import { around } from "monkey-around";
import type LimnPlugin from "../main";
import { hasMindMapMarker, resolveViewType, type NoteViewType } from "./routing";

/** Explicit "Open as ..." choices, per leaf, keyed by note path. Entries die with the leaf. */
export type LeafChoices = WeakMap<WorkspaceLeaf, Map<string, NoteViewType>>;

export function rememberChoice(choices: LeafChoices, leaf: WorkspaceLeaf, path: string, type: NoteViewType): void {
  let byPath = choices.get(leaf);
  if (!byPath) {
    byPath = new Map();
    choices.set(leaf, byPath);
  }
  byPath.set(path, type);
}

function filePathOf(state: ViewState): string | undefined {
  const file = state.state?.file;
  return typeof file === "string" ? file : undefined;
}

/** Wrap WorkspaceLeaf.prototype.setViewState so notes open in the right view. Returns the uninstaller. */
export function installRoutingPatch(plugin: LimnPlugin): () => void {
  return around(WorkspaceLeaf.prototype, {
    setViewState(next) {
      return function (this: WorkspaceLeaf, state: ViewState, eState?: unknown) {
        const filePath = filePathOf(state);
        const type = resolveViewType({
          requestedType: state.type,
          filePath,
          hasMarker: filePath !== undefined
            && hasMindMapMarker(plugin.app.metadataCache.getCache(filePath)?.frontmatter),
          openMarkedNotesAs: plugin.settings.openMarkedNotesAs,
          chosenType: filePath !== undefined ? plugin.leafChoices.get(this)?.get(filePath) : undefined,
        });
        return next.call(this, type === state.type ? state : { ...state, type }, eState);
      };
    },
  });
}

/** Switch the note a leaf shows between the Markdown editor and the map, remembering the choice. */
export async function openLeafAs(plugin: LimnPlugin, leaf: WorkspaceLeaf, type: NoteViewType): Promise<void> {
  const current = leaf.getViewState();
  const path = filePathOf(current);
  if (path === undefined) return;
  // MarkdownView and LimnMarkdownView are both TextFileViews; flush pending edits before switching.
  if (leaf.view instanceof TextFileView) await leaf.view.save();
  rememberChoice(plugin.leafChoices, leaf, path, type);
  await leaf.setViewState({ type, state: current.state });
}

/** Open a note in the given leaf (or a new one) as the requested view, remembering the choice. */
export async function openFileAs(plugin: LimnPlugin, file: TFile, leaf: WorkspaceLeaf | undefined, type: NoteViewType): Promise<void> {
  const target = leaf ?? plugin.app.workspace.getLeaf(false);
  rememberChoice(plugin.leafChoices, target, file.path, type);
  await target.openFile(file);
}
```

- [ ] **Step 7: Wire `packages/obsidian/src/main.ts`**

```ts
import { VIEW_TYPE_LIMN_MARKDOWN, MARKDOWN_VIEW_TYPE, hasMindMapMarker } from "./markdown/routing";
import { installRoutingPatch, type LeafChoices } from "./markdown/leafRouting";

export default class LimnPlugin extends Plugin {
  settings: LimnSettings = { ...DEFAULT_SETTINGS };
  leafChoices: LeafChoices = new WeakMap();
  private uninstallRouting: (() => void) | null = null;

  async onload(): Promise<void> {
    // ...existing...
    this.uninstallRouting = installRoutingPatch(this);
    this.app.workspace.onLayoutReady(() => this.routeOpenMarkedNotes());
  }

  onunload(): void {
    // Remove the wrapper first so switching leaves back is not re-routed, then hand every map leaf
    // back to the Markdown editor before the view type disappears.
    this.uninstallRouting?.();
    this.uninstallRouting = null;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_LIMN_MARKDOWN)) {
      void leaf.setViewState({ type: MARKDOWN_VIEW_TYPE, state: leaf.getViewState().state });
    }
  }

  /** Marked notes already open in the Markdown editor when the plugin loads switch to the map view. */
  private routeOpenMarkedNotes(): void {
    if (this.settings.openMarkedNotesAs !== "mindmap") return;
    for (const leaf of this.app.workspace.getLeavesOfType(MARKDOWN_VIEW_TYPE)) {
      const state = leaf.getViewState();
      const path = state.state?.file;
      if (typeof path !== "string") continue;
      if (!hasMindMapMarker(this.app.metadataCache.getCache(path)?.frontmatter)) continue;
      // Re-setting the same state runs it through the wrapper, which rewrites the type.
      void leaf.setViewState(state);
    }
  }
```

The `getLeavesOfType(VIEW_TYPE_LIMN_MARKDOWN)` loop in `onunload` is inert until Task 11 registers the view; it is placed here so unload ordering is right from the start.

- [ ] **Step 8: Run tests and check**

Run: `bun run test -- --run packages/obsidian/src/__tests__/routing.test.ts` then `just check`
Expected: PASS; check green (the Obsidian bundle now includes monkey-around).

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts bun.lock packages/obsidian/package.json packages/obsidian/src/main.ts packages/obsidian/src/markdown/routing.ts packages/obsidian/src/markdown/leafRouting.ts packages/obsidian/src/__tests__/mocks/obsidian-module.ts packages/obsidian/src/__tests__/routing.test.ts
git commit -F - <<'MSG'
Obsidian: route marked notes to the mind map view type

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 11: Obsidian: `LimnMarkdownView`

The `TextFileView` subclass. It is deliberately thin: `OutlineDocument` (Task 7) does the conversion and save signal, `ObsidianOutlineAssetProvider` (Task 8) does images, `mountLimnRoot`/`applyThemeToContainer` (Task 5) do the UI. The base class owns loading, saving, echo suppression, and the three-way merge, so `onLoadFile`, `onUnloadFile`, and `onModify` are not overridden. No unit test (the class is glue over tested modules and needs a DOM); the manual checklist in Task 14 covers it.

**Files:**
- Create: `packages/obsidian/src/markdown/LimnMarkdownView.ts`
- Modify: `packages/obsidian/src/main.ts` (register the view; fill in `applyThemeSettingToMarkdownViews`)

**Interfaces:**
- Consumes: everything listed above plus `openLeafAs`, `VIEW_TYPE_LIMN_MARKDOWN`, `MARKDOWN_VIEW_TYPE` (Task 10), `plugin.settings` (Task 9), `Editor.zoomToFit`, `Editor.onSave`, `Editor.onThemeChange`, `Editor.setCapabilities(OUTLINE_CAPABILITIES)`.
- Produces: `class LimnMarkdownView extends TextFileView` with public `editor`. Task 12 uses `getActiveViewOfType(LimnMarkdownView)`.

- [ ] **Step 1: Create `packages/obsidian/src/markdown/LimnMarkdownView.ts`**

```ts
// ABOUTME: TextFileView that shows a Markdown note's nested bullet lists as an editable mind map.
// ABOUTME: Obsidian's TextFileView owns loading, saving, echo suppression, and merging; this view converts.

import { TextFileView, type WorkspaceLeaf, type Menu } from "obsidian";
import type { Root } from "react-dom/client";
import { Editor, OUTLINE_CAPABILITIES } from "@limn/core";
import type { AssetAddedDetail } from "@limn/web/limn-window";
import type LimnPlugin from "../main";
import { createDomTextMeasurer } from "../ObsidianTextMeasurer";
import { mountLimnRoot } from "../LimnViewRoot";
import { applyThemeToContainer } from "../viewTheme";
import { OutlineDocument } from "./OutlineDocument";
import { ObsidianOutlineAssetProvider } from "./ObsidianOutlineAssetProvider";
import { VIEW_TYPE_LIMN_MARKDOWN, MARKDOWN_VIEW_TYPE } from "./routing";
import { openLeafAs } from "./leafRouting";

export class LimnMarkdownView extends TextFileView {
  editor!: Editor;
  private doc!: OutlineDocument;
  private provider!: ObsidianOutlineAssetProvider;
  private reactRoot: Root | null = null;
  private detachDoc: (() => void) | null = null;
  /** Resource URLs already announced to the React tree, by asset id. */
  private assetUrls = new Map<string, string>();

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LimnPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_LIMN_MARKDOWN;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Mind map";
  }

  getIcon(): string {
    return "git-branch";
  }

  canAcceptExtension(ext: string): boolean {
    return ext === "md";
  }

  async onOpen(): Promise<void> {
    await super.onOpen();
    this.contentEl.addClass("limn-view");
    this.editor = new Editor(createDomTextMeasurer(this.contentEl));
    this.editor.setCapabilities(OUTLINE_CAPABILITIES);
    this.provider = new ObsidianOutlineAssetProvider(this.app, () => this.file?.path ?? "");
    this.doc = new OutlineDocument(this.editor, () => ({
      mode: this.plugin.settings.themeMode,
      lightTheme: this.plugin.settings.lightTheme,
      darkTheme: this.plugin.settings.darkTheme,
    }));
    this.detachDoc = this.doc.attach(this);
    this.editor.onSave(() => void this.save());
    // The note stores no theme; the picker in the menu writes the plugin setting instead.
    this.editor.onThemeChange(() => {
      this.plugin.settings.themeMode = this.editor.getTheme();
      this.plugin.settings.lightTheme = this.editor.getLightTheme();
      this.plugin.settings.darkTheme = this.editor.getDarkTheme();
      void this.plugin.saveSettings();
      applyThemeToContainer(this.contentEl, this.editor);
    });
  }

  async onClose(): Promise<void> {
    await super.onClose();
    this.detachDoc?.();
    this.detachDoc = null;
    this.reactRoot?.unmount();
    this.reactRoot = null;
  }

  getViewData(): string {
    return this.doc.viewData();
  }

  setViewData(text: string, clear: boolean): void {
    this.doc.load(text, clear);
    if (clear) this.fitCamera();
    applyThemeToContainer(this.contentEl, this.editor);
    if (!this.reactRoot) this.reactRoot = mountLimnRoot(this.contentEl, this.editor, this.provider);
    this.announceNewAssets();
  }

  clear(): void {
    this.doc.clear();
    this.assetUrls.clear();
  }

  onPaneMenu(menu: Menu, source: string): void {
    super.onPaneMenu(menu, source);
    menu.addItem((item) => item
      .setTitle("Open as Markdown")
      .setIcon("file-text")
      .onClick(() => void openLeafAs(this.plugin, this.leaf, MARKDOWN_VIEW_TYPE)));
  }

  /** Apply the theme from plugin settings (used when the setting changes in the settings tab). */
  applyThemeSetting(): void {
    this.editor.setTheme(this.plugin.settings.themeMode);
  }

  private fitCamera(): void {
    const { clientWidth, clientHeight } = this.contentEl;
    if (clientWidth > 0 && clientHeight > 0) this.editor.zoomToFit(clientWidth, clientHeight);
    else this.editor.setCamera(40, 40, 1);
  }

  /** Resolve resource URLs for images the React tree has not seen, then learn their natural sizes. */
  private announceNewAssets(): void {
    const ids = this.editor.getAssets().map((a) => a.id).filter((id) => !this.assetUrls.has(id));
    if (ids.length === 0) return;
    void this.provider.loadAssetUrls(ids).then((urls) => {
      for (const [assetId, url] of urls) {
        this.assetUrls.set(assetId, url);
        const detail: AssetAddedDetail = { assetId, blobUrl: url };
        window.dispatchEvent(new CustomEvent("limn:asset-added", { detail }));
        if (!this.doc.hasNaturalSize(assetId)) this.resolveNaturalSize(assetId, url);
      }
    });
  }

  private resolveNaturalSize(assetId: string, url: string): void {
    const img = new Image();
    img.onload = () => this.doc.setImageNaturalSize(assetId, img.naturalWidth, img.naturalHeight);
    img.src = url;
  }
}
```

Notes for the implementer:
- `this` satisfies `SaveHost` because `TextFileView` has a public `data: string` and `requestSave`.
- `setTheme` in `applyThemeSetting` fires `onThemeChange`, which writes the same value back and re-applies the container theme; that is intended.
- `window.dispatchEvent` for `limn:asset-added` matches the listener in `LimnViewRoot` (both use the plugin bundle's `window`), the same as the existing drop path in `MindMapCanvas`.
- An embed that is not an image (`![[doc.pdf]]`) resolves to a URL the `Image` cannot decode; `onload` never fires, the size stays unknown, the node shows text only, and the embed round-trips untouched.

- [ ] **Step 2: Register in `packages/obsidian/src/main.ts`**

```ts
import { LimnMarkdownView } from "./markdown/LimnMarkdownView";
// in onload, after the .limn registration:
    this.registerView(VIEW_TYPE_LIMN_MARKDOWN, (leaf) => new LimnMarkdownView(leaf, this));
// replace the empty method from Task 9:
  applyThemeSettingToMarkdownViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_LIMN_MARKDOWN)) {
      if (leaf.view instanceof LimnMarkdownView) leaf.view.applyThemeSetting();
    }
  }
```

- [ ] **Step 3: Verify**

Run: `just check`
Expected: green. Optional smoke test (the commands arrive in Task 12): `just obsidian-install obsidian_vault/limn_test`, reload Obsidian, open the developer console, and run `app.workspace.getLeaf(false).setViewState({type: "limn-markdown-view", state: {file: "<path-to-a-note-with-bullets>.md"}})`; the map should render.

- [ ] **Step 4: Commit**

```bash
git add packages/obsidian/src/markdown/LimnMarkdownView.ts packages/obsidian/src/main.ts
git commit -F - <<'MSG'
Obsidian: LimnMarkdownView shows a note's outline as a mind map

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 12: Obsidian: commands and menu items

Four commands and two context-menu hooks, plus the palette rename of the `.limn` command. Pure helpers (`nextFreeNotePath`, `MARKED_NOTE_CONTENT`) and the two functions that only need `app` (`createMindMapNote`, `addMindMapMarker`) are unit tested against fakes; the `checkCallback` and menu wiring are exercised manually (Task 14 checklist).

**Files:**
- Create: `packages/obsidian/src/markdown/commands.ts`
- Modify: `packages/obsidian/src/main.ts`
- Test: `packages/obsidian/src/__tests__/commands.test.ts` (new)

**Interfaces:**
- Consumes: `openLeafAs`, `openFileAs` (Task 10), `VIEW_TYPE_LIMN_MARKDOWN`, `MARKDOWN_VIEW_TYPE`, `MARKER_KEY` (Task 10).
- Produces: `registerMarkdownCommands(plugin)`, `createMindMapNote(plugin)`, `addMindMapMarker(app, file)`, `nextFreeNotePath(folder, exists)`, `MARKED_NOTE_CONTENT`.

- [ ] **Step 1: Write the failing test `packages/obsidian/src/__tests__/commands.test.ts`**

```ts
// ABOUTME: Tests for the Markdown mind map commands' pure parts and app-only helpers.
// ABOUTME: Note naming, marker content, note creation in the right folder, and marker insertion.

import { describe, it, expect, vi } from "vitest";
import { TFile, WorkspaceLeaf } from "obsidian";
import type { App } from "obsidian";
import type LimnPlugin from "../main";
import { nextFreeNotePath, MARKED_NOTE_CONTENT, createMindMapNote, addMindMapMarker } from "../markdown/commands";
import { VIEW_TYPE_LIMN_MARKDOWN } from "../markdown/routing";

describe("nextFreeNotePath", () => {
  it("counts up from Untitled inside the folder, and handles the vault root", () => {
    const taken = new Set(["Untitled.md", "Untitled 1.md", "notes/Untitled.md"]);
    const exists = (p: string) => taken.has(p);
    expect(nextFreeNotePath("/", exists)).toBe("Untitled 2.md");
    expect(nextFreeNotePath("", exists)).toBe("Untitled 2.md");
    expect(nextFreeNotePath("notes", exists)).toBe("notes/Untitled 1.md");
    expect(nextFreeNotePath("other", exists)).toBe("other/Untitled.md");
  });
});

describe("MARKED_NOTE_CONTENT", () => {
  it("is frontmatter with the marker and nothing else", () => {
    expect(MARKED_NOTE_CONTENT).toBe("---\nlimn-plugin: true\n---\n");
  });
});

describe("createMindMapNote", () => {
  it("creates the marked note in the new-file folder and opens it as a map", async () => {
    const created: Array<{ path: string; content: string }> = [];
    const leaf = new WorkspaceLeaf();
    let opened: unknown = null;
    leaf.openFile = (file: unknown) => { opened = file; return Promise.resolve(); };
    const leafChoices = new WeakMap();
    const plugin = {
      leafChoices,
      app: {
        vault: {
          getAbstractFileByPath: (p: string) => (p === "notes/Untitled.md" ? {} : null),
          create: vi.fn((path: string, content: string) => {
            created.push({ path, content });
            return Promise.resolve(Object.assign(new TFile(), { path, extension: "md" }));
          }),
        },
        fileManager: { getNewFileParent: vi.fn(() => ({ path: "notes" })) },
        workspace: { getActiveFile: () => ({ path: "notes/current.md" }), getLeaf: () => leaf },
      },
    } as unknown as LimnPlugin;

    await createMindMapNote(plugin);

    expect(plugin.app.fileManager.getNewFileParent).toHaveBeenCalledWith("notes/current.md");
    expect(created).toEqual([{ path: "notes/Untitled 1.md", content: MARKED_NOTE_CONTENT }]);
    expect((opened as { path: string }).path).toBe("notes/Untitled 1.md");
    expect(leafChoices.get(leaf)?.get("notes/Untitled 1.md")).toBe(VIEW_TYPE_LIMN_MARKDOWN);
  });
});

describe("addMindMapMarker", () => {
  it("sets limn-plugin: true through processFrontMatter", async () => {
    const fm: Record<string, unknown> = { tags: ["x"] };
    const app = {
      fileManager: {
        processFrontMatter: vi.fn((_file: unknown, fn: (f: Record<string, unknown>) => void) => { fn(fm); return Promise.resolve(); }),
      },
    } as unknown as App;
    const file = Object.assign(new TFile(), { path: "a.md" });
    await addMindMapMarker(app, file);
    expect(fm).toEqual({ tags: ["x"], "limn-plugin": true });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test -- --run packages/obsidian/src/__tests__/commands.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `packages/obsidian/src/markdown/commands.ts`**

```ts
// ABOUTME: Commands and menu items for Markdown-backed mind maps: open as map/Markdown, create, add marker.
// ABOUTME: Pure helpers and app-only functions are separate from the Obsidian wiring so they can be tested.

import { TFile, MarkdownView, type App, type Menu } from "obsidian";
import type LimnPlugin from "../main";
import { VIEW_TYPE_LIMN_MARKDOWN, MARKDOWN_VIEW_TYPE, MARKER_KEY } from "./routing";
import { openLeafAs, openFileAs } from "./leafRouting";

/** Body of a brand-new mind map note: the marker and nothing else. */
export const MARKED_NOTE_CONTENT = `---\n${MARKER_KEY}: true\n---\n`;

/** "Untitled.md", then "Untitled 1.md", ... inside the folder, whichever does not exist yet. */
export function nextFreeNotePath(folder: string, exists: (path: string) => boolean): string {
  const prefix = folder === "" || folder === "/" ? "" : `${folder}/`;
  let candidate = `${prefix}Untitled.md`;
  for (let i = 1; exists(candidate); i++) candidate = `${prefix}Untitled ${i}.md`;
  return candidate;
}

/** Create a marked note next to the active file (per Obsidian's new-file location) and open it as a map. */
export async function createMindMapNote(plugin: LimnPlugin): Promise<void> {
  const { app } = plugin;
  const folder = app.fileManager.getNewFileParent(app.workspace.getActiveFile()?.path ?? "");
  const path = nextFreeNotePath(folder.path, (p) => app.vault.getAbstractFileByPath(p) !== null);
  const file = await app.vault.create(path, MARKED_NOTE_CONTENT);
  await openFileAs(plugin, file, undefined, VIEW_TYPE_LIMN_MARKDOWN);
}

/** Add `limn-plugin: true` to the note's frontmatter, creating the frontmatter if needed. */
export async function addMindMapMarker(app: App, file: TFile): Promise<void> {
  await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
    frontmatter[MARKER_KEY] = true;
  });
}

function addMenuItem(menu: Menu, title: string, icon: string, onClick: () => void): void {
  menu.addItem((item) => item.setTitle(title).setIcon(icon).onClick(onClick));
}

export function registerMarkdownCommands(plugin: LimnPlugin): void {
  const { app } = plugin;

  plugin.addCommand({
    id: "open-as-mindmap",
    name: "Open as mind map",
    checkCallback: (checking) => {
      const view = app.workspace.getActiveViewOfType(MarkdownView);
      if (!view?.file || view.file.extension !== "md") return false;
      if (!checking) void openLeafAs(plugin, view.leaf, VIEW_TYPE_LIMN_MARKDOWN);
      return true;
    },
  });

  plugin.addCommand({
    id: "open-as-markdown",
    name: "Open as Markdown",
    checkCallback: (checking) => {
      // The map view class is not imported here (it pulls in the React tree); the type id is enough.
      const leaf = app.workspace.getMostRecentLeaf();
      if (leaf?.view.getViewType() !== VIEW_TYPE_LIMN_MARKDOWN) return false;
      if (!checking) void openLeafAs(plugin, leaf, MARKDOWN_VIEW_TYPE);
      return true;
    },
  });

  plugin.addCommand({
    id: "create-mindmap-note",
    name: "Create new mind map note",
    callback: () => void createMindMapNote(plugin),
  });

  plugin.addCommand({
    id: "add-mindmap-marker",
    name: "Add mind map marker to note",
    checkCallback: (checking) => {
      const file = app.workspace.getActiveFile();
      if (!file || file.extension !== "md") return false;
      if (!checking) void addMindMapMarker(app, file);
      return true;
    },
  });

  plugin.registerEvent(app.workspace.on("file-menu", (menu, file, _source, leaf) => {
    if (!(file instanceof TFile) || file.extension !== "md") return;
    if (leaf?.view.getViewType() === VIEW_TYPE_LIMN_MARKDOWN) {
      addMenuItem(menu, "Open as Markdown", "file-text", () => void openLeafAs(plugin, leaf, MARKDOWN_VIEW_TYPE));
    } else {
      addMenuItem(menu, "Open as mind map", "git-branch", () => void openFileAs(plugin, file, leaf, VIEW_TYPE_LIMN_MARKDOWN));
    }
  }));

  plugin.registerEvent(app.workspace.on("editor-menu", (menu, _editor, info) => {
    if (!(info instanceof MarkdownView) || !info.file) return;
    addMenuItem(menu, "Open as mind map", "git-branch", () => void openLeafAs(plugin, info.leaf, VIEW_TYPE_LIMN_MARKDOWN));
  }));
}
```

- [ ] **Step 4: Wire `packages/obsidian/src/main.ts`**

- Rename the existing command: `name: "Create new mind map file (.limn)"` (id `create-new` unchanged so existing hotkeys keep working).
- Call `registerMarkdownCommands(this);` in `onload` after the view registrations.
- Update the file's ABOUTME lines to mention both views.

- [ ] **Step 5: Run tests and check**

Run: `bun run test -- --run packages/obsidian/src/__tests__/commands.test.ts` then `just check`
Expected: PASS; check green.

- [ ] **Step 6: Manual smoke test (required before commit)**

`just obsidian-install obsidian_vault/limn_test`, reload Obsidian in that vault, then: "Create new mind map note" opens an empty map; press Enter, type, Tab, type; switch with the pane menu "Open as Markdown" and see `---\nlimn-plugin: true\n---\n- ...` with the nested bullets; "Open as mind map" from the editor context menu switches back with selection on the map. Note anything surprising in the report.

- [ ] **Step 7: Commit**

```bash
git add packages/obsidian/src/markdown/commands.ts packages/obsidian/src/main.ts packages/obsidian/src/__tests__/commands.test.ts
git commit -F - <<'MSG'
Obsidian: commands and menus for opening notes as mind maps

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 13: Wikilinks display cleanly and open in Obsidian

Spec 5.2: `[[Note]]` and `[[Note|alias]]` are plain text to the codec, but the inline renderer shows them as links (alias or target, no brackets) and `Cmd+Enter` / `Cmd+Click` opens them. Today the canvas opens links with `window.open(href)` directly; route that through the Editor's link callback so each host decides: web/desktop open URLs in a new tab and ignore wikilinks; Obsidian opens wikilinks with `workspace.openLinkText` in a new tab and URLs with `window.open`. Both Obsidian views get the callback (the `.limn` view had none, so `Cmd+Enter` did nothing there).

**Files:**
- Modify: `packages/core/src/markdown/inlineMarkdown.ts` (wikilink span), `packages/core/src/editor/Editor.ts` (`followLink`)
- Modify: `packages/web/src/components/MindMapCanvas.tsx` (Cmd+Click calls `editor.followLink`), `packages/web/src/App.tsx` (ignore wikilinks)
- Create: `packages/obsidian/src/openLink.ts`
- Modify: `packages/obsidian/src/LimnView.ts`, `packages/obsidian/src/markdown/LimnMarkdownView.ts` (register the callback)
- Test: `packages/core/src/__tests__/inline-markdown.test.ts` (add cases), `packages/core/src/__tests__/editor.test.ts` (add one case), `packages/obsidian/src/__tests__/open-link.test.ts` (new)

**Interfaces:**
- Produces: a wikilink segment has `style.link` equal to the raw `[[target]]` (target without alias); `Editor.followLink(url: string): void`; `openLinkFromMap(app: App, url: string, sourcePath: string): void`.

- [ ] **Step 1: Failing core tests**

Append to `packages/core/src/__tests__/inline-markdown.test.ts` (use the file's existing helper style; a link segment is `{ text, style: { bold: false, italic: false, code: false, strikethrough: false, link } }`):

```ts
describe("wikilinks", () => {
  it("shows the target without brackets and keeps the raw wikilink as the link", () => {
    expect(parseInlineMarkdown("see [[Note]] now")).toEqual([
      plain("see "), link("Note", "[[Note]]"), plain(" now"),
    ]);
  });
  it("shows the alias when there is one", () => {
    expect(parseInlineMarkdown("[[Note|the note]]")).toEqual([link("the note", "[[Note]]")]);
    expect(parseInlineMarkdown("[[Note#Heading|x]]")).toEqual([link("x", "[[Note#Heading]]")]);
  });
  it("leaves unmatched brackets, empty links, and embeds alone", () => {
    expect(parseInlineMarkdown("[[unclosed")).toEqual([plain("[[unclosed")]);
    expect(parseInlineMarkdown("[[]]")).toEqual([plain("[[]]")]);
    expect(parseInlineMarkdown("![[pic.png]]")).toEqual([plain("![[pic.png]]")]);
  });
  it("stripMarkdown measures the displayed text", () => {
    expect(stripMarkdown("[[Note|alias]] here")).toBe("alias here");
  });
});
```

Add a `link(text, url)` helper next to `plain`/`bold` if the file lacks one.

Append to the link tests in `packages/core/src/__tests__/editor.test.ts` (find the existing `onOpenLink`/`openLink` cases and add beside them):

```ts
    test("followLink hands any url to the callback; openLink finds wikilinks", () => {
      const editor = new TestEditor();
      const opened: string[] = [];
      editor.onOpenLink((url) => opened.push(url));
      editor.followLink("https://example.com");
      const id = editor.addRoot("read [[Note|it]]", 0, 0);
      editor.exitEditMode();
      editor.openLink(id);
      expect(opened).toEqual(["https://example.com", "[[Note]]"]);
    });
```

Run: `just test-file inline-markdown` and `just test-file editor`. Expected: FAIL.

- [ ] **Step 2: Core implementation**

In `inlineMarkdown.ts`:
- Extend `Span` with `displayText?: string`.
- In `findSpans`, before the `// Link: [text](url)` check:

```ts
    // Wikilink: [[target]] or [[target|alias]]; ![[...]] is an embed and stays text
    if (line[i] === "[" && line[i + 1] === "[" && line[i - 1] !== "!") {
      const wikiSpan = tryParseWikilink(line, i);
      if (wikiSpan) {
        spans.push(wikiSpan);
        i = wikiSpan.end + wikiSpan.closeLen;
        continue;
      }
    }
```

- Add:

```ts
/** Try to parse a wikilink starting at position i (line[i] and line[i+1] are "["). */
function tryParseWikilink(line: string, i: number): Span | null {
  const close = line.indexOf("]]", i + 2);
  if (close === -1 || close === i + 2) return null;
  const inner = line.slice(i + 2, close);
  const bar = inner.indexOf("|");
  const target = bar === -1 ? inner : inner.slice(0, bar);
  const alias = bar === -1 ? undefined : inner.slice(bar + 1);
  if (target === "") return null;
  return {
    start: i + 2,
    end: close,
    openLen: 2,
    closeLen: 2,
    type: "link",
    linkUrl: `[[${target}]]`,
    displayText: alias === undefined || alias === "" ? target : alias,
  };
}
```

- In `buildSegments`, the link branch uses `text: span.displayText ?? line.slice(span.start, span.end)`.

In `Editor.ts`, next to `openLink`:

```ts
  /** Hand a link (a URL or a raw `[[wikilink]]`) to the host's link callback. */
  followLink(url: string): void {
    this.openLinkCallback?.(url);
  }
```

and make `openLink(nodeId)` call `this.followLink(first.url)`.

Run: `just test-file inline-markdown`, `just test-file editor`. Expected: PASS.

- [ ] **Step 3: Web**

`MindMapCanvas.tsx`, Cmd+Click branch: replace `window.open(href, "_blank", "noopener,noreferrer");` with `editor.followLink(href);`.

`App.tsx`, the `onOpenLink` registration:

```ts
    editor.onOpenLink((url) => {
      if (url.startsWith("[[")) return;   // wikilinks have no target outside Obsidian
      window.open(url, "_blank", "noopener,noreferrer");
    });
```

- [ ] **Step 4: Obsidian: `packages/obsidian/src/openLink.ts` and its test**

Test `packages/obsidian/src/__tests__/open-link.test.ts`:

```ts
// ABOUTME: Tests for opening links from a mind map inside Obsidian.
// ABOUTME: Wikilinks go to workspace.openLinkText in a new tab; URLs go to window.open.

import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import { openLinkFromMap } from "../openLink";

describe("openLinkFromMap", () => {
  it("opens wikilinks through the workspace, resolved from the note", () => {
    const openLinkText = vi.fn();
    const app = { workspace: { openLinkText } } as unknown as App;
    openLinkFromMap(app, "[[Other#Part]]", "notes/plan.md");
    expect(openLinkText).toHaveBeenCalledWith("Other#Part", "notes/plan.md", "tab");
  });

  it("opens URLs in the browser", () => {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.window === "undefined") g.window = globalThis;
    const win = g.window as Record<string, unknown>;
    const open = vi.fn();
    win.open = open;
    const app = { workspace: { openLinkText: vi.fn() } } as unknown as App;
    openLinkFromMap(app, "https://example.com", "notes/plan.md");
    expect(open).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
  });
});
```

`packages/obsidian/src/openLink.ts`:

```ts
// ABOUTME: Opens a link followed from a mind map node inside Obsidian.
// ABOUTME: Wikilinks resolve relative to the note and open in a new tab; URLs open in the browser.

import type { App } from "obsidian";

const WIKILINK = /^\[\[(.+)\]\]$/;

export function openLinkFromMap(app: App, url: string, sourcePath: string): void {
  const wiki = WIKILINK.exec(url);
  if (wiki) {
    void app.workspace.openLinkText(wiki[1] ?? "", sourcePath, "tab");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
```

Register in both views' `onOpen`, after the editor is created:

```ts
    this.editor.onOpenLink((url) => openLinkFromMap(this.app, url, this.file?.path ?? ""));
```

- [ ] **Step 5: Verify and commit**

Run: `just check` (all tests, lint, typecheck, build).

```bash
git add packages/core/src/markdown/inlineMarkdown.ts packages/core/src/editor/Editor.ts packages/core/src/__tests__/inline-markdown.test.ts packages/core/src/__tests__/editor.test.ts packages/web/src/components/MindMapCanvas.tsx packages/web/src/App.tsx packages/obsidian/src/openLink.ts packages/obsidian/src/LimnView.ts packages/obsidian/src/markdown/LimnMarkdownView.ts packages/obsidian/src/__tests__/open-link.test.ts
git commit -F - <<'MSG'
Render wikilinks as links and open them through the host

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

### Task 14: Docs: OBSIDIAN-PLUGIN.md, ONBOARDING.md, manual checklist

**Files:**
- Modify: `OBSIDIAN-PLUGIN.md`
- Modify: `ONBOARDING.md` (Key paths)

- [ ] **Step 1: `OBSIDIAN-PLUGIN.md`**

- Intro paragraph: add that Markdown notes can also be opened as mind maps: their nested bullet lists are the map, and edits go back into the note.
- Under "Key classes", add:
  - **LimnMarkdownView** extends `TextFileView`. Shows a note's bullet lists as a map; the base class handles loading, saving (2 s debounce), own-write echo suppression, and the three-way merge with edits from other panes. `OutlineDocument` converts between note text and the Editor; `ObsidianOutlineAssetProvider` stores images as vault attachments; routing lives in `markdown/routing.ts` and `markdown/leafRouting.ts` (a `WorkspaceLeaf.setViewState` wrapper, removed on unload).
- New section "## Markdown-backed mind maps" with subsections:
  - **Opening**: notes with `limn-plugin: true` in frontmatter open as a map by default (setting "Open notes with limn-plugin: true as"); any note can be opened either way from the file or editor context menu, the pane menu, or the commands "Open as mind map" / "Open as Markdown"; "Create new mind map note"; "Add mind map marker to note".
  - **What the note stores**: every top-level bullet is a root; `-` open, `*` collapsed; multi-line node text as backslash-continued lines; images as `![[file|WxH]]` embeds on the item's last line; everything that is not a list is preserved verbatim; ordered lists, code fences, and `%%` blocks are prose. First save normalizes list formatting (indent, markers, blank lines between items). Positions, side, width, and colors are not stored: layout is computed, all children on the right, and the nudge, side flip, width resize, and color actions are off in this view (they are hidden from the `?` help too).
  - **Links**: `[[wikilinks]]` (with or without alias) show as links; `Cmd+Enter` on the node or `Cmd+Click` on the link opens the note in a new tab. Tags, tasks, and other inline syntax pass through as text.
  - **Images**: paste or drop; the file lands in the vault's attachment folder and the note gets `![[Pasted image ....png|WxH]]`. Bare embeds draw at natural size (capped at 300 px) without changing the note; resizing writes the size.
  - **Two panes**: same note as Markdown and as map at once is fine; changes cross over after each side's save. Undo in the map is separate from the editor's undo and is cleared when an external change arrives.
- Under "Unit tests", add: outline document round trip and save signal, asset provider, routing decision and `setViewState` wrapper, commands, settings.
- Under "Manual testing checklist", add:
  ```
  - [ ] Click a note with `limn-plugin: true`: opens as a map. Click an unmarked note: opens as Markdown.
  - [ ] Pane menu "Open as Markdown" and editor context menu "Open as mind map" switch the same pane both ways; the choice sticks for that note in that pane
  - [ ] Two panes on one note (map + Markdown): edit in each, see the other update within ~2 s
  - [ ] While editing a node in the map, edit a different line in the Markdown pane: both edits survive
  - [ ] Paste an image into a map node: attachment created, note gets the embed, image shows after reload
  - [ ] Collapse a node: note line switches `-` to `*`; reading view still renders one list
  - [ ] A node containing `[[Another note]]`: shows as a link; Cmd+Enter opens that note in a new tab
  - [ ] Setting "Open notes with limn-plugin: true as: Markdown": marked notes open as Markdown; "Open as mind map" still works
  - [ ] Disable the plugin: open map panes turn back into Markdown panes
  ```

- [ ] **Step 2: `ONBOARDING.md`**

In "Key paths" add `packages/obsidian/src/markdown/` (Markdown-backed mind map view, routing, commands) and `packages/core/src/markdown/outline.ts` (outline codec) if not already listed.

- [ ] **Step 3: Commit**

```bash
git add OBSIDIAN-PLUGIN.md ONBOARDING.md
git commit -F - <<'MSG'
Docs: Markdown-backed mind maps in the Obsidian plugin

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
MSG
```

---

## What plan 3 will consume from this plan

- Web/desktop clipboard (plan 3): nothing new beyond plan 1's `writeSubtree`/`parseSubtree`/`outlineToFileNodes`; `attachImageFile` (Task 4) is the pattern for a paste handler that lives in `packages/web/src/assets/` and is shared with Obsidian.
