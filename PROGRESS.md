# PROGRESS.md

## Current status

**Phase**: Phase 1 -- Foundation
**Next chunk**: Chunk 4 (Editor + TestEditor)
**Last updated**: 2026-02-26

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

### Up next: Chunk 4 — Editor + TestEditor

**Goal:** Editor class with all core operations, diff-based undo, key-to-action dispatch, and TestEditor for simulated interaction.

**Acceptance criteria:**
- [ ] Editor wraps store, exposes full mutation API
- [ ] Editor accepts a TextMeasurer interface (DI); tests use a stub measurer
- [ ] Every mutation produces a tracked diff
- [ ] markHistory/undo/redo work correctly
- [ ] Selection and navigation methods work
- [ ] Nav mode / edit mode state machine
- [ ] Key-to-action dispatch table in `core/src/keybindings/` (maps keys to Editor methods; shared by web input handler and TestEditor)
- [ ] Simple position heuristics for node creation (child offset from parent, siblings stacked vertically); replaced by proper layout engine in Chunk 5
- [ ] TestEditor simulates keyDown/keyUp/pressKey/pointerDown/type (routed through dispatch)
- [ ] TestEditor assertion methods (expectSelected, expectEditing, etc.)
- [ ] 30+ tests covering operations, undo/redo, keyboard simulation via dispatch

---

## Known issues

(None yet)

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
