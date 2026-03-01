# Obsidian Plugin

Limn is available as an Obsidian plugin. Files with the `.limn` extension open as interactive
mind map views inside Obsidian.

## Architecture

The plugin lives in `packages/obsidian/` and reuses the same core engine and React
components as the web app:

```
packages/core/       # Shared: Editor, layout, serialization, dispatch, undo
packages/web/        # Web PWA (Vite entry point) + shared React components
packages/obsidian/   # Obsidian plugin (esbuild entry point)
```

Key classes:

- **LimnView** extends Obsidian's `TextFileView`. Receives file content via `setViewData()`,
  returns it via `getViewData()`. Mounts an isolated React tree into the view container.
- **ObsidianPersistenceProvider** implements `PersistenceProvider` using Obsidian's vault API.
  Triggers saves via `TextFileView.requestSave()`. Stores image assets as sidecar files in
  a `.assets/` folder next to the `.limn` file.
- **DomTextMeasurer** is shared with the web app. The `createDomTextMeasurer(container)`
  factory appends the measurement element to the view container instead of `document.body`.

## File format

`.limn` files in Obsidian contain plain JSON (the `MindMapFileFormat` structure from
`@limn/core`) without ZIP wrapping, since Obsidian handles binary assets as separate
vault files. The web app stores `.limn` files as ZIP bundles.

Image assets are stored in a sidecar folder: `MyMap.assets/` alongside `MyMap.limn`.

## Local development setup

Prerequisites: [Bun](https://bun.sh), [just](https://github.com/casey/just), Obsidian.

### Build and install

```bash
just obsidian-install ~/path/to/your/vault
```

This builds the plugin and creates a symlink from
`<vault>/.obsidian/plugins/obsidian-limn/` to `packages/obsidian/dist/`.

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

### Manual testing checklist

After `just obsidian-install <vault>`:

- [ ] Create new `.limn` file in vault, verify it opens with mind map view
- [ ] Edit mind map (add nodes, move, delete), close file, reopen -- verify persistence
- [ ] Cmd+Z / Cmd+Shift+Z undo/redo works
- [ ] Keyboard navigation (arrows, Enter, Tab) works
- [ ] Paste image, verify sidecar `.assets/` folder created
- [ ] Open same file in two panes, verify no conflicts
- [ ] File renamed in vault sidebar -- verify view updates

## Building for distribution

```bash
just obsidian-build
```

Produces three files in `packages/obsidian/dist/`:
- `main.js` -- bundled plugin
- `manifest.json` -- plugin metadata
- `styles.css` -- plugin styling

### GitHub release

Create a tag matching `obsidian-v*` and push. The GitHub Actions workflow at
`.github/workflows/obsidian-release.yml` builds and attaches the three files to a
GitHub release.

### Beta testing with BRAT

Before community plugin listing, testers can install via the
[BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin:
1. Install BRAT from Obsidian community plugins
2. Add the repo URL in BRAT settings
3. BRAT downloads the latest release assets automatically
