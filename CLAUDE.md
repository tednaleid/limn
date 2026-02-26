# CLAUDE.md

MindForge — keyboard-first, offline-capable mind map PWA.

## Development Methodology

Testing is a first-class citizen. We are using red/green development practices. Everywhere possible, we want to have a failing (red) test
first, then make it pass (green).

For this project, you are allowed to commit, and are actually REQUIRED to commit your progress after every significant change. Commits should only happen when tests and linting are green.

## Structure

```
packages/core/    # Framework-agnostic TS library — NO React, NO browser APIs
packages/web/     # React PWA — rendering, input handling, persistence
```

## Commands

```bash
bun install          # Install dependencies
bun run test         # Vitest unit tests
bun run lint         # ESLint
bunx tsc -b          # Type-check (builds core declarations, checks web)
bun run dev          # Vite dev server
bun run build        # Production build
```

A `justfile` is provided for convenience (`just check` runs tests + lint + typecheck).

- Use `bunx` instead of `npx` for running package binaries (this is a Bun project).

## Architecture invariants

- **Editor is the sole source of truth.** All mutations go through Editor methods. DOM renders from Editor state, never writes to it.
- **Core has zero browser dependencies.** Nothing in `packages/core/` imports React, DOM APIs, or browser globals. Text measurement uses a `TextMeasurer` interface (DI); web provides a DOM-based implementation, tests provide a stub.
- **Diff-based undo.** Store captures diffs automatically. No Command classes.
- **Positions are stored.** Layout engine computes initial positions; users can reposition nodes by dragging. File format includes x/y coordinates.
- **Images use sidecar storage.** `file.mindmap` + `file.assets/` directory. Never base64 in JSON.
- **TestEditor for logic tests.** Playwright is only for visual regression and browser-API integration. If it can be tested without a browser, it must be.
- **Text editing uses positioned textarea.** Not SVG foreignObject (cross-browser issues). Textarea is absolutely positioned over the canvas with zoom-aware transforms.
- **Multiple roots supported.** A mind map is a forest of trees. Roots can be created and deleted freely. Empty canvas is valid.
- **Multi-line node text.** Shift+Enter inserts newline in edit mode. Enter exits edit mode and creates sibling.
- **Key-to-action routing lives in core.** DOM event listeners live in `web/`, but they delegate to a dispatch function in `core/` that maps keys to Editor actions. TestEditor uses the same dispatch, so keyboard behavior is testable without a browser.
- **Undo tracks only document data.** Camera position and selection state are excluded from the diff/undo system. The store distinguishes "document state" (nodes, structure, text) from "session state" (camera, selection).
- **Root nodes have no siblings.** Creating a sibling (Shift+Enter in nav mode, Enter in edit mode) is a no-op on root nodes. New roots are created only via Enter with nothing selected, or double-click on canvas.
- **Empty nodes are auto-deleted.** If a user exits edit mode (Escape) on a node with empty text, the node is deleted and selection falls back to previous sibling, then parent.

## Specs and progress

- Full spec: `SPEC.md`
- Current status and next steps: `PROGRESS.md`