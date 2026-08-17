# Obsidian Plugin

Limn is available as an Obsidian plugin. Files with the `.limn` extension open as interactive
mind map views inside Obsidian. Markdown notes can also be opened as mind maps: a note's nested
bullet lists are the map, and edits made in the map are written back into the note.

## Architecture

The plugin lives in `packages/obsidian/` and reuses the same core engine and React
components as the web app:

```
packages/core/       # Shared: Editor, layout, serialization, dispatch, undo
packages/web/        # Web PWA (Vite entry point) + shared React components
packages/obsidian/   # Obsidian plugin (esbuild entry point)
```

Key classes:

- **LimnView** extends Obsidian's `FileView`. Receives file content via `onLoadFile()`,
  which reads binary data from the vault. Mounts an isolated React tree into the view container.
- **ObsidianPersistenceProvider** implements `PersistenceProvider` using Obsidian's vault API.
  Triggers saves via `LimnView.saveToDisk()` which writes ZIP bundles to the vault. Image
  assets are stored in a sidecar `.limn-assets/` folder next to the `.limn` file for
  legacy compatibility and are loaded on file open if present.
- **DomTextMeasurer** is shared with the web app. The `createDomTextMeasurer(container)`
  factory appends the measurement element to the view container instead of `document.body`.
- **LimnMarkdownView** extends `TextFileView`. Shows a note's bullet lists as a map; the base
  class handles loading, saving (2 s debounce), own-write echo suppression, and the three-way
  merge with edits from other panes. `OutlineDocument` converts between note text and the
  Editor; `ObsidianOutlineAssetProvider` stores images as vault attachments; routing lives in
  `markdown/routing.ts` and `markdown/leafRouting.ts` (a `WorkspaceLeaf.setViewState` wrapper,
  removed on unload).

## File format

`.limn` files are ZIP bundles containing `data.json` and an `assets/` directory, matching
the web app format. Legacy plain-JSON `.limn` files are auto-migrated to ZIP on next save.

Image assets from legacy files may also exist in a sidecar folder (`MyMap.limn-assets/`
alongside `MyMap.limn`), which is loaded on file open if present.

## Markdown-backed mind maps

### Opening

Notes with `limn-plugin: true` in frontmatter open as a map by default, controlled by the
setting "Open notes with limn-plugin: true as". Any note can be opened either way, regardless of
the marker, from the file or editor context menu, the pane menu, or the commands "Open as mind
map" and "Open as Markdown". "Create new mind map note" creates a new marked note and opens it
as a map; "Add mind map marker to note" adds the frontmatter key to the active note without
changing its view.

### What the note stores

Every top-level bullet in the note is a root of the map. `-` marks an open item, `*` a collapsed
one. Multi-line node text is written as backslash-continued lines. Images are written as
`![[file|WxH]]` embeds on the item's last line. Everything in the note that is not a list --
prose, ordered lists, code fences, `%%` comment blocks -- is preserved verbatim.

The first save after opening a note normalizes its list formatting: indent, bullet markers, and
blank lines between items. Positions, side, width, and colors are not stored in the note: layout
is always computed, with all children on the right, and the nudge, side flip, width resize, and
color actions are off in this view (and hidden from the `?` shortcut help).

### Links

`[[wikilinks]]`, with or without an alias, render as links in the map. `Cmd+Enter` on the
selected node, or `Cmd+Click` on the link, opens the note in a new tab. Tags, tasks, and other
inline syntax pass through as plain text.

### Images

Paste or drop an image onto a node: the file lands in the vault's attachment folder and the note
gets `![[Pasted image ....png|WxH]]`. A bare embed (no size given in the note) draws at the
image's natural size, capped at 300 px wide, without changing the note; resizing the image in
the map writes the size.

### Two panes

The same note can be open as Markdown and as a map at once. Changes made on one side cross over
to the other after that side saves (2 s debounce). Undo in the map is separate from the editor's
undo, and is cleared whenever an external change arrives from the other pane.

## Local development setup

Prerequisites: [Bun](https://bun.sh), [just](https://github.com/casey/just), Obsidian.

### Build and install

```bash
just obsidian-install ~/path/to/your/vault
```

This builds the plugin and creates a symlink from
`<vault>/.obsidian/plugins/limn/` to `packages/obsidian/dist/`.

After symlinking, enable "Limn" in Obsidian Settings -> Community plugins.

### Development loop

```bash
just obsidian-dev
```

Runs esbuild in watch mode. On each save, `dist/main.js` is rebuilt (typically < 100ms).
Reload Obsidian with Cmd+R to pick up changes.

### Available commands

```bash
just obsidian-build     # Production build (minified)
just obsidian-dev       # Dev build with watch mode
just obsidian-install <vault>  # Symlink dist/ into vault
just obsidian-test      # Run obsidian package unit tests
just check              # Run all tests + lint + typecheck (includes obsidian)
```

## Testing

### Unit tests (vitest)

```bash
just obsidian-test
```

Tests are in `packages/obsidian/src/__tests__/` and cover:
- PersistenceProvider save/load round-trips
- Sidecar asset storage and path construction
- View data serialization round-trips
- Plugin registration
- Outline document round trip and save signal
- Asset provider (vault attachments)
- Routing decision and the `setViewState` wrapper
- Commands
- Settings

### Manual testing checklist

After `just obsidian-install <vault>`:

- [ ] Create new `.limn` file in vault, verify it opens with mind map view
- [ ] Edit mind map (add nodes, move, delete), close file, reopen -- verify persistence
- [ ] Cmd+Z / Cmd+Shift+Z undo/redo works
- [ ] Keyboard navigation (arrows, Enter, Tab) works
- [ ] Paste image, verify sidecar `.limn-assets/` folder created
- [ ] Open same file in two panes, verify no conflicts
- [ ] File renamed in vault sidebar -- verify view updates
- [ ] Click a note with `limn-plugin: true`: opens as a map. Click an unmarked note: opens as Markdown.
- [ ] Pane menu "Open as Markdown" and editor context menu "Open as mind map" switch the same pane both ways; the choice sticks for that note in that pane
- [ ] Two panes on one note (map + Markdown): edit in each, see the other update within ~2 s
- [ ] While editing a node in the map, edit a different line in the Markdown pane: both edits survive
- [ ] Paste an image into a map node: attachment created, note gets the embed, image shows after reload
- [ ] Collapse a node: note line switches `-` to `*`; reading view still renders one list
- [ ] A node containing `[[Another note]]`: shows as a link; Cmd+Enter opens that note in a new tab
- [ ] Setting "Open notes with limn-plugin: true as: Markdown": marked notes open as Markdown; "Open as mind map" still works
- [ ] Disable the plugin: open map panes turn back into Markdown panes

## Building for distribution

```bash
just obsidian-build
```

Produces three files in `packages/obsidian/dist/`:
- `main.js` -- bundled plugin
- `manifest.json` -- plugin metadata
- `styles.css` -- plugin styling

### GitHub release

Run `just bump` (patch bump) or `just bump X.Y.Z` (explicit version). This updates
all version files, commits, tags, and pushes. The GitHub Actions workflow at
`.github/workflows/release.yml` builds and attaches the three files to a GitHub release.
