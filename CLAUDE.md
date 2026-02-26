# CLAUDE.md

MindForge — keyboard-first, offline-capable mind map PWA.

## Stack

- Core engine: TypeScript (strict), zero browser dependencies
- Web app: React 19, Vite, SVG rendering, custom pan/zoom (pure math)
- Layout: @dagrejs/dagre
- Testing: Vitest (unit via TestEditor), Playwright (visual regression only)
- File I/O: browser-fs-access
- Package manager: Bun (Playwright uses Node.js)

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
bun run test:e2e     # Playwright visual regression
bun run dev          # Vite dev server
bun run build        # Production build
```

## Architecture invariants

- **Editor is the sole source of truth.** All mutations go through Editor methods. DOM renders from Editor state, never writes to it.
- **Core has zero browser dependencies.** Nothing in `packages/core/` imports React, DOM APIs, or browser globals.
- **Diff-based undo.** Store captures diffs automatically. No Command classes.
- **Positions are stored.** Layout engine computes initial positions; users can reposition nodes by dragging. File format includes x/y coordinates.
- **Images use sidecar storage.** `file.mindmap` + `file.assets/` directory. Never base64 in JSON.
- **TestEditor for logic tests.** Playwright is only for visual regression and browser-API integration. If it can be tested without a browser, it must be.
- **Text editing uses positioned textarea.** Not SVG foreignObject (cross-browser issues). Textarea is absolutely positioned over the canvas with zoom-aware transforms.
- **Multiple roots supported.** A mind map is a forest of trees. Roots can be created and deleted freely. Empty canvas is valid.
- **Multi-line node text.** Shift+Enter inserts newline in edit mode. Enter exits edit mode and creates sibling.

## Specs and progress

- Full spec: `SPEC.md`
- Current status and next steps: `PROGRESS.md`