# Obsidian Plugin Review — Raising the Scorecard

Tracking checklist for resolving the automated-review findings on the Limn community plugin. The plugin **is already published** (<https://community.obsidian.md/plugins/limn>) — Obsidian's new automated system lists plugins publicly even when checks fail, surfacing the findings on a public Scorecard tab instead of blocking publication.

**Current state (2026-05-12):**

- Overall scorecard: **43%**
- Health: Excellent
- Review: Risks — **142 issues found by automated scans**
- Disclosures (8): external domain access, 1 `fetch()` call, vault write, etc.
- Malware scan: "not available" (likely tied to missing artifact attestations)
- Vulnerable dependencies scan: "not available"

Source dashboards: <https://community.obsidian.md/account/plugins/limn> (private) and <https://community.obsidian.md/plugins/limn> (public).

Work items roughly in order. Phase 1 = highest-impact issues already enumerated by the reviewer. Phase 2 = the bulk of the 142 warning count (architectural). Phase 3 = scorecard-only items (attestations, malware/dep scan enablement).

After each phase, bump the plugin version, push a fresh tag, then re-check both dashboards to see how the scorecard moves.

---

## Phase 1 — Highest-impact: the explicit Errors + the DMG contamination + the suspicious-behavior flag

### 1. Stop shipping the desktop DMG in the plugin release ✓

The current `release.yml` and `release-desktop.yml` both trigger on tags matching `[0-9]*`, so they upload to the same GitHub release. The reviewer sees `Limn-0.9.11.dmg` alongside `main.js` and flags it.

- [x] Decide on a desktop-only tag pattern: `desktop-[0-9]*`.
- [x] Update `.github/workflows/release-desktop.yml`:
  - Trigger pattern changed to `desktop-[0-9]*`.
  - Version extraction now strips the `desktop-` prefix: `version=${GITHUB_REF_NAME#desktop-}`.
  - Homebrew cask URL updated to `https://github.com/tednaleid/limn/releases/download/desktop-#{version}/Limn-#{version}.dmg`.
- [x] Update `scripts/bump-version.ts` to push **both** `${newVersion}` and `desktop-${newVersion}` at the same commit.
- [ ] After the next release runs, manually `gh release view 0.9.12` and verify only three assets: `main.js`, `manifest.json`, `styles.css`. Verify `gh release view desktop-0.9.12` has only the DMG.

> **Note:** The Obsidian community plugin manifest still uses the plain `0.9.11`-style tag for downloads (Obsidian reads `manifest.json#version` and pulls assets from a release of that exact name), so the plugin tag MUST stay as the bare version. The desktop tag is the one that moved.

### 2. Resolve the "suspicious behaviors" flag (setInterval + network)

False positive — the `setInterval` is the auto-save timer and the `fetch` is unrelated SVG export image embedding. Easiest defuse is to swap the raw `fetch` for Obsidian's `requestUrl` so the scanner can't pair them. This also satisfies the matching Warning in the source-code section.

- [ ] In `packages/web/src/export/svg.ts:50`, replace `fetch(href)` with platform-injected loader so the Obsidian build can route through `requestUrl`.
  - **Simplest approach:** add a `imageLoader?: (url: string) => Promise<Blob>` optional parameter to the SVG export entry point. Default impl uses `fetch`. Obsidian's `LimnView` passes a version that uses `requestUrl`.
  - **Alternative:** since the only `blob:` URLs being loaded here come from the in-memory asset cache, consider bypassing `fetch` entirely and resolving from `AssetUrlContext` directly. Worth investigating — likely makes the call unnecessary in both web and Obsidian builds.
- [ ] Verify the existing SVG-export test still passes (or add one if missing).
- [ ] Commit.

### 3. Fix the four "Error"-level source-code findings

These are the ones the reviewer treats as must-fix (vs. recommendations).

#### 3a. `eslint-disable` comments without descriptions

Sites: `packages/web/src/App.tsx:225`, `packages/web/src/App.tsx:285`, `packages/web/src/persistence/desktop-bridge.ts:65`, `packages/web/src/persistence/desktop-persistence.ts:15`.

- [ ] At each site, replace the bare `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a typed alternative OR add a description: `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <why>`.
- [ ] Better: fix the underlying typing so the disable is unnecessary. The four sites all stash things on `globalThis`/`window` (debug bridge for Swift). Define a typed `LimnWindow` interface and cast once at module scope instead of inline-disabling per use.

Suggested shared type (drop in `packages/web/src/desktop-window.ts` or similar):

```ts
interface LimnDebugBridge {
  toJSON?: () => unknown;
  hasUnsavedChanges?: () => boolean;
  tabId?: string;
  docId?: string;
  revision?: number;
}
interface LimnWindow extends Window {
  limn?: LimnDebugBridge;
  webkit?: { messageHandlers?: Record<string, { postMessage: (msg: unknown) => void }> };
}
export const limnWindow = globalThis as unknown as LimnWindow;
```

Then `App.tsx:225-230` becomes:

```ts
if (!limnWindow.limn) limnWindow.limn = {};
limnWindow.limn.toJSON = () => editor.toJSON();
limnWindow.limn.hasUnsavedChanges = () => editor.hasUnsavedChanges();
```

No `any`, no eslint-disable.

- [ ] Apply the same pattern to `App.tsx:285`, `desktop-bridge.ts:65`, `desktop-persistence.ts:15`.
- [ ] Run `bunx eslint packages/web/src` and confirm zero `no-explicit-any` findings in those files.
- [ ] Commit.

#### 3b. `navigator.platform` in `packages/web/src/platform.ts:10`

Currently uses `navigator.userAgentData?.platform ?? navigator.platform`. The reviewer wants Obsidian's `Platform` API when running in Obsidian.

- [ ] Add a `Platform` injection seam so the web build keeps `navigator`-based detection but the Obsidian build uses Obsidian's API.

Proposed file restructure:

```ts
// packages/web/src/platform.ts
import type { Platform } from "@limn/core";

export function detectPlatformFromNavigator(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform
    ?? navigator.platform
    ?? "";
  return /mac/i.test(ua) ? "mac" : "other";
}

// Module-level default; tests and Obsidian can override via setPlatform()
let current: Platform = detectPlatformFromNavigator();
export const PLATFORM: () => Platform = () => current;
export function setPlatform(p: Platform): void { current = p; }
```

- [ ] Update `LimnView.ts` (Obsidian plugin) to call `setPlatform(Platform.isMacOS ? "mac" : "other")` during `onOpen`.
- [ ] Audit existing call sites that import `PLATFORM` as a constant — they need to call `PLATFORM()` now, OR keep the const and add `setPlatform` that mutates a wrapper object. Pick whichever is less invasive.
- [ ] Run tests, commit.

> **Open question:** Does anything in `@limn/web` import `PLATFORM` as a value rather than a function? Grep first; the answer determines whether to make it a getter or keep as const.

#### 3c. `element.style.cssText` in `DomTextMeasurer.ts:89` ✓

- [x] Replaced all four `el.style.cssText = …` / `+=` sites (`createMeasureElement`, `applyStyle`, `measure`, `reflow`) with individual property assignments. `applyStyle` now explicitly clears `whiteSpace`/`width`/`wordBreak` so a reused element starts clean before `measure`/`reflow` set their own values.
- [ ] Visual verification deferred (no in-session browser control); dev server starts clean, lint/typecheck/Obsidian build all green.

### 4. Cut the re-submission release

- [ ] Bump plugin version to 0.9.12 (and push `desktop-0.9.12` for the macOS app per Task 1).
- [ ] Wait for the release workflow to complete and confirm only `main.js`, `manifest.json`, `styles.css` are in the plugin release.
- [ ] Refresh <https://community.obsidian.md/account/plugins/limn> and check whether the status flips to "Approved" or still shows warnings.
- [ ] If approved: skip Phase 2 unless we want extra polish.
- [ ] If still failing: capture the new findings, update this doc, proceed to Phase 2.

---

## Phase 2 — Address the bulk of the 142 warnings

Most warnings exist because `packages/obsidian` imports rendering code from `@limn/web`, which targets the standalone PWA and uses raw DOM/window APIs. Obsidian wants those to use its popout-window-safe equivalents (`activeWindow`, `activeDocument`, `createEl`, etc.). This is a real conflict: the web package can't unconditionally use Obsidian APIs. These warnings drive most of the "142 issues" count on the scorecard.

Approach: add a thin **host abstraction** layer that defaults to plain DOM/window in the web build, and is overridden by Obsidian-API equivalents in the Obsidian build. Same pattern already used for `TextMeasurer`.

### 5. Define a `Host` interface in `packages/core`

- [ ] Create `packages/core/src/host.ts` defining:

```ts
export interface Host {
  setTimeout(cb: () => void, ms: number): number;
  clearTimeout(id: number): void;
  setInterval(cb: () => void, ms: number): number;
  clearInterval(id: number): void;
  document: Document;
  fetchBlob(url: string): Promise<Blob>;
  createElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
}
```

- [ ] Export a default `webHost: Host` from `packages/web/src/host.ts` that wraps `window`/`document`/`fetch`.
- [ ] Wire `Host` injection through `AutoSaveController` (currently uses bare `setTimeout`/`setInterval` at `AutoSaveController.ts:29,37,39,67,83,85`).
- [ ] Commit.

### 6. Migrate web/ DOM call sites to go through Host

This is the bulk of the warnings. Touch each file in turn.

- [ ] `packages/web/src/text/DomTextMeasurer.ts:16,21,58,63,65,69,71,76,77,78` — replace `document.createElement` with `host.createElement`. Replace `document.createElement("div")` with `host.createElement("div")` (later swap to `createDiv()` in the Obsidian host impl).
- [ ] `packages/web/src/components/MindMapCanvas.tsx:327,425` — same `document` → `host.document` swap.
- [ ] `packages/web/src/export/svg.ts:118,122,142,169,189,209` — same. Includes the `createElement("canvas")` and `createElement("a")` sites.
- [ ] `packages/web/src/main.tsx:12` and `packages/web/src/theme/themes.ts:35` — same.
- [ ] `packages/web/src/persistence/desktop-persistence.ts:170,192`, `packages/web/src/components/FileStatusBar.tsx:23,27`, `packages/web/src/components/MindMapCanvas.tsx:358,362,370`, `packages/web/src/input/useKeystrokeOverlay.ts:61,65,72,75`, `packages/web/src/App.tsx:476` — replace bare `setTimeout`/`clearTimeout`/`returnValue` with `host` equivalents.
- [ ] Run full test suite after each file. Commit per logical group.

### 7. Implement the Obsidian `Host`

- [ ] In `packages/obsidian/src/`, create `ObsidianHost.ts` implementing `Host`:
  - `setTimeout`/`setInterval` → `activeWindow.setTimeout(...)` etc.
  - `document` → `activeDocument`
  - `fetchBlob(url)` → use `requestUrl` and convert the response to a Blob.
  - `createElement("div")` → use `createDiv()`; other tags → `createEl(tag)`.
- [ ] In `LimnView.onOpen`, set the active host before mounting React. Reset on close.
- [ ] Verify the Obsidian plugin still loads and renders a mind map (`just obsidian-dev` or whatever the local Obsidian dev loop is — check `Justfile`).
- [ ] Commit.

### 8. Handle remaining unsafe-`any` warnings

After 3a the App.tsx/desktop-bridge/desktop-persistence ones should be gone. Remaining hot spots:

- `packages/obsidian/src/LimnView.ts:65,68,136,165` — `Unsafe assignment` / `casting to TFile`. The TFile cast should be replaced with an `instanceof TFile` narrowing check.
- `packages/web/src/persistence/WebPersistenceProvider.ts:67-70` — typed access to `window.limn.{tabId,docId,revision}`; covered by the `LimnWindow` interface in 3a if reused here.
- `packages/web/src/persistence/file.ts:69,87,102,136` — `MindMapFileFormat` casts. Either validate at the boundary with `migrateToLatest` (already exists in core) or add a typed `parseFileFormat()` that returns a discriminated union.
- `packages/web/src/persistence/desktop-persistence.ts:108,109,115` and `desktop-bridge.ts:75,78,83,88,110-112` — same as above; covered partly by `LimnWindow`.

- [ ] Apply fixes site by site. Commit per file.

### 9. Misc smaller warnings

- [ ] `packages/web/src/export/svg.ts:131` — control characters in regex. Look at the regex; if intentional (e.g. stripping invalid XML chars) wrap in `\u{0000}` style escapes that the linter accepts, or move to a constant with `eslint-disable-next-line` plus a description.
- [ ] `packages/web/src/persistence/desktop-persistence.ts:115`, `packages/web/src/persistence/file.ts:102,136` — "unnecessary assertion". Drop the redundant `as Foo` casts.

---

## Phase 3 — Scorecard polish: attestations, scan enablement, hygiene

These items target the scorecard panels that currently show "not available" or are flagged as Recommendations rather than Errors/Warnings. Doing them is what flips the scorecard from "Risks" to a higher tier.

### 10. GitHub artifact attestations on release assets ✓

Currently flagged on both `main.js` and `styles.css`. Likely also gates the "Malware scan not available" panel from running.

- [x] Added `actions/attest-build-provenance@v2` step in `.github/workflows/release.yml` between the build step and the `gh release create` step, with `id-token: write` + `attestations: write` permissions at the workflow level.
- [ ] Cut a release, verify the attestation shows up: `gh attestation list --repo tednaleid/limn`.
- [ ] Refresh the Obsidian scorecard and check whether "Malware scan" flips from "not available" to either "clean" or a specific finding.

Reference: <https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds>.

### 11. Hygiene gap: missing contributing guide ✓

The Health panel says "Has readme, license, description. Missing contributing guide." This is the only hygiene point losing us Health credit (currently Excellent anyway).

- [x] Add `CONTRIBUTING.md` at the repo root covering: bug reporting, dev setup, branching/PR conventions, architectural invariants, license.
- [ ] Confirm scorecard reflects it on next refresh.

### 12. Disclosures audit

The Scorecard lists 8 disclosures (these are informational, not findings, but worth understanding):

- Plugin might make requests to 1 external domain
- Found 1 `fetch()` call (resolved by Task 2 once `fetch` → `requestUrl`)
- Vault Write (`vault.modify`, `vault.create`)
- Other 5 items not yet captured

- [ ] Visit the disclosures section, list all 8, and decide whether each is accurate / needs disclosure in the plugin description.
- [ ] If the external-domain disclosure refers to the `fetch` in svg.ts (loading blob: URLs), it should auto-clear after Task 2. If it refers to something else (e.g. CDN load), investigate.
- [ ] Update plugin description on <https://community.obsidian.md/account/plugins/limn> if any disclosure needs user-facing context.

### 13. Architectural follow-up (optional, after scorecard is green)

- [ ] Audit whether `@limn/web` should be split into `@limn/render` (DOM rendering, host-agnostic) and `@limn/web-app` (the PWA shell, navigator/fetch/window-level concerns). The Obsidian plugin would only depend on `@limn/render`.
- [ ] Add CI step that runs Obsidian's lint rules (`eslint-plugin-obsidianmd` if available, or curate a subset) against `packages/obsidian` + the bundled `main.js` to catch regressions before re-submission.

---

## Pre-release checklist (run before each scorecard-refresh release)

- [ ] All in-flight phase items checked.
- [ ] `bunx tsc --noEmit` clean across the workspace.
- [ ] `bunx eslint` clean for `packages/obsidian/src` and `packages/web/src`.
- [ ] Plugin builds: `just build` (or whatever the Obsidian-plugin build target is — see `Justfile`).
- [ ] Smoke-test the built `main.js` in a real Obsidian vault.
- [ ] Bump version, push tag, watch CI, verify release assets, refresh both dashboards.
- [ ] Record before/after scorecard percentage in this doc so we can track progress.

## Scorecard tracking

| Date       | Version | Overall | Health    | Review | Issue count | Notes                       |
|------------|---------|---------|-----------|--------|-------------|-----------------------------|
| 2026-05-12 | 0.9.11  | 43%     | Excellent | Risks  | 142         | baseline; plugin published  |
