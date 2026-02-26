# MindForge

A keyboard-first, offline-capable mind map PWA built with TypeScript, React, and SVG.

## Quick start

```bash
bun install
just dev         # starts Vite dev server at http://localhost:5173
```

## Project structure

```
packages/core/    # Framework-agnostic TS library (no React, no browser APIs)
packages/web/     # React PWA (rendering, input handling, persistence)
```

## Development commands

All commands are available via [just](https://github.com/casey/just):

```bash
just               # list all available commands
just install       # install dependencies
just dev           # start Vite dev server
just test          # run all unit tests
just test-watch    # run tests in watch mode
just test-file drag  # run a specific test file (by name)
just lint          # run ESLint
just check         # run tests + lint (CI check)
just build         # production build
just typecheck     # TypeScript type checking
```

You can also use `bun run` directly:

```bash
bun run test       # vitest
bun run dev        # vite dev server
bun run lint       # eslint
bun run build      # production build
```

## Architecture

- **Editor** is the sole source of truth for all state
- **TestEditor** enables testing all interactions without a browser
- Keyboard-first: Tab creates child, Enter edits, arrows navigate spatially
- Diff-based undo/redo (snapshot capture, no Command classes)
- SVG rendering with pan/zoom viewport
- IndexedDB auto-save with cross-tab sync
- Sidecar asset storage for images (`file.mindmap` + `file.assets/`)

See `SPEC.md` for full requirements and `PROGRESS.md` for current status.
