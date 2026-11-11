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
- **Unload** hands map panes back to the Markdown editor. Obsidian closes the panes of a view
  type as it unregisters the type, so each map view reports a different type for the rest of
  the unload and is switched to `markdown` just after (`handBackMapLeaves` in `main.ts`).
- **Key chords Obsidian also binds** (Cmd+Enter) are claimed for the map by a view scope in
  `mapKeys.ts`; without it Obsidian's hotkey handling consumes the key before the map sees it.
- **The stylesheet arrives after the code** when the plugin is enabled or updated, so a map
  restored during load is measured without it; `stylesLoaded.ts` reports when it is in force
  and the Markdown-backed view measures and lays out again.

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

The backslash on a continued line is part of that line for plugins that read the note line by
line. A Dataview or Tasks inline field (`key:: value`) on a continuation line that is not the
item's last gains a trailing backslash in its value. This is accepted and documented in the README;
such notes are not refused.

### Notes the map refuses

The map only opens a note it can write back unchanged. A note with a numbered list, quote,
heading, rule, table, `$$` math block, `%%` comment, or HTML block directly inside a bullet, with a
code fence inside a bullet that is never closed or that follows an empty bullet line, with bullets
nested under something that is not a bullet, or with a list line indented so that Markdown would
attach it to a different item than the map does, is not shown as a map. A notice names the first
offending lines and the note opens as Markdown instead; the file is not modified. Thematic breaks,
`$$` math blocks, and multi-line HTML comments between paragraphs are prose and are preserved like
code fences.

If an external change makes an open map's note unsupported, unsaved map edits are discarded in
favor of the file and the pane switches to Markdown.

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
just obsidian-e2e       # Run end-to-end tests against a real Obsidian
just check              # Run all tests + lint + typecheck (includes obsidian)
just lint-obsidian      # Run the community scanner's lint rules; warnings fail
just scorecard          # Scanner lint, dependency audit, and bundle checks
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

### End-to-end tests (WebdriverIO, real Obsidian)

```bash
just obsidian-e2e
```

Builds the plugin, downloads Obsidian on the first run (about 600 MB, cached in
`packages/obsidian/.obsidian-cache`), and drives it with
[wdio-obsidian-service](https://github.com/jesse-r-s-hines/wdio-obsidian-service). Each spec
file gets its own Obsidian on a throwaway copy of `packages/obsidian/e2e/vaults/basic`, with
the plugin loaded from `packages/obsidian/dist`. The run takes about half a minute and is not
part of `just check`.

GitHub Actions runs the suite on Linux for every push to `main` and every pull request
(`.github/workflows/e2e.yml`), under a virtual display.

Specs are in `packages/obsidian/e2e/specs/`:

- `limn-files`: create a `.limn` file; add, edit, and delete nodes with the keyboard, close,
  reopen; undo and redo; arrow-key navigation; two panes on one file; rename under an open view
- `markdown-routing`: marked notes open as maps and unmarked ones as Markdown; the pane menu,
  editor menu, and file browser menu items; a choice sticks for that note in that pane; the
  "open marked notes as" setting; a choice does not carry over to the next note
- `markdown-map`: viewing never rewrites a note, hand-formatted or not; a keyboard edit reaches
  the note; a map and a Markdown editor on one note stay in step, including while a node is
  being edited; image paste creates an attachment that shows after reopening; collapsing writes
  `*`; Cmd+Enter opens a wikilink in a new tab; a rule and a math block survive an edit; a note
  the map cannot round-trip is refused with a notice and left untouched
- `plugin-lifecycle`: disabling the plugin turns map panes into Markdown panes, with an edit
  made just before; turning it back on restores the map, drawn and editable

Things the specs do through Obsidian's API where a person would use the mouse: opening files in
splits, toggling the plugin and the setting, and editing in the Markdown pane. Image paste is a
synthetic clipboard event.

### Manual checks

After `just obsidian-install <vault>`, look at what the tests cannot judge:

- [ ] A map and a `.limn` file look right in the light and dark themes
- [ ] Reading view of a note with a collapsed `*` item among `-` siblings renders one list
- [ ] Paste an image from the real clipboard into a map node
- [ ] Update the plugin (re-run `just obsidian-install`, then "Reload app without saving") with
      a map pane open: the map comes back

## Building for distribution

```bash
just obsidian-build
```

Produces three files in `packages/obsidian/dist/`:
- `main.js` -- bundled plugin
- `manifest.json` -- plugin metadata
- `styles.css` -- plugin styling

### Keeping the scorecard green

The plugin's page on community.obsidian.md shows a Review rating. It comes from automated
scans of each release: a lint of the whole repository, a dependency audit, a rebuild that must
match the released `main.js` byte for byte, and pattern checks on the bundle. A release with new
findings drops the rating from Passed to Caution. The scan runs after the release, so the
findings have to be caught here first.

Before a release:

1. `just scorecard`. It runs `just lint-obsidian`, `bun audit`, and the bundle checks.
   - The lint must print nothing. Every warning is one finding on the scorecard. `just check`
     and the pre-commit hook run it too.
   - `bun audit` should list only the accepted advisories below. Fix a new one by raising the
     dependency, or, for a transitive one, the entry in `overrides` in the root `package.json`.
2. `just obsidian-e2e`.
3. Check that `eslint-plugin-obsidianmd` is the latest release (`bun outdated`). The scanner
   uses the current rule set; an older local copy misses rules the scanner applies.

After the release, open the plugin in the developer dashboard at community.obsidian.md, start a
scan, and read the Review section of the scorecard once it finishes. Record the result in the
tracking table in `docs/specs/obsidian-plugin-review.md`.

What the local lint cannot see, and how it is covered:

- The scanner resolves every file against Obsidian's typings, so it reports
  `document.createElement` in `packages/web` and `packages/core`, where the local typed rule is
  silent. A `no-restricted-syntax` entry in `eslint.obsidian.config.js` reports the same calls.
  Shared code creates elements with `getHost().newElement(tag)`.
- The scanner lints `packages/obsidian/e2e`. The preset treats that folder as tests and skips
  its Obsidian-runtime rules, so the config switches them back on there.
- Never silence an `obsidianmd/*` rule with an `eslint-disable` comment: the scanner counts the
  comment itself as an error and the rating drops to Failed.

Accepted findings, which stay on the scorecard:

- `Limn-X.Y.Z.dmg` listed as an extra release file. The desktop app shares the release;
  Obsidian does not download it. A separate tag for the desktop app sent the plugin to manual
  review, so the shared release stays.
- `deepmerge` advisory, through `vite-plugin-pwa`. No fixed version exists, and it is build
  tooling for the web app that never ships in the plugin.
- The notes that the plugin writes vault files and calls `atob`/`btoa`. Both are disclosures;
  the base64 calls are in the desktop app's bridge to its native side.

### GitHub release

Run `just bump` (patch bump) or `just bump X.Y.Z` (explicit version). This updates
all version files, commits, tags, and pushes. The GitHub Actions workflow at
`.github/workflows/release.yml` builds and attaches the three files to a GitHub release.
