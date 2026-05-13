# Onboarding

Limn is a keyboard-first, offline-capable mind map. It ships as a web PWA, an
Obsidian plugin, and a native macOS app, all sharing one framework-agnostic
TypeScript core. Data stays local (IndexedDB in the browser, `.limn` ZIP files
on disk).

## Stack

- Language: TypeScript (strict), plus Swift/SwiftUI for the macOS app
- Frameworks: React 18, Vite, Obsidian plugin SDK, WKWebView
- Build: Bun workspaces (monorepo), Vite (web), esbuild (obsidian), XcodeGen + xcodebuild (desktop)
- Task runner: `just` (authoritative; see `justfile`)
- Test: vitest (TS), XCTest (Swift), Playwright (visual regression only)
- Lint / typecheck: ESLint, `tsc -b`

## Common commands

- Install: `just install`
- Test: `just test` (single file: `just test-file <name>`; watch: `just test-watch`)
- Lint: `just lint` (autofix: `just fmt`)
- Typecheck: `just typecheck`
- Coverage: `just coverage`
- Full CI check: `just check` (coverage + lint + typecheck + obsidian-build)
- Build: `just build` (Obsidian plugin); `just build-web` (web PWA)
- Run web dev server: `just serve` (Vite on http://localhost:5173)
- Desktop dev: `just desktop-dev` (needs `just serve` running)
- Desktop release install: `just desktop-release-install`
- Obsidian plugin build/install: `just obsidian-build`, `just obsidian-install <vault>`
- Version + release: `just bump [version]`, `just retag <version>`

## Architecture

Four workspace packages. `core` owns all state and logic with zero browser
dependencies; it exposes `Editor` (sole source of truth for document state),
layout, serialization, undo diffs, and a keyboard dispatch map. `web`,
`obsidian`, and `desktop` are thin shells that wire `core` to a host: `web`
renders SVG through React and persists to IndexedDB; `obsidian` mounts the same
React tree inside an Obsidian `FileView` and persists through the vault API;
`desktop` wraps the built web bundle in a Swift/SwiftUI WKWebView with a debug
HTTP server on `localhost:9876` for inspection. `TestEditor` drives the same
dispatch without a browser, which is why logic tests do not need Playwright.

## Key paths

- `packages/core/src/editor/` -- Editor class, mutation API
- `packages/core/src/store/` -- diff-based undo/redo, document vs session state
- `packages/core/src/keybindings/` -- key-to-action dispatch (shared with TestEditor)
- `packages/core/src/serialization/` -- `schema.ts`, `migration.ts`, golden fixtures
- `packages/core/src/layout/` -- layout engine (computed positions)
- `packages/web/src/App.tsx`, `packages/web/src/main.tsx` -- web entry points
- `packages/web/src/persistence/` -- IndexedDB + BroadcastChannel cross-tab sync
- `packages/obsidian/src/` -- `LimnView`, `ObsidianPersistenceProvider`
- `packages/desktop/Limn/` -- Swift app, WKWebView bridge, DebugServer
- `packages/desktop/project.yml` -- XcodeGen source of truth (`.xcodeproj` is generated)
- `scripts/bump-version.ts` -- version bump + tag + release notes
- `.github/workflows/` -- `ci.yml`, `deploy.yml` (GitHub Pages), `release.yml`, `release-desktop.yml`
- `adr/` -- architecture decision records

## How to run

```
just install
just serve
```

Opens the web app at http://localhost:5173/limn/. For the desktop app, run
`just desktop-dev` in a second terminal.

## Dig deeper

- [README.md](./README.md) -- user-facing overview, keyboard shortcuts, file format
- [TESTING.md](./TESTING.md) -- test philosophy, debug server, `/desktop-inspect` skill
- [DESKTOP-APP.md](./DESKTOP-APP.md) -- macOS build, signing, notarization, packaging
- [OBSIDIAN-PLUGIN.md](./OBSIDIAN-PLUGIN.md) -- plugin architecture, BRAT install, dev setup
- [adr/](./adr/) -- architecture decision records
