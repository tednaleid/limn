# PROGRESS.md

## Current status

**Phase**: Not started — project scaffolding pending
**Next chunk**: Chunk 1 (Project scaffold)
**Last updated**: (update this date with each chunk completion)

---

## Completed chunks

(None yet)

<!-- Template for completed chunks:

### Chunk N: Title (YYYY-MM-DD)

**What was done:**
- Bullet points describing what was implemented

**Files changed:**
- `path/to/file.ts` — description of change

**Tests added:**
- Number and description of tests

**Notes/decisions:**
- Any deviations from the plan or decisions made during implementation
-->

---

## Chunk details

### Up next: Chunk 1 — Project scaffold

**Goal:** Working TypeScript project with Vitest, build pipeline, and all config files.

**Acceptance criteria:**
- [ ] `bun install` succeeds
- [ ] `bun run test` runs and passes (with a single smoke test)
- [ ] `bun run build` produces output
- [ ] `bun run dev` starts Vite dev server
- [ ] `packages/core/` and `packages/web/` exist with correct tsconfig
- [ ] ESLint + TypeScript strict mode configured
- [ ] CLAUDE.md and SPEC.md are in the repo root

**Technical notes:**
- Use Bun workspaces for the monorepo
- Vite for the web package
- Vitest config in the core package
- TypeScript strict mode, no `any`

### Then: Chunk 2 — Data model

**Goal:** Core types and tree operations, fully tested.

**Acceptance criteria:**
- [ ] MindMapNode (with x/y, widthConstrained), MindMap (with roots[]), Asset types defined
- [ ] Flat store (Map<string, MindMapNode>) with add root/add child/remove/reparent/reorder
- [ ] Tree traversal utilities (getChildren, getParent, getSiblings, getRoots, getAncestors)
- [ ] All operations maintain tree invariants (no orphans, no cycles, valid roots[])
- [ ] Multi-root operations: add root, delete root, empty canvas state
- [ ] 20+ unit tests covering normal and edge cases including multi-root

### Then: Chunk 3 — Serialization

**Goal:** JSON round-trip and markdown export.

**Acceptance criteria:**
- [ ] Nested JSON (with roots[] and x/y) → flat runtime model (deserialize)
- [ ] Flat runtime model → nested JSON (serialize)
- [ ] Round-trip: serialize(deserialize(json)) === json (positions preserved)
- [ ] Zod schema validates file format
- [ ] Markdown export generates indented outline
- [ ] Version field included; migration system scaffolded
- [ ] 15+ unit tests including edge cases (empty map, single root, multiple roots, deep nesting)

### Then: Chunk 4 — Editor + TestEditor

**Goal:** Editor class with all core operations, diff-based undo, and TestEditor for simulated interaction.

**Acceptance criteria:**
- [ ] Editor wraps store, exposes full mutation API
- [ ] Every mutation produces a tracked diff
- [ ] markHistory/undo/redo work correctly
- [ ] Selection and navigation methods work
- [ ] Nav mode / edit mode state machine
- [ ] TestEditor simulates keyDown/keyUp/pressKey/pointerDown/type
- [ ] TestEditor assertion methods (expectSelected, expectEditing, etc.)
- [ ] 30+ tests covering operations, undo/redo, keyboard simulation

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
