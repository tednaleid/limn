# PROGRESS.md

## Current status

**Phase**: All chunks complete (1-17), plus post-spec polish
**Last updated**: 2026-02-26
**Tests**: 229 passing across 12 test files, lint clean

---

## Completed chunks

### Chunk 1: Project scaffold (2026-02-26)

**What was done:**
- Bun workspace monorepo with `packages/core/` and `packages/web/`
- TypeScript strict mode with composite project references
- Vitest configured for core package with workspace config
- Vite + React 19 configured for web package
- ESLint with typescript-eslint strict rules
- Smoke test passing in core

**Files changed:**
- `package.json` -- root workspace config with scripts
- `tsconfig.json` -- root TS config with strict mode and project references
- `vitest.workspace.ts` -- vitest workspace definition
- `eslint.config.js` -- eslint flat config with typescript-eslint
- `.gitignore` -- updated with node_modules, dist, tsbuildinfo
- `packages/core/` -- package.json, tsconfig, vitest.config, src/index.ts, smoke test
- `packages/web/` -- package.json, tsconfig, vite.config, index.html, src/main.tsx, src/App.tsx

**Tests added:**
- 1 smoke test (core exports VERSION string)

**Notes/decisions:**
- Vitest 4.x does not need `--project` filter; `vitest run` picks up workspace config automatically

### Chunk 2: Data model (2026-02-26)

**What was done:**
- Core types: MindMapNode, MindMap, MindMapMeta, Camera, Asset, ImageRef, NodeStyle, TextMeasurer
- MindMapStore with flat Map storage and full tree operations
- Operations: addRoot, addChild, insertChild, deleteNode, setText, setNodePosition, setNodeWidth, toggleCollapse, moveNode (reparent), reorderNode
- Traversal: getChildren, getParent, getSiblings, getRoots, getAncestors, getVisibleNodes, isDescendant
- Invariant enforcement: cycle prevention on reparent, subtree deletion, orphan cleanup

**Files changed:**
- `packages/core/src/model/types.ts` -- all data model interfaces
- `packages/core/src/store/MindMapStore.ts` -- flat store with tree operations
- `packages/core/src/index.ts` -- re-exports types and store
- `packages/core/vitest.config.ts` -- exclude dist/ from test discovery
- `eslint.config.js` -- fix dist/ glob pattern

**Tests added:**
- 46 unit tests covering all store operations, tree traversal, edge cases, multi-root

---

## Chunk details

### Chunk 3: Serialization (2026-02-26)

**What was done:**
- Zod schema for .mindmap file format validation
- Serialize: flat MindMapStore to nested JSON file format
- Deserialize: nested JSON file format to flat MindMapStore
- Round-trip preserves structure, positions, collapsed state, widthConstrained
- Markdown export (H1 for roots, H2 for depth 1, bullets for deeper)
- File format types (MindMapFileNode, MindMapFileFormat)
- Added loadNode/addRootId methods to MindMapStore for deserialization

**Files changed:**
- `packages/core/src/serialization/schema.ts` -- zod schema and file format types
- `packages/core/src/serialization/serialization.ts` -- serialize, deserialize, toMarkdown, validateFileFormat
- `packages/core/src/store/MindMapStore.ts` -- added loadNode, addRootId
- `packages/core/src/index.ts` -- re-exports serialization module

**Tests added:**
- 24 unit tests covering deserialize, serialize, round-trip, validation, markdown export

### Chunk 4: Editor + TestEditor (2026-02-26)

**What was done:**
- Editor class wrapping MindMapStore with selection, nav/edit mode state machine, undo/redo
- Snapshot-based undo/redo (captures full document state at each mutation)
- Key-to-action dispatch table in `core/src/keybindings/dispatch.ts`
- TestEditor extends Editor with pressKey() and assertion methods
- All keyboard shortcuts from spec implemented: Tab, Enter, Escape, Backspace, Space, Shift+Enter, Cmd+Z, Shift+Cmd+Z, Cmd+Up/Down
- Empty node cleanup on Escape (exit edit mode with empty text deletes the node)
- Simple position heuristics for new children and siblings
- Stub TextMeasurer for tests (character-count-based estimates)

