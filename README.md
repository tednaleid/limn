# Limn

A keyboard-first, offline-capable mind map progressive web app built with TypeScript, React, and SVG.

## Quick start

```bash
bun install
just serve       # starts Vite dev server at http://localhost:5173
```

## Project structure

```
packages/core/    # Framework-agnostic TS library (no React, no browser APIs)
packages/web/     # React web app (rendering, input handling, persistence)
```

## Development commands

All commands are available via [just](https://github.com/casey/just):

```bash
just               # list all available commands
just install       # install dependencies
just serve         # start Vite dev server
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
- Keyboard-first: Tab creates child, Enter edits, arrows navigate spatially, `;` for EasyMotion jump
- Diff-based undo/redo (snapshot capture, no Command classes)
- SVG rendering with pan/zoom viewport
- IndexedDB auto-save with cross-tab sync
- Sidecar asset storage for images (`file.mindmap` + `file.assets/`)

## Keyboard shortcuts

**Nav mode:**

| Key | Action |
|-----|--------|
| Arrows / hjkl | Navigate between nodes |
| Tab | Create child node |
| Enter | Edit selected node (or create root if nothing selected) |
| Shift+Enter | Create sibling node |
| Backspace | Delete node |
| Space | Toggle collapse |
| `;` | EasyMotion: labels appear on all visible nodes, type a label to jump |
| Opt+Up/Down | Reorder among siblings |
| Opt+Left/Right | Indent / Outdent |
| Shift+Tab | Detach node to root |
| Escape | Deselect |

**Edit mode:**

| Key | Action |
|-----|--------|
| Enter | Exit edit, create sibling |
| Tab | Exit edit, create child |
| Shift+Enter | Insert newline |
| Escape | Exit edit mode |

**Global:**

| Key | Action |
|-----|--------|
| Cmd+Z / Cmd+Shift+Z | Undo / Redo |
| Cmd+S / Cmd+O | Save / Open file |
| Cmd+= / Cmd+- | Zoom in / out |
| Cmd+0 | Zoom to fit |
| Cmd+1 | Zoom to selected node |
| Shift+Arrows | Pan canvas |
