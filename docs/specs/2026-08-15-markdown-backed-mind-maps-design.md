# Markdown-backed mind maps (Obsidian) - design

Status: draft for review. Origin: GitHub issue #8. Findings brief: `.llm/issue-8-markdown-sync-findings.html` (gitignored, local).

## 1. Summary

Let a Limn mind map be a live, bidirectional view over an ordinary Obsidian note. The note's nested bullet lists are the map; text, hierarchy, and order round-trip losslessly; presentation is computed on load. The map view is a `TextFileView` subclass in the Obsidian plugin; notes marked `limn-plugin: true` in frontmatter open in it by default, and any note can be opened in it on demand. Core gains a Markdown outline codec, a deterministic full layout, and a `DocumentCapabilities` descriptor that turns off the handful of actions a plain list cannot hold. Web and desktop get copy/paste of Markdown outlines from the same codec.

## 2. Decisions (settled in discussion, 2026-08-15)

| Topic | Decision |
|---|---|
| Scope | Whole note. Every top-level list item in the note is a root. Non-list content is preserved verbatim and spliced back in place on write. |
| Marker | `limn-plugin: true` in frontmatter. Means "default view is the map". The map view is usable on any note without the marker. |
| Side rule | All root children on the right. Side is never stored; side-changing actions are no-ops in this mode. |
| Collapse | Bullet marker carries it: `- ` open, `* ` collapsed. `+ ` is read as open and never written. |
| Multi-line text | Allowed. Written as continuation lines indented to the item's content column, each non-final line ending in a backslash. |
| Images | In v1. Vault attachments plus `![[file.png|width]]` embeds. |
| Mode surface | Blocked: free drag offsets, nudge, side flip, width resize, node color cycling. Session-only: camera, selection. Unchanged: all structural and text actions, undo/redo, image paste/drop and image resize, reflow. Theme is a plugin-level setting. |
| Concurrency | Rely on `TextFileView`'s built-in echo suppression and three-way merge (verified in Obsidian 1.13.7 source). No CRDT. |
| Web/desktop | Copy subtree as Markdown and paste a Markdown list as a subtree ship with this work. Import/export follow. No live `.md` maps in desktop. |
| Naming | View type `limn-markdown-view`. Commands "Open as mind map", "Open as Markdown", "Create new mind map note", "Add mind map marker to note". Setting "Open notes with `limn-plugin: true` as: Mind map / Markdown". Core type `DocumentCapabilities`. Codec in `packages/core/src/markdown/outline.ts`. |

## 3. Non-goals

- Mapping one list inside a mixed note (section-anchored maps). The codec is written to operate on regions so this can be layered on later, but it is not built.
- Persisting positions, sides, widths, or per-node colors in the note (no hidden payload, no per-line ids).
- Per-note theme in frontmatter.
- Rendering maps inline in the Markdown editor (code block or live-preview widget).
- Changes to the `.limn` file format. Schema stays at version 1.

## 4. Verified facts the design relies on

From the extracted Obsidian 1.13.7 app bundle (see findings brief, section 5b):

- `TextFileView` registers `vault.on("modify")` itself. On a modification to its file it re-reads and, unless the text equals the last text it saved (own-write echo), calls `setViewData(text, false)`. If the view is dirty and its `getViewData()` differs from the last saved text, it first three-way merges (diff-match-patch: the patch from last-saved to `getViewData()` is applied to the incoming text), shows a "file changed" notice, then delivers the merged text. `save()` writes only if `getViewData()` differs from the last saved text. `requestSave()` marks dirty and debounces `save()` by 2 s. `onUnloadFile` saves. `isPlaintext` defaults to `true` and must stay true for the merge to run.
- `ListItemCache.position` for an item excludes its nested lists. `parent` is the parent item's start line, or the negative start line of the list for root items.
- Obsidian's metadata cache and reading view use legacy remark-parse (`commonmark: true`, pedantic off). A change of bullet marker between siblings ends the list; nested items still resolve to the correct parent, top-level items with different markers become separate sections, and reading view emits adjacent `<ul>` elements. Live preview shows one list.
- `registerExtensions(["md"], ...)` throws. `WorkspaceLeaf.openFile` picks the view type from the extension, unless the leaf's current view is a `FileView` whose `canAcceptExtension` accepts it, then calls `setViewState({type, state: {file}})`. Kanban, Excalidraw, and Enhancing Mindmap all route marked notes by patching `WorkspaceLeaf.prototype.setViewState`.

