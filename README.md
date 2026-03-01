# Limn

[![CI](https://github.com/tednaleid/limn/actions/workflows/ci.yml/badge.svg)](https://github.com/tednaleid/limn/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/tednaleid/41b99760446766c22cc7143632db43c6/raw/limn-coverage.json)](https://github.com/tednaleid/limn/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)

> **limn** /lim/ *verb* -- to outline in clear sharp detail : [delineate](https://www.merriam-webster.com/dictionary/limn)

A keyboard-first, offline-capable mind map progressive web app built with TypeScript, React, and SVG.

**Try it:** [tednaleid.github.io/limn](https://tednaleid.github.io/limn/)

## Quick start

```bash
bun install
just serve       # starts Vite dev server at http://localhost:5173
```

## Project structure

```
packages/core/       # Framework-agnostic TS library (no React, no browser APIs)
packages/web/        # React web app (rendering, input handling, persistence)
packages/obsidian/   # Obsidian plugin (opens .limn files inside Obsidian)
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
just coverage      # run tests with coverage report
just check         # run tests (with coverage) + lint + typecheck (CI check)
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
- Sidecar asset storage for images (`file.limn` + `file.assets/`)

## File format

`.limn` files are ZIP bundles containing `data.json` and an `assets/` directory for images. The current format version is 1.

- Schema definition: `packages/core/src/serialization/schema.ts`
- Golden fixture: `packages/core/src/serialization/fixtures/v1-complete.json`
- Migration pipeline: `packages/core/src/serialization/migration.ts`

The format uses integer versions. When a file is opened, the migration pipeline in `migration.ts` upgrades it from its stored version to the current version. Post-migration, the result is validated against the Zod schema.

## Keyboard shortcuts

**Navigation:**

| Key | Action |
|-----|--------|
| Arrows / hjkl | Navigate between nodes |
| `;` | EasyMotion: labels appear on all visible nodes, type a label to jump |
| Cmd+Enter | Open link in selected node |
| Escape | Deselect |

**Node Operations:**

| Key | Action |
|-----|--------|
| Tab | Create child node |
| Enter | Edit selected node (or create root if nothing selected) |
| Shift+Enter | Create sibling node |
| Backspace | Delete node |
| Space | Toggle collapse |

**Structure:**

| Key | Action |
|-----|--------|
| Alt+Up/Down or Alt+k/j | Reorder among siblings |
| Alt+Left/Right or Alt+h/l | Indent / Outdent |
| Shift+Tab | Detach node to root |
| Alt+`;` | Reparent to target (EasyMotion labels appear, type to attach) |

**Positioning:**

| Key | Action |
|-----|--------|
| Ctrl+Arrows / Ctrl+hjkl | Nudge node (20px) |
| Ctrl+Alt+Arrows / Ctrl+Alt+hjkl | Nudge node (1px) |
| r | Reflow children to computed layout |

**Text Editing:**

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
| Cmd+S / Cmd+Shift+S | Save / Save As |
| Cmd+O | Open file |
| Cmd+Shift+E | Export SVG |
| Cmd+= / Cmd+- | Zoom in / out |
| Cmd+0 | Zoom to fit |
| Cmd+1 | Zoom to selected node |
| Shift+Arrows / Shift+hjkl | Pan canvas |
| Shift+Alt+Arrows / Shift+Alt+hjkl | Pan canvas (fine) |

**Mouse:**

| Action | Effect |
|--------|--------|
| Click node | Select node |
| Double-click node | Enter edit mode |
| Double-click canvas | Create new root node |
| Cmd+Click link | Open link in new tab |
| Drag node | Move node (reparent when dropped on another node) |

**Note:** On macOS, Ctrl+Arrow keys are bound to Mission Control by default (switching desktops). To use Ctrl+Arrow nudge bindings, disable these in System Settings > Keyboard > Keyboard Shortcuts > Mission Control, or use the Ctrl+hjkl equivalents instead.

## Obsidian plugin

Limn is available as an Obsidian plugin. See [OBSIDIAN-PLUGIN.md](OBSIDIAN-PLUGIN.md)
for development setup, building, and distribution.

## Inline markdown

Node text supports inline markdown formatting. Raw markdown is shown while editing; rendered formatting is shown in nav mode.

| Syntax | Result |
|--------|--------|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `` `code` `` | `code` |
| `~~strikethrough~~` | ~~strikethrough~~ |
| `[text](url)` | clickable link (Cmd+Click or Cmd+Enter to follow) |
