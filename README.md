# Limn

[![CI](https://github.com/tednaleid/limn/actions/workflows/ci.yml/badge.svg)](https://github.com/tednaleid/limn/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/tednaleid/41b99760446766c22cc7143632db43c6/raw/limn-coverage.json)](https://github.com/tednaleid/limn/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)

> **limn** /lim/ *verb* -- to outline in clear sharp detail : [delineate](https://www.merriam-webster.com/dictionary/limn)

A keyboard-first, offline-capable mind map progressive web app built with TypeScript, React, and SVG.

**Try it:** [tednaleid.github.io/limn](https://tednaleid.github.io/limn/)

<video src="https://github.com/user-attachments/assets/a909e45e-f35a-42d7-a943-c5e88f1b71cc" controls width="100%"></video>

## Quick start

```bash
bun install
just serve       # starts Vite dev server at http://localhost:5173
```

## Project structure

```
packages/core/       # Framework-agnostic TS library (no React, no browser APIs)
packages/web/        # React web app (rendering, input handling, persistence)
packages/obsidian/   # Obsidian plugin (opens .limn files and marked Markdown notes as mind maps)
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
just build         # build the Obsidian plugin (primary artifact)
just build-web     # build the web PWA (used by the Pages deploy)
just typecheck     # TypeScript type checking
```

You can also use `bun run` directly:

```bash
bun run test       # vitest
bun run dev        # vite dev server
bun run lint       # eslint
bun run build      # build the Obsidian plugin
bun run build:web  # build the web PWA
```

## Architecture

- **Editor** is the sole source of truth for all state
- **TestEditor** enables testing all interactions without a browser
- Keyboard-first: Tab creates child, Enter edits, arrows navigate spatially, `;` for EasyMotion jump
- Diff-based undo/redo (snapshot capture, no Command classes)
- SVG rendering with pan/zoom viewport
- IndexedDB auto-save with cross-tab sync
- ZIP file format with embedded assets (`data.json` + `assets/`)

## Storage

All data is stored locally in the browser using IndexedDB. Nothing is sent to a server.

- Each document gets a unique ID shown in the URL hash (`#local-doc=<uuid>`)
- Opening the bare URL (no hash) reopens the last-edited document
- Opening a `#data=...` URL decompresses the inline document, assigns it a fresh UUID, and saves it locally
- The "New" menu item creates a new document with its own UUID
- Two tabs with the same `#local-doc=<uuid>` URL will stay in sync via BroadcastChannel
- Clearing browser data (IndexedDB) deletes all locally stored documents
- Use `Cmd+S` / `Cmd+O` to save/open `.limn` files for durable storage outside the browser

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
| c / Shift+c | Cycle branch color forward / backward |

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
| Ctrl+Alt+Left/Right / Ctrl+Alt+h/l | Resize node width or image (20px) |
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
| m | Open menu |
| ? | Show keyboard shortcuts |
| Ctrl+Shift+K | Toggle keystroke overlay (for demos) |

**Mouse:**

| Action | Effect |
|--------|--------|
| Click node | Select node |
| Double-click node | Enter edit mode |
| Double-click canvas | Create new root node |
| Cmd+Click link | Open link in new tab |
| Drag node | Move node (reparent when dropped on another node) |

**Note:** On macOS, Ctrl+Arrow keys are bound to Mission Control by default (switching desktops). To use Ctrl+Arrow nudge and resize bindings, disable these in System Settings > Keyboard > Keyboard Shortcuts > Mission Control, or use the hjkl equivalents instead.

## Obsidian plugin

Limn is available as an [Obsidian community plugin](https://community.obsidian.md/plugins/limn) that opens `.limn` files as interactive mind map views. It can also show an ordinary Markdown note as a mind map.

### Install from the Community Plugins directory

1. In Obsidian, open Settings -> Community plugins
2. Click Browse, search for "Limn", and click Install
3. Enable the plugin

### Install via BRAT (beta / latest)

If you want the latest unreleased build, install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) instead:

1. Install the BRAT plugin from Obsidian community plugins
2. In BRAT settings, click "Add Beta plugin" and enter: `tednaleid/limn`
3. Enable "Limn" in Settings -> Community plugins

BRAT will install the latest release and keep it updated automatically.

### Markdown notes as mind maps

A Markdown note whose content is a bulleted list can be opened as a mind map. Each top-level bullet is a root, nested bullets are its children, and edits in the map are written back to the note as Markdown.

```markdown
---
limn-plugin: true
---
- Release
  - Write the notes
  - Tag the build
```

- **Marking a note:** a note with `limn-plugin: true` in its frontmatter opens as a map when you click it. The commands "Create new mind map note" and "Add mind map marker to note" add the marker for you. The setting "Open notes with limn-plugin: true as" turns this off.
- **Switching views:** "Open as mind map" and "Open as Markdown" are in the command palette, the pane menu, and the right-click menu of a note. They work on any note, marked or not. Both views can be open side by side and each follows edits made in the other.
- **What is kept:** text outside the list (frontmatter, paragraphs, numbered lists, code blocks) is left as it is. `[[wikilinks]]` work as links in the map, and images are stored as `![[image.png]]` embeds.
- **What is not kept:** the note holds no layout. Node positions, sides, widths, and colors are computed each time, and the actions that change them are off in this view. Use a `.limn` file when you need those.
- **Formatting changes on save:** the first map edit rewrites the list with consistent indentation, bullet markers, and blank lines. `-` marks an open bullet and `*` a collapsed one. A bullet with several lines of text gets a trailing `\` on every line but the last.
- **Dataview and Tasks fields:** because of that trailing `\`, an inline field on a continuation line of a bullet (a line such as `due:: 2026-11-12` under the bullet's first line) gains a backslash at the end of its value, which can break queries that read it. Fields on the bullet's own line, in frontmatter, or outside the list are not affected.
- **Notes the map will not open:** if a bullet contains something the map cannot write back unchanged, such as a heading, table, quote, or numbered list inside the bullet, the note opens as Markdown with a notice naming the lines. The note is not modified.

### Development

See [OBSIDIAN-PLUGIN.md](OBSIDIAN-PLUGIN.md) for local development setup, building, and architecture details.

## Inline markdown

Node text supports inline markdown formatting. Raw markdown is shown while editing; rendered formatting is shown in nav mode.

| Syntax | Result |
|--------|--------|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `` `code` `` | `code` |
| `~~strikethrough~~` | ~~strikethrough~~ |
| `[text](url)` | clickable link (Cmd+Click or Cmd+Enter to follow) |