## 5. The outline dialect

This is the contract between the note and the map. Everything else in the design is derived from it.

### 5.1 Structure

- The note body (after frontmatter) is a sequence of regions: prose regions and list regions.
- A list region is a maximal run of bullet lines and their continuation lines. Blank lines between bullet lines stay inside the region. Any other line (a non-blank line that is neither a bullet nor an indented continuation, or a blank line followed by such a line) ends the region and starts prose.
- A bullet line matches `^(indent)([-*+])[ \t]+(content)$`. Ordered lists (`1.` / `1)`) are prose, not map content.
- Depth comes from indent width relative to enclosing items (tab counts as 4 columns). A stack of open items is kept: greater indent than the top means child, equal means sibling, less pops until it fits.
- Prose regions are preserved byte-for-byte. Fenced code blocks (```` ``` ```` or `~~~`) and comment blocks are opaque: nothing inside them is a bullet. A comment block is delimited by lines that are exactly `%%`, so an inline `%% ... %%` on a content line is plain text.
- A fenced block that starts on an item's continuation line belongs to that item's text instead of being opaque prose: every following line is part of the item, bullets included, until a line with the same fence marker closes it, and the writer writes the pair back as a balanced fence. Lines inside the block are code: they are read and written verbatim, with no escapes, no hard-break markers, and trailing whitespace kept, and the line just before the opener keeps a literal trailing backslash. A fence that is never closed runs to the end of the note, which is how Obsidian renders it too. A fence opener the parser cannot read back this way, because it is unbalanced or because it falls on the item's first line, is escaped on write like any other line.
- Every top-level item across all list regions is a root, in document order.

### 5.2 Node text

- Single-line text is the item content after the marker, trimmed of trailing whitespace.
- Continuation lines: a non-blank, non-bullet line belongs to an open item when its indent is at least that item's canonical content column, `2 * depth + 2`. The deepest open item that fits takes the line, so a line may continue an ancestor and close the items below it. The item's own content column in the source only decides how much indent is stripped from the line. On parse, a trailing backslash or two trailing spaces on the previous line is removed and lines are joined with `\n`. Unindented (or under-indented) non-bullet lines are not continuation text; they end the list region and are prose. This deviates from CommonMark's lazy continuation on purpose: the line stays in the file untouched and Obsidian keeps rendering it as it did, the map simply does not show it as node text.
- On write, multi-line text becomes: first line on the bullet line ending with `\`, each further line indented to the content column, each non-final line ending with `\`. Runs of blank lines inside node text collapse to a single line break, except inside a balanced fence, where blank lines are code and are kept, and where no `\` markers are added.
- Escapes on write, applied to every line of node text, only when the line would otherwise be misparsed: a line starting with `- `, `* `, `+ `, `# ` (any number of `#` then a space), `> `, or a fence opener (three backticks or three tildes) gets a backslash before its first character; a line starting with `digits.` or `digits)` followed by a space gets a backslash before the `.` or `)`; a line consisting only of three or more `-`, `*`, or `_` gets a backslash before its first character. A line that already carries an escape the parser would strip, a leading backslash or a backslash between the digits and the `.` or `)`, gets one more backslash, so escaping and unescaping stay inverses at any depth. On parse, exactly those escapes are removed. Nothing else is escaped, so `#tag`, `[[links]]`, `[ ] task`, and inline markdown pass through untouched.
- Task syntax (`[ ] `, `[x] `), tags, wikilinks, and any other inline syntax are plain text to the map and round-trip unchanged. The inline renderer learns `[[wikilink]]` and `[[wikilink|alias]]` so they display cleanly and `Cmd+Enter` can open them.

### 5.3 Collapse

- Write `* ` for a node that is collapsed and has children; write `- ` otherwise.
- Read `* ` on an item with children as collapsed. `+ ` and `* ` on a leaf are read as open.

### 5.4 Images

- A node with an image writes an embed as its last line (after any text lines, indented to the content column when there is text): `![[filename|WxH]]` when the height is known, `![[filename|W]]` when only the width is known, and `![[filename]]` when the size is unknown. A dimension the note did not specify is stored as 0 until the host resolves the image's natural size (see 8.3), and a stored 0 is written back as unknown. An image-only node writes the embed as the item content.
- On parse, an item whose last line is exactly an embed `![[target]]` or `![[target|W]]` or `![[target|WxH]]` yields `image = { assetId: target, width, height }`. Height comes from `WxH` if present, otherwise from the loaded image's aspect ratio (see 8.3). Any other embed position is plain text.
- Only `![[...]]` wikilink embeds are recognized. Markdown-style `![alt](path)` stays text.

### 5.5 Normalizations on write

The writer regenerates list regions from the model. It preserves prose regions exactly, and it preserves the marker style (`-` vs `*`) only as the collapse bit. The following user formatting inside list regions is normalized on the first write: bullet character other than the collapse convention, indent width (two spaces per level, content column aligned), blank lines between items (removed), lazy continuation lines (indented and given a backslash), ordered numbering (not applicable; ordered lists are prose). This is a known cost of "regenerate the region"; the alternative (line-level mutations) is deferred. Line endings are not normalized: a note written with CRLF is written back with CRLF.

### 5.6 New and removed roots

- The parser records which list region each root came from. On write, each region is regenerated from the roots that still belong to it, in root order.
- Roots that were created in the map (new roots, `detachToRoot`) are appended to the last list region. If the note has no list region, one is appended at the end of the note after a blank line.
- A region whose roots have all been deleted is written as empty and its surrounding prose is untouched.

## 6. Core changes (`packages/core`)

### 6.1 Outline codec: `src/markdown/outline.ts`

Pure functions, no browser dependencies:

- `parseOutline(text: string): ParsedOutline` where `ParsedOutline = { frontmatterLines: string[]; regions: OutlineRegion[] }`, `OutlineRegion = { kind: "prose"; lines: string[] } | { kind: "list"; roots: OutlineNode[] }`, `OutlineNode = { text: string; collapsed: boolean; image?: OutlineImage; children: OutlineNode[] }`, and `OutlineImage = { target: string; width?: number; height?: number }`.
- `writeOutline(parsed: ParsedOutline): string` regenerates the note from the model. `writeOutline(parseOutline(x))` is idempotent for any `x`.
- `outlineRoots(parsed: ParsedOutline): OutlineNode[]` flattens list regions' roots in document order.
- Helper functions: `writeNodes(nodes, depth?): string[]`, `writeSubtree(nodes): string`, `parseSubtree(text): OutlineNode[]`, `escapeLine(line)`, `unescapeLine(line)`.
- Conversion helpers between `OutlineNode` trees and `MindMapFileNode` trees: `outlineToFileNodes(nodes, nextId): MindMapFileNode[]` assigns placeholder positions and sizes; `fileNodesToOutline(nodes): OutlineNode[]` reads text, collapsed, image.
- `OUTLINE_IMAGE_UNKNOWN_SIZE = 0` is stored for an embed dimension the note did not specify; hosts resolve the natural size before the first write.
- `Editor.toMarkdown()` and `serialization.toMarkdown()` change to emit the pure-list dialect (they currently emit headings for depth 0 and 1 and are only used by tests). Tests updated.

### 6.2 `DocumentCapabilities`

```ts
export interface DocumentCapabilities {
  freePosition: boolean;   // free drag offsets, nudge, setNodePosition
  sides: boolean;          // left-side children, side flip
  widthResize: boolean;    // widthConstrained resize (handle and keys)
  nodeColor: boolean;      // cycleNodeColor / setNodeColorIndex
  collapsePersisted: boolean; // informational for hosts; Editor behavior unchanged
}
export const FULL_CAPABILITIES: DocumentCapabilities = { all true };
export const OUTLINE_CAPABILITIES: DocumentCapabilities = { freePosition: false, sides: false, widthResize: false, nodeColor: false, collapsePersisted: true };
```

- `Editor.setCapabilities(caps)`, `Editor.getCapabilities()`. Default `FULL_CAPABILITIES`. Loading a document does not change capabilities; the host sets them once when it creates the Editor for a given backing document.
- Enforcement in Editor (no-ops when the capability is off): `nudgeNode`, `setNodePosition`, `resizeNode`, width-resize drag (`startWidthResize` returns early), `cycleNodeColor`, `setNodeColorIndex`, `flipBranchSide` (private, reached via `moveNode`). `addChild(parent, text, direction)` forces `direction = 1` when `sides` is off. `endDrag` with no reorder or reparent snaps the node back (relayout) when `freePosition` is off. `moveNodeVertical` and `indentNode` same-side filters are unaffected because all children are on one side.
- After every structural or text mutation, when `freePosition` is off, the Editor runs `relayoutAll()` (6.3) instead of the incremental relayout, so the map is always in canonical layout. Undo/redo restores a snapshot and then relayouts, so snapshot positions are irrelevant.
- `dispatch.ts`: `KeyBinding` gains optional `requires?: keyof DocumentCapabilities`; `dispatch` skips bindings whose capability is off. Bindings marked: nudge (`Ctrl+arrows/hjkl`), resize (`Ctrl+Alt+Left/Right`, `Ctrl+Alt+h/l`), color (`c`, `Shift+c`). Side-related bindings (`Shift+Tab` on a root, `Alt+Left/Right` toward a root) do not need marking because the Editor reinterprets them.
- `shortcutHelp.ts`: `ShortcutEntry` gains the same optional `requires`; `ShortcutsDialog` filters by the Editor's capabilities. Mouse entries for the resize handle likewise.
- Web `MindMapCanvas`: hide the width-resize handle when `widthResize` is off. Drag remains enabled (reorder and reparent still work).

### 6.3 Deterministic full layout: `relayoutAll()`

- Public Editor method. For each root in root order: `remeasure` (already done by hosts after load), `reflowSubtree` with all children forced to the right, `relayoutSubtree`, then place the root: first root at (0, 0); each subsequent root below the previous root's subtree bounding box plus `TREE_PADDING`. Collapsed subtrees are laid out too (their nodes are positioned even though hidden), which is a small change to `relayoutSubtree`'s early return.
- Deterministic for a given text measurer. Positions differ across hosts (fonts) and are never persisted in this mode.
- Also useful outside this feature as an "auto-arrange everything" action; not bound to a key in this work.

### 6.4 Id reconciliation for external updates

- `reconcileIds(store: MindMapStore, incoming: MindMapFileNode[]): MindMapFileNode[]` walks both forests in parallel per parent, matching children first by exact text (first unused sibling), then by index. Matched incoming nodes take the existing id and recursion continues; unmatched get the fresh ids they arrived with.
- `Editor.applyExternalUpdate(data, options: { reconcileIds?: boolean })` takes an optional `reconcileIds` flag (defaults to false). When true, calls `reconcileIds` internally so selection and edit mode survive an external change that did not touch the selected node.
- The Obsidian adapter passes `{ reconcileIds: true }` when applying external updates.

### 6.5 Change signal for saves

- `Editor.notify()` stays a single channel. Hosts that only want document changes compare serialized text (cheap for outline-sized documents). No new API in v1. If profiling shows a cost, add a `docVersion` counter later.

## 7. Obsidian plugin changes (`packages/obsidian`)

### 7.1 `LimnMarkdownView extends TextFileView`

- `getViewType()` returns `limn-markdown-view`; `canAcceptExtension(ext)` returns `ext === "md"`; icon `git-branch`; display text is the note's basename.
- Owns one `Editor` created with `OUTLINE_CAPABILITIES`, the shared `ObsidianTextMeasurer`, and mounts the shared `LimnViewRoot` (extracted from `LimnView.ts` into its own module so both views use it).
- `setViewData(text, clear)`: `parsed = parseOutline(text)`; convert to `MindMapFileFormat` with placeholder positions; if `clear` then `editor.loadJSON(...)` else `editor.applyExternalUpdate(reconciled)`; store `parsed.frontmatter` and `parsed.regions` plus the root-to-region map; `remeasureAllNodes()`; `relayoutAll()`; kick off image size resolution (8.3). If `clear`, also reset camera to fit.
- `getViewData()`: `writeOutline(currentParsed)` where `currentParsed` is rebuilt from the Editor's roots plus the stored prose regions and root-to-region map. Must be deterministic and cheap; called by the base class on save and on external change.
- `clear()`: `editor.clear()`, drop regions and image cache.
- Save wiring: subscribe to the Editor; on every notification, if `getViewData() !== this.data` call `this.requestSave()`. This keeps the base class's `dirty` flag in step with real document changes, which is what makes the base three-way merge protect in-progress edits. Camera and selection changes produce identical text and cause no write. `Cmd+S` (`editor.onSave`) calls `this.save()`.
- Do not override `onModify`, `onLoadFile`, or `onUnloadFile`; the base class behavior is the sync design.
- No `AutoSaveController` in this view; `requestSave` is the debounce.
- Theming: `contentEl.addClass("limn-view")` as `LimnView` does; theme mode follows the plugin setting (system by default).
- Pane menu (`onPaneMenu`): "Open as Markdown".

### 7.2 Routing marked notes

- Add `monkey-around` as a dependency (the same helper Kanban and Excalidraw use).
- Patch `WorkspaceLeaf.prototype.setViewState`: if `plugin._loaded`, `state.type === "markdown"`, the target file has `limn-plugin` in `metadataCache.getCache(path)?.frontmatter`, the plugin setting says map, and `fileModes[leaf.id ?? path] !== "markdown"`, rewrite `state.type = "limn-markdown-view"`. Conversely, if `state.type === "limn-markdown-view"` and the file lacks the marker and `fileModes[...] !== "limn-markdown-view"`, rewrite to `"markdown"` (covers the `canAcceptExtension` shortcut where a map leaf opens an unmarked note).
- Patch `detach` to delete the leaf's `fileModes` entry.
- On plugin load: sweep open leaves and re-route those showing marked notes in `MarkdownView` (deferred leaves route themselves when loaded). On unload: switch every `limn-markdown-view` leaf back to `markdown` and remove the patches (monkey-around returns uninstallers).

### 7.3 Commands, menus, settings

- `open-as-mindmap`: for the active Markdown leaf on a `.md` file: `await view.save()`, set `fileModes[leaf.id] = "limn-markdown-view"`, `leaf.setViewState({type: "limn-markdown-view", state: leaf.view.getState()})`. Does not modify the note.
- `open-as-markdown`: mirror image from a map leaf; sets `fileModes[leaf.id] = "markdown"`.
- `create-mindmap-note`: creates `Untitled.md` (or the next free name) in `fileManager.getNewFileParent(activeFile?.path ?? "")` with content `---\nlimn-plugin: true\n---\n` and opens it in the map view.
- `add-mindmap-marker`: `fileManager.processFrontMatter(file, fm => { fm["limn-plugin"] = true })` on the active note.
- `file-menu` and `editor-menu`: "Open as mind map" for `.md` files; "Open as Markdown" for map leaves.
- Settings tab (new): "Open notes with `limn-plugin: true` as" (Mind map / Markdown, default Mind map) and "Theme" (System / Light / Dark, default System). The existing `.limn` view keeps its per-file theme behavior.
- Existing `create-new` (`.limn`) command is renamed in the palette to "Create new mind map file (.limn)" so the two are distinguishable.

### 7.4 Assets

- In this view an asset id is the embed target (the attachment's basename), so `ImageRef.assetId` is exactly what gets written inside `![[...]]`.
- `ObsidianOutlineAssetProvider` implements the asset half of `PersistenceProvider` (`load`/`save` are unused by this view) plus one extra method used only by the Obsidian paste/drop handler:
  - `reserveAssetPath(filename): Promise<string>`: `fileManager.getAvailablePathForAttachment(filename, notePath)`, returns the chosen basename (Obsidian may add a suffix on collision).
  - `saveAsset(assetId, blob)`: writes the blob to the reserved path for that basename with `vault.createBinary`.
  - `loadAssetUrls(ids)`: for each id, `metadataCache.getFirstLinkpathDest(id, notePath)`; if found, `vault.getResourcePath(file)`.
  - Paste/drop flow: read the image's natural size, `target = await reserveAssetPath(suggestedName)`, `await saveAsset(target, blob)`, `editor.setNodeImage(nodeId, {id: target, filename: target, mimeType, width, height}, displayW, displayH)`.
- Paste and drop handling for images is added to the Obsidian view (today it exists only in web `App.tsx`), sharing the image-loading helper with web.

## 8. Behavior details

### 8.1 Opening and switching

- Click a marked note anywhere in Obsidian: opens as a map. Click an unmarked note: opens as Markdown. Same leaf, next file: routes per the marker of the new file (both-direction patch).
- "Open as Markdown" sticks for that leaf until it is closed. Removing the marker in Markdown view changes the default for the next open; an already open map keeps working.
- Two panes on the same note (one map, one Markdown) are supported. Edits flow through the vault: Markdown to map after Obsidian's save (2 s debounce, or immediately on leaf change), map to Markdown after the map's save (2 s debounce). Concurrent divergent edits inside one window are merged by the base class; a true conflict on the same line resolves toward the incoming text (diff-match-patch patch failure leaves the incoming text), and the user sees Obsidian's "file changed" notice.

### 8.2 Editing in the map

- All structural and text operations behave as in `.limn` files. Positions are always canonical: after any change the whole forest is relaid out.
- Drag: dragging a node still reorders among siblings and reparents onto a target; releasing anywhere else snaps back.
- Blocked actions do nothing and do not appear in the shortcut help.
- Collapse toggles are document changes (they change the marker) and are saved.
- Undo/redo is the map's own; Obsidian's Markdown undo is separate, as with Kanban.

### 8.3 Image size resolution

- On parse, an embed with `|W` only has no height, and a bare embed has neither. An unspecified dimension is stored as 0. The view resolves each image's natural size once per session (`Image` load from the resource URL, cached by target) and calls `editor.setNodeImage` with the resolved size, before the first write. The resulting write is identical text, so no save is triggered.
- Image resize in the map updates `W` in the embed.

### 8.4 Empty and odd notes

- Empty note or frontmatter only: empty canvas; the first root becomes the first list region.
- A marked note with only prose: empty canvas over preserved prose; the first root is appended after the prose.
- Nodes with empty text and no image are not written (they are transient during editing); a node that has children but empty text is written as `- ` so structure is not lost.
- Bullets inside fenced code or `%%` blocks are prose.

## 9. Web and desktop (`packages/web`, `packages/desktop`)

- `Cmd+C` with a selected node and not editing: clipboard `text/plain` is `serializeSubtree(node)`. Nested `.limn` JSON is not put on the clipboard in this work.
- `Cmd+V` with `text/plain` and not editing: if the text parses to at least one bullet line, parse and add the resulting nodes as children of the selected node (or as roots at the paste position when nothing is selected), with new ids and computed positions. Plain text without bullets pastes as a single child node whose text is the pasted text. Image clipboard items keep their current behavior and take precedence.
- Both hosts keep `FULL_CAPABILITIES`; nothing else changes for `.limn` documents.
- Markdown import (open a `.md` outline as a new `.limn`) and export (hamburger menu) are follow-ups and reuse the codec unchanged.

## 10. Testing

- Core, vitest, TestEditor:
  - Golden fixtures for the dialect under `packages/core/src/markdown/fixtures/`: nested lists, mixed markers, continuation lines (backslash and two-space; an unindented lazy line that must land in prose), escapes, embeds (all three forms), tasks and wikilinks as text, prose regions before/between/after lists, fenced code containing bullets, `%%` blocks, ordered lists as prose, empty note, frontmatter only.
  - Round-trip laws: `writeOutline(parseOutline(x)) === writeOutline(parseOutline(writeOutline(parseOutline(x))))` for every fixture (idempotence), and `parseOutline(writeOutline(p))` equals `p` structurally for every fixture.
  - Capability tests: run the complete action inventory (every `dispatch` binding and every public mutator) against a TestEditor with `OUTLINE_CAPABILITIES`; assert blocked actions leave the document unchanged and allowed actions match `FULL_CAPABILITIES` results modulo positions.
  - `relayoutAll` determinism and root stacking; collapsed subtrees still positioned.
  - `reconcileIds` keeps ids for unchanged nodes and selection survives an external update.
- Obsidian, vitest with the existing mocks: `setViewData`/`getViewData` round trip; `requestSave` called only when text changes (camera and selection changes do not save); routing patch decisions given a fake leaf, frontmatter, setting, and `fileModes`; commands add the marker and create notes in the right folder.
- Web: copy/paste through the keyboard handler with a clipboard stub.
- Playwright: one visual regression of a map note (optional; layout is host-font dependent, so keep it to a single fixture).
- Manual checklist added to `OBSIDIAN-PLUGIN.md`: click routing, both-direction toggle, two panes, external edit while editing a node, image paste, reading-view look of a collapsed `*` item among `-` siblings.

## 11. Risks and mitigations

- Prototype patching may be flagged by the community plugin scorecard. Kanban and Excalidraw ship the same patch and are listed; keep the patch minimal, uninstall it on unload, and document it in the review notes. Do not disable popout-safety lint rules to make it pass (see repo memory).
- Reading view renders a collapsed `*` sibling as the start of a new list, which may show list-margin spacing. Verify visually; if unacceptable, switch collapse to a trailing `%%fold%%` comment (writer and parser change only).
- First write normalizes list formatting in the note (5.5), and lazy continuation lines are treated as prose rather than node text (5.2). Documented; the alternative (line-level edits and full CommonMark block rules) is a later optimization.
- Layout depends on the host font measurer; positions are never persisted in this mode, so this is invisible to users, but the visual regression suite must pin one host.
- Base-class merge is character-level; a bad merge is possible when both panes edit the same line inside one debounce window. Same exposure as any two Markdown panes today.

## 12. Rollout

Suggested phase order for the implementation plan (each phase green and committed before the next):

1. Core codec (`outline.ts`), fixtures, round-trip tests; replace `toMarkdown`.
2. `DocumentCapabilities`, Editor enforcement, dispatch and shortcut-help gating, `relayoutAll`, `reconcileIds`, tests.
3. Obsidian `LimnMarkdownView` with `setViewData`/`getViewData`, save wiring, shared `LimnViewRoot`; routing patch; commands, menus, settings; tests and manual checklist.
4. Images: asset provider, paste/drop in the Obsidian view, size resolution.
5. Web/desktop copy and paste.
6. Docs: README, OBSIDIAN-PLUGIN.md, release notes; reply on issue #8 (Ted).
