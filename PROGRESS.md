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
- [ ] MindMapNode, MindMap, CrossLink, Asset types defined
- [ ] Flat store (Map<string, MindMapNode>) with add/remove/reparent/reorder
- [ ] Tree traversal utilities (getChildren, getParent, getSiblings, getAncestors)
- [ ] All operations maintain tree invariants (no orphans, no cycles)
- [ ] 20+ unit tests covering normal and edge cases

### Then: Chunk 3 — Serialization (can parallel with Chunk 2)

**Goal:** JSON round-trip and markdown export.

**Acceptance criteria:**
- [ ] Nested JSON → flat runtime model (deserialize)
- [ ] Flat runtime model → nested JSON (serialize)
- [ ] Round-trip: serialize(deserialize(json)) === json
- [ ] Zod schema validates file format
- [ ] Markdown export generates indented outline
- [ ] Version field included; migration system scaffolded
- [ ] 15+ unit tests including edge cases (empty map, single node, deep nesting)

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