**Files changed:**
- `packages/core/src/editor/Editor.ts` -- Editor class
- `packages/core/src/keybindings/dispatch.ts` -- key-to-action dispatch
- `packages/core/src/test-editor/TestEditor.ts` -- TestEditor for testing
- `packages/core/src/index.ts` -- re-exports editor, dispatch, TestEditor
- `eslint.config.js` -- allow non-null assertions in test files

**Tests added:**
- 40 unit tests covering selection, edit mode, addChild, deleteNode, undo/redo, keyboard dispatch, empty node cleanup, setText, toggleCollapse

**Notes/decisions:**
- Undo uses full-state snapshots rather than fine-grained diffs for initial simplicity; can optimize later if performance requires it
- Empty node cleanup on Escape is not tracked by undo (it's part of the exit-edit-mode flow, not a separate user action)

### Chunk 5: Layout engine (2026-02-26)

**What was done:**
- Incremental layout engine with horizontal placement (H_OFFSET=250) and vertical centering (V_GAP=20)
- subtreeHeight computes visible subtree space (respects collapsed state)
- branchDirection infers left/right from stored positions
- positionNewChild and positionNewSibling place new nodes and re-center siblings
- centerChildren distributes children around parent's visual center
- shiftSubtree moves entire subtrees as rigid units
- relayoutFromNode walks up to root re-centering at each level
- relayoutAfterDelete re-centers after node removal
- treeBoundingBox and resolveTreeOverlap push root trees apart when they overlap
- Integrated layout into Editor: addChild, addSibling, deleteNode, toggleCollapse
- Fixed ID collision bug: loadNode now advances ID counter past loaded numeric IDs

**Files changed:**
- `packages/core/src/layout/layout.ts` -- incremental layout engine
- `packages/core/src/editor/Editor.ts` -- integrated layout calls into mutations
- `packages/core/src/store/MindMapStore.ts` -- loadNode advances ID counter past loaded IDs
- `packages/core/src/index.ts` -- re-exports layout functions

**Tests added:**
- 13 layout tests: horizontal placement, vertical centering, sibling shifting on add/delete, collapsed subtree handling, rigid subtree shifting, left-side branches, cross-tree overlap

**Notes/decisions:**
- Centering uses parent's visual center (parent.y + parent.height/2), not parent.y
- Branch direction for first child inferred from parent's branch direction (supports left-side trees)
- ID collision fix critical: without it, addChild after deserialization could overwrite existing nodes

### Chunk 6: SVG renderer (2026-02-26)

**What was done:**
- Added change subscription system to Editor (subscribe/getVersion for useSyncExternalStore)
- Added camera state to Editor (getCamera/setCamera) with load from file format
- Created React hooks: useEditor (subscribes to Editor state), EditorContext
- Created SVG NodeView component (rounded rect + text, selected state highlight, collapse indicator)
- Created SVG EdgeView component (cubic bezier curves connecting parent edge center to child edge center)
- Created MindMapCanvas component with pan/zoom viewport (scroll to pan, Cmd+scroll to zoom)
- Wired everything up in App.tsx with a demo mind map
- Click-to-select working, pan/zoom working

**Files changed:**
- `packages/core/src/editor/Editor.ts` -- added camera, subscribe/notify, version counter
- `packages/web/src/hooks/useEditor.ts` -- EditorContext and useEditor hook
- `packages/web/src/components/NodeView.tsx` -- SVG node rendering
- `packages/web/src/components/EdgeView.tsx` -- SVG edge rendering
- `packages/web/src/components/MindMapCanvas.tsx` -- SVG viewport with pan/zoom
- `packages/web/src/App.tsx` -- wired up with demo data

**Tests added:**
- Visual verification via dev server (Playwright visual regression deferred to styling chunk)

**Notes/decisions:**
- Using useSyncExternalStore pattern: Editor.subscribe() + Editor.getVersion() as snapshot
- Camera state is session-only (not tracked by undo), loaded from file format on loadJSON
- Pan: scroll wheel or pointer drag on canvas background
- Zoom: Cmd/Ctrl + scroll wheel, zooms toward cursor position

### Chunk 7: Node styling (2026-02-26)

**What was done:**
- Global CSS reset (box-sizing, margin/padding, full-viewport layout)
- Drop shadows on nodes via offset rect
- Root nodes rendered with bold (fontWeight 600) text
- Improved collapse indicator: circle with child count number
- Better selection highlight (light blue fill #dbeafe, blue border)
- Better text padding and alignment
- CSS imported via main.tsx

**Files changed:**
- `packages/web/src/index.css` -- global styles
- `packages/web/src/main.tsx` -- imports CSS
- `packages/web/src/components/NodeView.tsx` -- improved styling with shadow, root bold, collapse count
- `packages/web/src/components/MindMapCanvas.tsx` -- passes isRoot prop to NodeView

**Tests added:**
- Visual verification via dev server

### Chunk 8: Keyboard navigation (2026-02-26)

**What was done:**
- Spatial navigation: navigateUp, navigateDown, navigateLeft, navigateRight on Editor
- Up/Down finds nearest visible node by y-center distance, tiebreaker is smallest x
- Left/Right is direction-aware: toward parent on right-side branches, toward children on left-side
- At root: Left goes to first left child, Right goes to first right child
- NavigateRight on collapsed node expands it first
- Arrow key bindings added to dispatch table (without modifiers = nav, with meta = reorder)
- DOM keyboard handler (useKeyboardHandler hook) wired into App
- Prevents default on handled keys and Tab

**Files changed:**
- `packages/core/src/editor/Editor.ts` -- navigateUp/Down/Left/Right methods
- `packages/core/src/keybindings/dispatch.ts` -- arrow key bindings
- `packages/web/src/input/useKeyboardHandler.ts` -- DOM keydown handler
- `packages/web/src/App.tsx` -- wired keyboard handler

**Tests added:**
- 24 navigation tests: up/down nearest-by-y, left/right direction-aware, bidirectional branches, cross-tree navigation, collapsed node expansion, keyboard dispatch

### Chunk 9: Text editing (2026-02-26)

**What was done:**
- TextEditor component: absolutely-positioned textarea overlay on editing node
- Zoom-aware positioning: textarea scales with camera zoom/pan
- Key routing in textarea: Enter exits+creates sibling, Tab exits+creates child, Escape exits
- Shift+Enter inserts newline (browser default behavior)
- Cmd+Z/Shift+Cmd+Z for undo/redo from within textarea
- Text changes flow to Editor.setText() via onChange
- Auto-focus with cursor at end of existing text
- data-mindforge-edit attribute to distinguish from other textareas
- Double-click on node enters edit mode
- Double-click on canvas creates new root at click position
- Click on different node while editing exits edit mode first

**Files changed:**
- `packages/web/src/components/TextEditor.tsx` -- textarea overlay component
- `packages/web/src/components/MindMapCanvas.tsx` -- renders TextEditor, double-click handlers

**Tests added:**
- Visual verification via dev server (text editing is a browser interaction; core text/mode logic already covered by TestEditor tests)

### Chunk 10: Mouse interaction (2026-02-26)

**What was done:**
- Drag-to-reposition nodes: pointer down on node starts drag after 4px threshold
- Entire subtree moves as a rigid unit during drag
- Drag-to-reparent with proximity detection (100px threshold)
- Visual reparent indicator: dashed amber line + amber highlight on target node
- Undo squashing: entire drag (including reparent) is a single undo entry
- No-op drags (no movement) don't create undo entries
- TestEditor pointer simulation: pointerDown, pointerMove, pointerUp
- Refactored MindMapCanvas pointer handling to support both canvas pan and node drag
- data-node-id attributes on node groups for pointer event targeting

**Files changed:**
- `packages/core/src/editor/Editor.ts` -- drag state, startDrag/updateDrag/endDrag, proximity detection
- `packages/core/src/test-editor/TestEditor.ts` -- pointerDown/pointerMove/pointerUp methods
- `packages/web/src/components/MindMapCanvas.tsx` -- refactored pointer handling for drag vs click vs pan
- `packages/web/src/components/NodeView.tsx` -- isReparentTarget prop with amber highlight
- `packages/web/src/components/ReparentIndicator.tsx` -- dashed line SVG component

**Tests added:**
- 13 drag tests: start/end drag, move to new position, subtree movement, select on drag, single undo, no-op drag, exit edit mode, reparent proximity detection, reparent on drop, no reparent in open space, no reparent to descendant, clear target after drop, reparent undo

### Chunk 11: Image support (2026-02-26)

**What was done:**
- Asset registry on Editor (getAssets, setNodeImage, removeNodeImage)
- Asset deduplication (same asset ID not registered twice)
- Assets included in undo/redo snapshots
- Assets serialized in toJSON and loaded from loadJSON
- Image rendering in NodeView (SVG `<image>` element below text)
- Drag-and-drop images from Finder onto nodes (attaches) or canvas (creates root)
- Paste from clipboard attaches to selected node or creates new root
- AssetUrlContext for mapping asset IDs to blob URLs
- Auto-scaling to max 300px display width, proportional height

**Files changed:**
- `packages/core/src/editor/Editor.ts` -- asset registry, setNodeImage, removeNodeImage, undo/redo assets
- `packages/web/src/App.tsx` -- AssetUrlContext provider, paste handler, asset-added event listener
- `packages/web/src/hooks/useAssetUrls.ts` -- AssetUrlContext and useAssetUrls hook
- `packages/web/src/components/NodeView.tsx` -- image rendering with imageUrl prop
- `packages/web/src/components/MindMapCanvas.tsx` -- drop handler, asset URL lookup

**Tests added:**
- 8 image tests: attach image, register asset, no duplicate assets, remove image, undo set, undo remove, round-trip serialization, replace image

### Chunk 12: IndexedDB auto-save (2026-02-26)

**What was done:**
- idb-keyval integration for IndexedDB persistence
- Debounced auto-save (500ms after each editor state change)
- Load from IndexedDB on startup, fall back to demo map on first visit
- BroadcastChannel for cross-tab sync (revision counter, reload on remote update)
- Loading state while async IDB read completes
- bunx over npx preference documented in CLAUDE.md

**Files changed:**
- `packages/web/src/persistence/local.ts` -- loadFromIDB, setupAutoSave, cross-tab sync
- `packages/web/src/App.tsx` -- integrated auto-save, async load, loading state
- `packages/web/package.json` -- added idb-keyval dependency
- `CLAUDE.md` -- documented bunx preference

**Tests added:**
- Visual verification via dev server (IndexedDB is a browser API; persistence logic tested by editing, reloading, and confirming data persists)

---

## Completed chunks 13-17

### Chunk 13: File save/load (2026-02-26)
- Migration pipeline: CURRENT_FORMAT_VERSION, migrateToLatest(), version validation
- browser-fs-access for Cmd+S save and Cmd+O open (File System Access API + fallback)
- File handle reuse for subsequent saves on Chromium
- Cmd+S/Cmd+O dispatch through core keybindings
- 8 tests (migration pipeline + dispatch)

### Chunk 14: Service worker (2026-02-26)
- vite-plugin-pwa with Workbox for offline app shell caching
- PWA manifest with app name, colors, icon placeholders
- UpdateBanner component: non-blocking "new version available" prompt
- registerType: "prompt" so users control reload timing

### Chunk 15: Export (2026-02-26)
- SVG export via XMLSerializer on data-mindforge-canvas element
- PNG export via SVG to Canvas to toDataURL (2x retina)
- Markdown export already in core (toMarkdown)
- URL sharing: lz-string compress/decompress for URL hash (#data=...)
- Load from URL hash on startup (before IDB fallback)
- Shift+Cmd+E dispatch for export
- 7 tests (URL round-trip + dispatch)

### Chunk 16: Animations (2026-02-26)
- CSS transition (200ms ease-out) on node position transforms
- Position transform moved from NodeView to wrapper <g> in MindMapCanvas
- Transitions disabled during drag for instant feedback
- Edges snap instantly (acceptable for v1)

### Chunk 17: Performance and accessibility (2026-02-26)
- ARIA attributes per spec Appendix D: role=treeitem, aria-level, aria-expanded, aria-selected, aria-label
- SVG canvas: role=group, aria-label="Mind Map"
- getNodeDepth() and hasVisibleChildren() on Editor
- Viewport culling: only render nodes within visible area (200px padding)
- Resize listener for viewport dimension tracking
- 6 tests (node depth + hasVisibleChildren)

### Post-spec polish (2026-02-26)

**Bug fixes:**
- Fixed camera position lost on save: Editor.toJSON() was not passing camera to serialize()
- 2 tests added

**Undo squashing:**
- Consecutive setText calls on the same node now produce a single undo entry
- Squashing breaks on different node, different mutation type, undo/redo, or loadJSON
- 3 tests added

**Keyboard zoom/pan shortcuts:**
- Cmd+= zoom in, Cmd+- zoom out (1.25x step, clamped to 0.1-3.0)
- Cmd+0 zoom to fit all visible nodes
- Cmd+1 zoom to selected node
- Shift+arrows pan canvas 10% of viewport dimension
- Editor stores viewport dimensions (set by web layer) for zoom-to-fit calculations
- Browser default shortcuts prevented for these key combos
- 10 tests added

**DOM text measurer:**
- Web layer provides DomTextMeasurer using an off-screen div element
- Editor.setText() now calls the text measurer to update node width/height
- Supports both unconstrained and width-constrained measurement
- Core tests verify stub measurer updates dimensions correctly
- 2 tests added

**Nothing-selected arrow key behavior:**
- When no node is selected, any arrow key selects the visible node closest to the viewport center
- Uses stored viewport dimensions and camera state to compute world-space center
- 2 tests added

**Viewport following:**
- Camera pans minimally to keep newly created nodes on-screen
- Applied to addChild, addSibling, addRoot
- 3 tests added

**Asset registry moved to MindMapStore:**
- Assets live in Store, not Editor (fixes architectural asymmetry)
- All image mutations route through Store methods
- 4 store-level asset tests added

**Editor.toMarkdown():**
- Wired toMarkdown() through Editor API per spec
- 1 test added

**ARIA role="tree":**
- Changed SVG container from role="group" to role="tree" per spec Appendix D

---

**Keyboard focus indicator:**
- Dashed blue outline (3px offset) on selected node for keyboard nav
- Renders behind drop shadow for clean visual layering

**Node width resize:**
- Drag right edge of selected node to resize width
- Sets widthConstrained=true, text reflows, height adjusts
- Minimum width 60px, single undo entry per resize
- 7 tests added

**Image resize handles (spec H7):**
- Blue dot in upper-right corner of image, visible on hover
- Dragging scales proportionally (aspect ratio locked)
- Minimum image width 40px, single undo entry
- 5 tests added

---

## Remaining gaps (not blocking, could be future work)
- Zip fallback for maps with images on non-Chromium browsers (fflate)
- PDF export (spec soft requirement S1)
- Performance benchmarks at 500 and 1000 nodes
- axe-core accessibility audit
- Playwright visual regression and offline simulation tests
- Edge animation (edges currently snap, nodes animate)

---

## Known issues

(None)

---

## Design decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| (date) | TestEditor pattern over Playwright-first | 90% of tests run without browser; millisecond execution; learned from tldraw |
| (date) | Diff-based undo over Command pattern | Automatic undo for all mutations; less boilerplate; learned from tldraw |
| (date) | Custom SVG renderer over React Flow | Full control over event pipeline; Editor as sole source of truth for testability |
| (date) | Web-first PWA over Electron/Tauri | Best Playwright support; zero-install; Tauri available as later escape hatch |
| (date) | Sidecar assets over embedded base64 | Git-friendly diffs; manageable image storage; Obsidian-compatible |
| (date) | Flat runtime model, nested file format | Fast lookups in memory; readable diffs on disk |
| 2026-02-25 | Stored positions over computed-only | Enables user repositioning via drag; direction inferred from positions |
| 2026-02-25 | Multiple roots (forest) over single root | More flexible canvas; roots can be created/deleted freely; empty canvas valid |
| 2026-02-25 | Spatial arrow navigation over structural | Left/Right follow screen direction, not parent/child; matches MindNode; intuitive for bidirectional layout |
| 2026-02-25 | Enter=edit mode, not create sibling | In nav mode Enter edits; in edit mode Enter creates sibling; two keystrokes for sibling from nav is acceptable |
| 2026-02-25 | Incremental layout over full dagre reflow | Dagre for new trees only; add/remove/collapse shifts siblings and subtrees; preserves manual positions; cross-tree overlap detection pushes trees apart |
| 2026-02-25 | Direction inferred from positions | No explicit side property; child.x < parent.x means left-side branch; simpler data model |
| 2026-02-26 | 4px drag threshold before starting drag | Distinguishes click-to-select from drag-to-reposition; prevents accidental drags |
| 2026-02-26 | 100px reparent proximity threshold | Generous enough to be discoverable; uses distance from dragged node center to target edge center |
