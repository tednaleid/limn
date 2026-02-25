# MindForge: Product Requirements Document

A keyboard-first, offline-capable mind map application built as a web-first PWA with a testable TypeScript core engine.

---

## 1. Vision and goals

MindForge is a mind mapping tool that prioritizes keyboard-driven interaction, local-first data ownership, and automated testability. It draws UX inspiration from MindNode and Miro's mind map mode — tools that nail the diagramming experience but suffer from cloud-lock-in, app-store gatekeeping, and inaccessibility in enterprise environments.

The core thesis is that by building the engine as a framework-agnostic TypeScript library with a programmatic Editor API (inspired by tldraw's architecture), we get three things simultaneously: a fast, keyboard-driven user experience; a file format that lives happily in git; and an application that Claude Code can test and verify with high confidence.

### Success criteria

- A user can create, navigate, and edit a 500-node mind map using only the keyboard
- All mind map operations are testable without a browser via a TestEditor class
- Files save as human-readable JSON with clean git diffs
- The app works fully offline after first load
- Claude Code can implement features and verify correctness through the test suite in a single session

---

## 2. Requirements

### Hard requirements

| # | Requirement | Notes |
|---|-------------|-------|
| H1 | Works on macOS | Web-first PWA; installable via Chrome "Add to Dock" or Safari 17+ |
| H2 | Git-friendly file format | JSON with computed positions, sorted keys, sidecar directory for images |
| H3 | First-class keyboard support | MindNode-style: Tab=child, Enter=sibling, arrows=navigate, distinct nav/edit modes |
| H4 | High testability by Claude Code | TestEditor pattern (tldraw-inspired) — all interactions simulatable without a browser |
| H5 | Collapsible nodes | Toggle collapse with keyboard shortcut; collapsed state persisted in file |
| H6 | Automated test suite | Unit tests via Vitest + TestEditor; Playwright for visual regression only |
| H7 | Image support | Drag-and-drop images into nodes; resize handles; sidecar asset storage |

### Soft requirements

| # | Requirement | Notes |
|---|-------------|-------|
| S1 | PDF export | Via browser print-to-PDF or jsPDF |
| S2 | SVG export | Serialize the rendered SVG element directly |
| S3 | Markdown export | Walk tree, generate indented headings |
| S4 | Smooth animations | Layout transitions when adding/removing/collapsing nodes |

### Nice to have

| # | Requirement | Notes |
|---|-------------|-------|
| N1 | URL-based sharing | lz-string compressed JSON in URL hash; practical up to ~100 nodes |
| N2 | Obsidian plugin | Same core engine wrapped as an Obsidian ItemView; .mindmap.md file format |
| N3 | Tauri desktop wrapper | For native menus, file associations, filesystem watching if needed later |

### Not in scope (current version)

- Multi-user real-time collaboration
- Mobile or tablet use
- Cloud storage or sync service

---

## 3. Technology stack

### Core engine (no framework dependencies)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Language | TypeScript (strict mode) | Type safety, IDE support, Claude Code compatibility |
| Test runner | Vitest | Fast, ESM-native, compatible with TestEditor pattern |
| Layout | @dagrejs/dagre | Sugiyama-style tree layout; computes node positions from tree structure |
| Validation | zod | Runtime schema validation for file format |

### Web application

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Rendering | SVG via React (custom components) | DOM-based rendering for testability and accessibility |
| Viewport | Custom pan/zoom (pure math) | scrollX/scrollY/zoom as Editor state; CSS transforms; no library needed (Excalidraw pattern) |
| Framework | React 19 + TypeScript | Component rendering; signals-style reactivity via useSyncExternalStore |
| Build | Vite | Dev server, HMR, production bundling |
| File I/O | browser-fs-access | File System Access API with Safari/Firefox fallback |
| Offline | Service worker (Workbox) | Cache app shell for offline use |
| Local storage | IndexedDB (via idb-keyval) | Auto-save between sessions |
| Package manager | Bun | Fast installs; Node.js used by Playwright at test time |

### Why not React Flow?

React Flow provides excellent out-of-the-box pan/zoom/drag for node-based UIs. However, it owns the interaction model — its event handling, selection system, and keyboard shortcuts would conflict with routing all interactions through our Editor API. The TestEditor pattern requires that the Editor is the sole source of truth for all state mutations, which means we need full control over the event pipeline. Building a simpler SVG renderer with custom pan/zoom (pure math, following the Excalidraw pattern) costs more upfront but pays off in testability and architectural clarity.

### Why web-first (not Electron/Tauri)?

Excalidraw proved this model: they deprecated their Electron app because the web became good enough. For our priorities specifically, a web app gives us first-class Playwright support (vs. experimental for Electron, nonexistent for Tauri on macOS), zero-install distribution, and the simplest possible CI/CD. If native features (menu bar, file associations, filesystem watching) become essential later, wrapping the same web frontend in Tauri is a documented, low-friction migration.

---

## 4. Architecture

### Architectural principles (learned from tldraw)

1. **The Editor is the source of truth, not the DOM.** All state mutations flow through the Editor API. The DOM is a rendering target. This enables the TestEditor pattern.
2. **Diff-based undo, not command-based.** The store captures diffs for every mutation automatically. Undo inverts the diff. No need to maintain Command classes for every operation.
3. **Flat runtime model, nested file format.** In memory, nodes live in a flat Map keyed by ID with both `parentId` and `children[]` references (O(1) parent lookup, ordered child traversal). On disk, they serialize as a nested tree (clean diffs, human-readable).
4. **Positions are computed, never stored.** The layout algorithm produces positions from the tree structure at render time. The file stores only structure, text, and metadata — never coordinates.
5. **Images stored as sidecar files.** Binary assets live in a `{name}.assets/` directory alongside the JSON file, referenced by relative path. This keeps the JSON diffable and the assets manageable in git.

### Package/module structure

```
packages/
  core/               # Zero-dependency TypeScript library
    src/
      model/           # MindMapNode, MindMap, CrossLink types
      store/           # Reactive store with diff tracking
      editor/          # Editor class — all operations
      layout/          # @dagrejs/dagre integration, position computation
      serialization/   # JSON ↔ model, markdown export
      test-editor/     # TestEditor subclass for testing
      operations/      # Grouped mutation functions (not Command pattern)

  web/                 # React web application
    src/
      components/      # SVG node renderer, edge renderer, viewport
      hooks/           # useEditor, useMindMap, useKeyboardNav
      input/           # Keyboard handler, mouse handler → Editor dispatch
      persistence/     # browser-fs-access integration, IndexedDB auto-save
      export/          # SVG export, PDF export, PNG export
      service-worker/  # Workbox offline caching
```

The `core` package has zero browser or React dependencies. It can be used in Node.js, Vitest, an Obsidian plugin, or a Tauri app. The `web` package is the React PWA that renders the core engine.

### Data model

```typescript
interface MindMapNode {
  id: string;              // Stable unique ID (nanoid)
  parentId: string | null; // null for root node only
  text: string;            // Node content (supports multi-line via Shift+Enter)
  children: string[];      // Ordered child IDs (sibling order matters)
  collapsed: boolean;      // Whether children are hidden
  style?: NodeStyle;       // Optional color, shape overrides
  image?: ImageRef;        // Optional attached image
}

interface ImageRef {
  assetId: string;         // References an asset in the asset registry
  width: number;           // Display width
  height: number;          // Display height
}

interface CrossLink {
  id: string;
  sourceId: string;        // Node ID
  targetId: string;        // Node ID
  label?: string;
}

interface Asset {
  id: string;
  filename: string;        // Relative path in sidecar directory
  mimeType: string;
  width: number;           // Original dimensions
  height: number;
}

interface MindMap {
  root: string;            // Root node ID
  nodes: Map<string, MindMapNode>;  // Flat node map (runtime)
  crossLinks: CrossLink[];
  assets: Asset[];
  meta: {
    version: number;
    theme: string;
    layoutMode: 'standard' | 'right' | 'down';  // standard: root center, children balanced left/right; right: all children to the right; down: top-to-bottom org chart
  };
}
```

### File format (.mindmap)

On disk, the flat map serializes as a nested tree for readability and clean diffs. Keys are sorted. No positions stored. The `parentId` field is omitted (parent is implicit from nesting). The `children` field changes from an array of ID strings (runtime) to an array of inline node objects (file format). The `collapsed` field is omitted when `false` (the default) to reduce noise.

```json
{
  "version": 1,
  "meta": { "theme": "default", "layoutMode": "standard" },
  "root": {
    "id": "n0",
    "text": "Project Plan",
    "children": [
      {
        "id": "n1",
        "text": "Phase 1",
        "children": [
          { "id": "n3", "text": "Research", "children": [] },
          {
            "id": "n4",
            "text": "Architecture",
            "children": [],
            "image": { "assetId": "a1", "width": 400, "height": 300 }
          }
        ]
      },
      {
        "id": "n2",
        "text": "Phase 2",
        "collapsed": true,
        "children": [
          { "id": "n5", "text": "Implementation", "children": [] }
        ]
      }
    ]
  },
  "crossLinks": [
    { "id": "cl1", "sourceId": "n3", "targetId": "n5", "label": "informs" }
  ],
  "assets": [
    { "id": "a1", "filename": "assets/arch-diagram.png", "mimeType": "image/png", "width": 1200, "height": 900 }
  ]
}
```

A file named `project.mindmap` with images would have a sibling directory `project.assets/` containing the referenced image files.

### Editor API (core operations)

```typescript
class Editor {
  // State access
  getNode(id: string): MindMapNode;
  getChildren(id: string): MindMapNode[];
  getParent(id: string): MindMapNode | null;
  getSiblings(id: string): MindMapNode[];
  getSelectedId(): string | null;
  isCollapsed(id: string): boolean;
  getVisibleNodes(): MindMapNode[];  // Respects collapsed state

  // Mutations (all produce tracked diffs for undo)
  addChild(parentId: string, text?: string): string;      // Returns new node ID
  addSibling(nodeId: string, text?: string): string;
  addSiblingAbove(nodeId: string, text?: string): string;
  deleteNode(nodeId: string): void;
  setText(nodeId: string, text: string): void;
  moveNode(nodeId: string, newParentId: string, index?: number): void;
  reorderNode(nodeId: string, direction: 'up' | 'down'): void;
  toggleCollapse(nodeId: string): void;
  setNodeImage(nodeId: string, asset: Asset): void;
  removeNodeImage(nodeId: string): void;

  // Navigation and selection
  select(nodeId: string): void;
  selectParent(): void;
  selectFirstChild(): void;
  selectNextSibling(): void;
  selectPrevSibling(): void;

  // Edit mode
  enterEditMode(): void;
  exitEditMode(): void;
  isEditing(): boolean;

  // History
  undo(): void;
  redo(): void;
  markHistory(label: string): void;  // Named undo boundary

  // Cross-links
  addCrossLink(sourceId: string, targetId: string, label?: string): void;
  removeCrossLink(id: string): void;

  // Camera
  setCamera(x: number, y: number, zoom: number): void;
  zoomToFit(): void;
  zoomToNode(nodeId: string): void;

  // Serialization
  toJSON(): MindMapFileFormat;
  loadJSON(data: MindMapFileFormat): void;
  toMarkdown(): string;

  // Events (for UI binding)
  on(event: EditorEvent, handler: Function): void;
  off(event: EditorEvent, handler: Function): void;

  // Store access (for reactive UI)
  subscribe(selector: (state) => T, callback: (value: T) => void): Unsubscribe;
}
```

### TestEditor (extends Editor for testing)

```typescript
class TestEditor extends Editor {
  // Simulated input (no DOM required)
  pointerDown(nodeId: string): this;
  pointerMove(x: number, y: number): this;
  pointerUp(): this;
  keyDown(key: string, modifiers?: Modifiers): this;
  keyUp(key: string): this;
  pressKey(key: string, modifiers?: Modifiers): this; // keyDown + keyUp
  type(text: string): this;  // Simulates typing in edit mode

  // Assertions
  expectSelected(nodeId: string): this;
  expectEditing(nodeId: string): this;
  expectNotEditing(): this;
  expectCollapsed(nodeId: string): this;
  expectExpanded(nodeId: string): this;
  expectNodeCount(count: number): this;
  expectChildren(parentId: string, childIds: string[]): this;
  expectText(nodeId: string, text: string): this;

  // Convenience
  selectAndTab(): string;  // Select current + Tab to create child
  selectAndEnter(): string; // Select current + Enter to create sibling

  // State inspection
  getCommandHistory(): HistoryEntry[];
  getEventLog(): EditorEvent[];
  getLayoutPositions(): Map<string, {x: number, y: number}>;
}
```

Example test:
```typescript
test('Tab creates a child node and enters edit mode', () => {
  const editor = new TestEditor();
  editor.loadJSON(sampleMap);
  editor.select('n1');

  const childId = editor.pressKey('Tab').getSelectedId();

  editor
    .expectEditing(childId)
    .expectChildren('n1', ['n3', 'n4', childId]);
});

test('Cmd+Z undoes node creation', () => {
  const editor = new TestEditor();
  editor.loadJSON(sampleMap);
  editor.select('n1');

  editor.pressKey('Tab');  // Create child
  editor.expectNodeCount(6);

  editor.pressKey('z', { meta: true });  // Undo
  editor.expectNodeCount(5);
});
```

---

## 5. Keyboard navigation specification

### Mode model

The app has two distinct modes, following the MindNode/Excel paradigm:

**Navigation mode** (default): Keyboard input operates on tree structure. Arrow keys move selection. Tab/Enter create nodes. Shortcuts modify the selected node.

**Edit mode** (entered via F2 or double-click): Keyboard input goes to an absolutely-positioned textarea overlaid on the node (not SVG foreignObject, which has cross-browser issues). Arrow keys move within text. Escape exits to navigation mode. Creating a new node (Tab/Enter) automatically enters edit mode for that node. Nodes support multi-line text: Shift+Enter inserts a newline, Enter exits edit mode and creates a sibling, Tab exits edit mode and creates a child.

### Keyboard shortcuts (navigation mode)

| Action | macOS shortcut | Behavior |
|--------|---------------|----------|
| **Node creation** | | |
| Create child | Tab | New child of selected node; enters edit mode |
| Create sibling below | Enter | New sibling after selected node; enters edit mode |
| Create sibling above | Shift+Enter | New sibling before selected node; enters edit mode |
| **Navigation** | | |
| Left | ← | Collapse expanded node; if already collapsed or leaf, move to parent |
| Right | → | Expand collapsed node; if already expanded, move to first child |
| Down | ↓ | Move to next visually-below node (can cross parent boundaries) |
| Up | ↑ | Move to previous visually-above node (can cross parent boundaries) |
| **Editing** | | |
| Enter edit mode | F2 or ⌘+Enter | Cursor in selected node's text |
| Exit edit mode | Escape | Return to navigation mode |
| Delete node | Backspace or Delete | Remove node (children reparented to grandparent); no-op on root |
| Delete node and children | ⌘+Backspace | Remove entire subtree; no-op on root |
| **Structure** | | |
| Collapse/expand | Space | Toggle selected node's collapsed state |
| Move node up | ⌘+↑ | Reorder among siblings |
| Move node down | ⌘+↓ | Reorder among siblings |
| Indent (make child of prev sibling) | ⌘+] | Reparent node |
| Outdent (make sibling of parent) | ⌘+[ | Reparent node |
| **History** | | |
| Undo | ⌘+Z | Invert last diff |
| Redo | ⇧+⌘+Z | Reapply last undone diff |
| **View** | | |
| Zoom to fit | ⌘+0 | Fit all visible nodes in viewport |
| Zoom to selection | ⌘+1 | Center and zoom to selected node |
| Zoom in | ⌘+= | Increase zoom |
| Zoom out | ⌘+- | Decrease zoom |
| **File** | | |
| Save | ⌘+S | Save to current file (or download) |
| Open | ⌘+O | Open file picker |
| Export as SVG | ⇧+⌘+E | Export visible map as SVG |

### Navigation traversal rules

Arrow key navigation follows the visual layout, not the data structure:

- **↓/↑** move through a flattened pre-order traversal of visible nodes (the order you'd read them top-to-bottom on screen). This naturally crosses parent boundaries -- e.g., moving down from the last child of one subtree lands on the next sibling of the parent.
- **→** expands a collapsed node OR moves to first child
- **←** collapses an expanded node OR moves to parent

When a node is created (Tab or Enter), the map automatically scrolls to keep the new node visible and the layout smoothly animates to accommodate the new position.

---

## 6. Undo/redo system (diff-based)

Following tldraw's architecture, undo/redo is automatic and diff-based rather than command-based.

### How it works

1. Every store mutation produces a `RecordsDiff` — a structure with `added`, `updated` (as `[before, after]` pairs), and `removed` entries.
2. Named **marks** define undo boundaries. Operations like `addChild` call `editor.markHistory('add-child')` before mutating.
3. `editor.undo()` collects all diffs since the last mark, inverts them (swap added↔removed, reverse updated pairs), and applies the inverse diff.
4. Continuous operations (like typing text or dragging) produce many small diffs that are **squashed** into a single undo entry when the operation completes.

### Benefits over command pattern

- No need to write and maintain a Command class for every operation
- Any mutation is automatically undoable — no operations can accidentally bypass the system
- The diff format doubles as the persistence format (save only what changed) and the future multiplayer sync format
- History is inspectable: Claude Code can verify the exact sequence of state changes

---

## 7. Image support

### User interaction

- Drag an image file from Finder onto a node → image attaches to that node
- Drag an image onto the canvas (not a node) → creates a new node with the image
- Paste an image from clipboard → attaches to selected node
- Resize handles on the image corners; free resize by default (hold Shift to constrain aspect ratio)
- Delete key on a selected image removes the image from the node (not the node itself)

### Storage

Images are stored as separate files in a sidecar directory:

```
project.mindmap          # JSON file
project.assets/          # Sidecar directory
  img-a1b2c3.png         # Referenced by assetId in JSON
  img-d4e5f6.jpg
```

In the browser (before explicit save), images are held in memory as Blob URLs and persisted to IndexedDB alongside the auto-saved document state.

### Asset lifecycle

1. **On drop/paste**: Image is read as ArrayBuffer, assigned a unique assetId, stored in IndexedDB, and displayed immediately via Blob URL
2. **On save to file**: JSON is written to the `.mindmap` file; images are written to the `.assets/` directory (Chrome File System Access API writes directly; Safari/Firefox triggers a zip download containing both)
3. **On load from file**: Images are read from the `.assets/` directory (or extracted from zip) and cached in IndexedDB
4. **Orphan cleanup**: When a node's image reference is removed, the asset is garbage-collected on next save if no other node references it

---

## 8. Persistence and file I/O

### Auto-save (IndexedDB)

Every mutation is debounced (500ms) and auto-saved to IndexedDB via `idb-keyval`. This survives tab closes and browser restarts. A `persistenceKey` identifies each document. Cross-tab sync uses BroadcastChannel with last-write-wins (timestamp comparison) to keep multiple tabs consistent. No merge logic for v1.

### Explicit save (File System Access API)

On Chromium (Chrome, Edge): `showSaveFilePicker()` returns a writable file handle. Subsequent saves reuse the handle without re-prompting. The title bar shows the filename.

On Safari/Firefox: Fallback to `<a download>` which triggers a file download. For maps with images, the fallback bundles everything into a `.mindmap.zip`.

The `browser-fs-access` library handles this detection and fallback automatically.

### File format versioning

Every `.mindmap` file includes a `version` number. On load, the app checks the version and runs forward migrations if needed. Migrations are ordered functions that transform the JSON structure. The app can always read older versions but saves in the current version.

---

## 9. Export

| Format | Approach | Fidelity |
|--------|----------|----------|
| SVG | `XMLSerializer.serializeToString()` on the rendered SVG element | Pixel-perfect |
| PNG | SVG → Canvas → `toDataURL('image/png')` | Pixel-perfect |
| PDF | `window.print()` with `@media print` CSS or jsPDF | Good |
| Markdown | Walk tree, generate `# H1`, `## H2`, `- items` by depth | Structure only |
| JSON (raw) | `editor.toJSON()` | Complete |
| URL | lz-string compress JSON → URL hash fragment | Complete (size-limited) |

---

## 10. Development plan

### Principles for Claude Code sessions

Each chunk is scoped to be completable in a single Claude Code session (~100–500 lines changed). Every chunk ends with passing tests. The project maintains three living documents:

- **CLAUDE.md**: Under 150 lines. Stack, directory structure, key commands, architectural patterns. Read by Claude Code at session start.
- **SPEC.md**: This PRD (or a condensed version). The authoritative specification.
- **PROGRESS.md**: Completed chunks, current state, known issues, next chunk details.

### Phase 1 — Foundation (Chunks 1–4)

| Chunk | Scope | Deliverables | Tests |
|-------|-------|-------------|-------|
| **1. Scaffold** | TypeScript project with Vitest, build pipeline, CLAUDE.md, PROGRESS.md | `core/` and `web/` package structure; `bun install && bun run test` passes | Smoke test |
| **2. Data model** | MindMapNode, MindMap types; flat store with parentId references; tree operations (add child, add sibling, delete, reparent, reorder) | `core/src/model/`, `core/src/store/` | Unit tests for all tree operations |
| **3. Serialization** | JSON round-trip (nested file ↔ flat runtime); markdown export; file format validation with zod | `core/src/serialization/` | Serialize → deserialize → equality; snapshot tests for markdown output |
| **4. Editor + TestEditor** | Editor class with store, mutation methods, history marks, diff-based undo/redo; TestEditor with simulated keyboard/pointer input and assertion methods | `core/src/editor/`, `core/src/test-editor/` | Undo/redo tests; keyboard simulation tests; history inspection tests |

Chunks 2 and 3 can be developed in parallel (they share types but are otherwise independent).

### Phase 2 — Layout and rendering (Chunks 5–7)

| Chunk | Scope | Deliverables | Tests |
|-------|-------|-------------|-------|
| **5. Layout engine** | @dagrejs/dagre integration; compute positions from tree; handle collapsed subtrees; standard mind map layout (root center, children balanced left/right) | `core/src/layout/` | Position snapshot tests; collapsed subtree exclusion tests |
| **6. SVG renderer** | React components for nodes, edges, labels; custom pan/zoom viewport; render from Editor state | `web/src/components/` | Playwright visual regression screenshots |
| **7. Node styling** | Colors, shape variants, collapse indicators, selected/focused states; CSS | `web/src/components/` | Playwright screenshot comparisons |

### Phase 3 — Interaction (Chunks 8–12)

| Chunk | Scope | Deliverables | Tests |
|-------|-------|-------------|-------|
| **8. Keyboard navigation** | Arrow key traversal, Tab/Enter creation, focus management, mode switching (nav/edit) | `web/src/input/keyboard.ts`; wired to Editor | TestEditor keyboard tests (the bulk of testing happens here) |
| **9. Text editing** | Absolutely-positioned textarea over canvas (not foreignObject); F2 to enter, Escape to exit; auto-enter on node creation; zoom-aware transforms | `web/src/components/EditableNode.tsx` | TestEditor type() tests; Playwright text rendering verification |
| **10. Collapse/expand** | Toggle collapse, Space shortcut, animated transitions for showing/hiding children | Wired through Editor | TestEditor collapse state tests |
| **11. Mouse interaction** | Click to select, double-click to edit, drag to pan (on canvas), drag to reparent (on nodes), scroll to zoom | `web/src/input/mouse.ts` | TestEditor pointer simulation tests |
| **12. Image support** | Drag-and-drop images, paste from clipboard, resize handles, asset registry, sidecar storage | `core/src/model/assets.ts`; `web/src/components/ImageNode.tsx` | Unit tests for asset lifecycle; Playwright drag-drop E2E |

### Phase 4 — Persistence (Chunks 13–14)

| Chunk | Scope | Deliverables | Tests |
|-------|-------|-------------|-------|
| **13. IndexedDB auto-save** | Debounced auto-save, load on startup, cross-tab sync via BroadcastChannel, persistenceKey management | `web/src/persistence/local.ts` | Integration tests with mock IndexedDB |
| **14. File save/load** | browser-fs-access integration; save/open workflows; zip fallback for Safari/Firefox with images | `web/src/persistence/file.ts` | Integration tests; Playwright file dialog tests |

### Phase 5 — PWA and polish (Chunks 15–18)

| Chunk | Scope | Deliverables | Tests |
|-------|-------|-------------|-------|
| **15. Service worker** | Workbox setup, offline caching, update notification banner | `web/src/service-worker/` | Playwright offline simulation tests |
| **16. Export** | SVG export, PNG export, markdown export, URL sharing (lz-string) | `web/src/export/` | Snapshot tests for SVG/markdown output; URL round-trip tests |
| **17. Animations** | Smooth layout transitions on add/remove/collapse; spring physics or CSS transitions | `web/src/components/` | Visual regression tests |
| **18. Performance + accessibility** | Viewport culling for large maps; screen reader audit; keyboard focus indicators; performance benchmarks at 500 and 1000 nodes | Across packages | Performance benchmarks; axe-core audit |

### Parallelization opportunities

- Chunks 2 + 3 (data model + serialization): independent
- Chunks 8 + 11 (keyboard + mouse): independent input handlers
- Chunks 13 + 16 (persistence + export): independent features

This parallelization can cut total development time by ~20-25%.

---

## 11. Testing strategy

### Three-layer testing pyramid

**Layer 1: Unit tests via TestEditor (90% of tests)**. The TestEditor simulates all user interactions programmatically — keyboard events, pointer events, state transitions — without a browser. Tests run in milliseconds. This is where the vast majority of correctness verification happens: tree operations, keyboard navigation, undo/redo, collapse/expand, mode switching, text editing state machine, and edge cases.

**Layer 2: Visual regression via Playwright (~8% of tests)**. Playwright launches the web app on localhost, takes screenshots, and compares against baselines. This verifies that the SVG rendering, layout positions, animations, and styling look correct. These tests are slower (seconds each) but catch rendering bugs that unit tests cannot.

**Layer 3: Integration/E2E via Playwright (~2% of tests)**. Full user flows: open file → edit → save → reopen → verify. File dialog interactions, service worker offline behavior, export workflows. These are the most expensive tests and cover the thin integration layer between the core engine and browser APIs.

### What Claude Code can verify

The TestEditor pattern means Claude Code can verify its work by running `bun run test` after every change. The test output shows exactly which operations succeeded and which failed. No need to launch a browser, inspect screenshots, or parse DOM output. This tight feedback loop — write code, run tests, see results, iterate — is the core enabler for AI-assisted development of this project.

### Test naming convention

```
describe('Editor > addChild', () => {
  test('creates a new child node with empty text', ...);
  test('inserts child at end of children list', ...);
  test('auto-selects the new child', ...);
  test('enters edit mode on the new child', ...);
  test('produces an undoable diff', ...);
  test('does nothing if node is not found', ...);
});
```

---

## 12. Open questions and future considerations

### Graph vs. tree

The data model is tree-first with cross-links as an overlay, matching every major mind map tool. Cross-links are visual connections that don't affect layout. If future use cases demand a true graph model (e.g., concept mapping), the cross-link system can be extended without changing the tree layout algorithm.

### Obsidian plugin

The core engine's zero-dependency design makes an Obsidian plugin viable. The plugin would: register an ItemView, render the React component into `contentEl`, store files as `.mindmap.md` (markdown with embedded JSON in a code block), and use Vault API for persistence. This is ~3 chunks of additional work once the core is stable. The Excalidraw Obsidian plugin validates this approach at scale (~49,000 lines of code wrapping the Excalidraw React component).

### Multiplayer (future)

The diff-based undo system produces exactly the data structure needed for operational transform or CRDT-based sync. If multiplayer is ever added, the store's `RecordsDiff` format can be transmitted over WebSocket with minimal adaptation. tldraw's `@tldraw/sync` package demonstrates this pattern.

---

## Appendix A: Prior art and influences

| Tool | What we take from it | What we avoid |
|------|---------------------|---------------|
| **MindNode** | Keyboard model (Tab/Enter), layout aesthetics, smooth animations | App Store lock-in, proprietary format |
| **Miro** | Mind map auto-layout, collaborative feel | Cloud dependency, enterprise pricing |
| **Excalidraw** | Web-first PWA architecture, browser-fs-access, URL sharing, Obsidian plugin path | Canvas 2D rendering (we use SVG/DOM for testability) |
| **tldraw** | Editor/TestEditor architecture, diff-based undo, signals-style reactivity, package layering | Canvas complexity beyond our needs, full drawing tool scope |
| **draw.io** | Offline-first, multiple storage backends, Electron as optional wrapper | XML-based format, older architecture |

## Appendix B: File format migration example

When the file format version changes, a migration function transforms old format to new:

```typescript
const migrations = [
  {
    version: 2,
    description: 'Add layoutMode to meta',
    up: (data: any) => {
      data.meta.layoutMode = data.meta.layoutMode ?? 'standard';
      return data;
    }
  },
  {
    version: 3,
    description: 'Add style field to nodes',
    up: (data: any) => {
      function addStyle(node: any) {
        node.style = node.style ?? {};
        node.children?.forEach(addStyle);
      }
      addStyle(data.root);
      return data;
    }
  }
];
```

## Appendix C: URL sharing format

```
https://mindforge.app/#data=<lz-string-compressed-json>
```

The URL hash fragment is never sent to the server. For maps exceeding ~2,000 characters compressed (roughly 100+ nodes), the app would need a backend for Excalidraw-style encrypted blob storage — this is out of scope for v1.

## Appendix D: Accessibility

The SVG tree carries ARIA attributes for screen reader support:

- Root container: `role="tree"`, `aria-label="Mind Map"`
- Each visible node: `role="treeitem"`, `aria-level`, `aria-expanded`, `aria-selected`
- Node groups: `role="group"` wrapping children

These attributes are a byproduct of correct rendering, not an additional maintenance burden. They also enable Playwright ARIA snapshot testing as a supplementary verification layer if needed.
