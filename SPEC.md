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
| H2 | Git-friendly file format | JSON with stored positions, sorted keys, sidecar directory for images |
| H3 | First-class keyboard support | Tab=child, Enter=edit, arrows=spatial navigate, distinct nav/edit modes |
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
| Layout | @dagrejs/dagre | Sugiyama-style tree layout; computes initial node positions, reflows on structural changes |
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
| Archive | fflate | Zip/unzip for Safari/Firefox image export fallback |
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
4. **Positions and dimensions are stored.** The layout engine (dagre) computes positions for newly created trees. Incremental mutations shift siblings to make or close space. Users can reposition nodes by dragging. Manual positions are never overridden by automatic layout. The file format includes x/y/width/height for every node. Width is user-adjustable (drag right edge of node); height is auto-computed from text content reflowed within the current width. No automatic word wrap on new nodes -- the user controls line breaks with Shift+Enter, and width grows to fit text until manually constrained.
5. **Multiple roots (forest).** A mind map can contain multiple independent root trees on the same canvas. Roots can be created and deleted freely. An empty canvas is a valid state.
6. **Images stored as sidecar files.** Binary assets live in a `{name}.assets/` directory alongside the JSON file, referenced by relative path. This keeps the JSON diffable and the assets manageable in git.

### Package/module structure

```
packages/
  core/               # Framework-agnostic TS library (no React, no browser APIs)
    src/
      model/           # MindMapNode, MindMap types
      store/           # Reactive store with diff tracking
      editor/          # Editor class — all operations
      layout/          # @dagrejs/dagre integration, position computation
      serialization/   # JSON ↔ model, markdown export
      test-editor/     # TestEditor subclass for testing

  web/                 # React web application
    src/
      components/      # SVG node renderer, edge renderer, viewport
      hooks/           # useEditor, useMindMap, useKeyboardNav
      input/           # Keyboard handler, mouse handler → Editor dispatch
      persistence/     # browser-fs-access integration, IndexedDB auto-save
      export/          # SVG export, PDF export, PNG export
      service-worker/  # Workbox offline caching
```

The `core` package has zero browser or React dependencies. It can be used in Node.js or Vitest. The `web` package is the React PWA that renders the core engine.

### Data model

```typescript
interface MindMapNode {
  id: string;              // Stable unique ID (nanoid)
  parentId: string | null; // null for root nodes
  text: string;            // Node content (supports multi-line via Shift+Enter)
  children: string[];      // Ordered child IDs (sibling order matters)
  collapsed: boolean;      // Whether children are hidden
  x: number;               // Horizontal position (stored, computed initially by layout engine)
  y: number;               // Vertical position (stored, computed initially by layout engine)
  width: number;           // Node width (user-adjustable by dragging right edge; text reflows within)
  height: number;          // Node height (auto-computed from text content and width)
  style?: NodeStyle;       // Optional color, shape overrides
  image?: ImageRef;        // Optional attached image
}

interface ImageRef {
  assetId: string;         // References an asset in the asset registry
  width: number;           // Display width (always proportional to original aspect ratio)
  height: number;          // Display height (always proportional to original aspect ratio)
}

interface NodeStyle {
  // TODO - font, size, color, etc
}

interface Asset {
  id: string;
  filename: string;        // Bare filename within the sidecar directory (e.g., "arch-diagram.png")
  mimeType: string;
  width: number;           // Original dimensions
  height: number;
}

interface Camera {
  x: number;               // Viewport offset X
  y: number;               // Viewport offset Y
  zoom: number;            // Zoom level (1.0 = 100%)
}

interface MindMap {
  roots: string[];         // Root node IDs (multiple independent trees)
  nodes: Map<string, MindMapNode>;  // Flat node map (runtime)
  assets: Asset[];
  camera: Camera;          // Persisted viewport state
  meta: {
    id: string;            // Stable document UUID, generated on creation, preserved across saves
    version: number;
    theme: string; // "default", this is a placeholder
  };
}

// File format types (on-disk representation)
interface MindMapFileNode {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: MindMapFileNode[];  // Inline nested nodes (not ID references)
  collapsed?: boolean;          // Omitted when false
  style?: NodeStyle;
  image?: ImageRef;
  // parentId is NOT stored — implicit from nesting
}

interface MindMapFileFormat {
  version: number;
  meta: {
    id: string;            // Document UUID — used as IndexedDB key for auto-save and cross-tab sync
    theme: string;
  };
  camera: Camera;
  roots: MindMapFileNode[];
  assets: Asset[];
}
```

### File format (.mindmap)

On disk, the flat map serializes as a nested tree for readability and clean diffs. Keys are sorted. Each node includes its stored x/y position. The `parentId` field is omitted (parent is implicit from nesting). The `children` field changes from an array of ID strings (runtime) to an array of inline node objects (file format). The `collapsed` field is omitted when `false` (the default) to reduce noise. The top-level `roots` array holds one or more independent root trees.

```json
{
  "version": 1,
  "meta": { "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "theme": "default" },
  "camera": { "x": 0, "y": 0, "zoom": 1.0 },
  "roots": [
    {
      "id": "n0",
      "text": "Project Plan",
      "x": 0,
      "y": 0,
      "width": 120,
      "height": 30,
      "children": [
        {
          "id": "n1",
          "text": "Phase 1",
          "x": 250,
          "y": -60,
          "width": 100,
          "height": 30,
          "children": [
            { "id": "n3", "text": "Research", "x": 480, "y": -90, "width": 100, "height": 30, "children": [] },
            {
              "id": "n4",
              "text": "Architecture",
              "x": 480,
              "y": -30,
              "width": 100,
              "height": 30,
              "children": [],
              "image": { "assetId": "a1", "width": 400, "height": 300 }
            }
          ]
        },
        {
          "id": "n2",
          "text": "Phase 2",
          "x": 250,
          "y": 60,
          "width": 100,
          "height": 30,
          "collapsed": true,
          "children": [
            { "id": "n5", "text": "Implementation", "x": 480, "y": 60, "width": 120, "height": 30, "children": [] }
          ]
        }
      ]
    }
  ],
  "assets": [
    { "id": "a1", "filename": "arch-diagram.png", "mimeType": "image/png", "width": 1200, "height": 900 }
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
  getRoots(): MindMapNode[];            // All root nodes
  getSelectedId(): string | null;       // null when nothing selected (valid state)
  isCollapsed(id: string): boolean;
  getVisibleNodes(): MindMapNode[];     // Respects collapsed state, spans all trees

  // Mutations (all produce tracked diffs for undo)
  addRoot(text?: string, x?: number, y?: number): string;  // Returns new root ID
  addChild(parentId: string, text?: string): string;        // Returns new node ID
  insertChild(parentId: string, index: number, text?: string): string;  // Insert new node as child of parentId at position index. If index > children length, inserts at end
  deleteNode(nodeId: string): void;     // Deletes root and subtree; empty canvas if last
  setText(nodeId: string, text: string): void;
  moveNode(nodeId: string, newParentId: string, index?: number): void;
  reorderNode(nodeId: string, direction: 'up' | 'down'): void;
  setNodePosition(nodeId: string, x: number, y: number): void;  // Manual repositioning
  setNodeWidth(nodeId: string, width: number): void;  // Resize width; height recomputes from text reflow
  toggleCollapse(nodeId: string): void;
  setNodeImage(nodeId: string, asset: Asset): void;
  removeNodeImage(nodeId: string): void;

  // Navigation and selection (spatial — direction relative to screen, not tree structure)
  select(nodeId: string): void;
  deselect(): void;                     // Nothing selected
  navigateLeft(): void;                 // Toward parent on right-side branches, toward children on left-side
  navigateRight(): void;                // Toward children on right-side branches, toward parent on left-side
  navigateUp(): void;                   // Visually above; can cross tree boundaries
  navigateDown(): void;                 // Visually below; can cross tree boundaries

  // Edit mode
  enterEditMode(): void;
  exitEditMode(): void;
  isEditing(): boolean;

  // History
  undo(): void;
  redo(): void;
  markHistory(label: string): void;  // Named undo boundary

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

  // State inspection
  getCommandHistory(): HistoryEntry[];
  getEventLog(): EditorEvent[];
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

**Navigation mode** (default): Keyboard input operates on tree structure. Arrow keys move selection spatially (direction relative to screen position, not tree structure). Tab creates child nodes. Enter enters edit mode. Shortcuts modify the selected node. When nothing is selected (empty canvas or after deselect), Enter creates a new root node. When nothing is selected, arrow keys will select the node closest to the center of the canvas. 

**Edit mode** (entered via Enter when node is selected, or double-click on node): Keyboard input goes to an absolutely-positioned textarea overlaid on the node (not SVG foreignObject, which has cross-browser issues). Arrow keys move within text. If text is already in node, cursor starts at the end of the current text. Escape exits to navigation mode. Creating a new node (Tab) automatically enters edit mode for that node. Nodes support multi-line text: Shift+Enter inserts a newline, Enter exits edit mode and creates a sibling, Tab exits edit mode and creates a child.

### Browser shortcut conflicts

Several shortcuts (⌘+S, ⌘+O, ⌘+0, ⌘+1, ⌘+=, ⌘+-) conflict with browser defaults (save page, open file, reset zoom, etc.). The keyboard handler must call `preventDefault()` on these events to suppress browser behavior. Tab must also be prevented from moving focus out of the app.

### Keyboard shortcuts (navigation mode)

| Context | Action | Shortcut | Behavior |
|---------|--------|----------|----------|
| Node selected | Create child | Tab | New child of selected node; enters edit mode |
| Node selected | Create sibling below | Shift+enter | New sibling after selected node; enters edit mode, no-op if current node is root |
| Node selected | Navigate left | ← | Spatial: toward parent on right-side branches, toward children on left-side branches |
| Node selected | Navigate right | → | Spatial: toward children on right-side branches, toward parent on left-side branches |
| Node selected | Navigate down | ↓ | Move to next visually-below node (can cross parent and tree boundaries) |
| Node selected | Navigate up | ↑ | Move to previous visually-above node (can cross parent and tree boundaries) |
| Node selected | Enter edit mode | Enter | Cursor at end of node's text |
| Node selected | Delete node | Backspace | Remove node and entire subtree; select nearest sibling (previous, or next if first), then parent if no siblings, then nearest remaining root by position if root was deleted; nothing selected if canvas becomes empty |
| Node selected | Collapse/expand | Space | Toggle selected node's collapsed state |
| Node selected | Move node up | ⌘+↑ | Reorder among siblings |
| Node selected | Move node down | ⌘+↓ | Reorder among siblings |
| Node selected | Deselect | Escape | Deselect currently selected node |
| Nothing selected | Create root | Enter | New root node at canvas center; enters edit mode |
| Any Navigation Mode | Move canvas | Shift+(←/→/↓/↑) | Move canvas in the direction of the arrow 10% of the current zoom level |
| Any | Undo | ⌘+Z | Invert last diff |
| Any | Redo | ⇧+⌘+Z | Reapply last undone diff |
| Any | Zoom to fit | ⌘+0 | Fit all visible nodes in viewport |
| Node selected | Zoom to selection | ⌘+1 | Center and zoom to selected node |
| Any | Zoom in | ⌘+= | Increase zoom |
| Any | Zoom out | ⌘+- | Decrease zoom |
| Any | Save | ⌘+S | Save to current file (or download) |
| Any | Open | ⌘+O | Open file picker |
| Any | Export as SVG | ⇧+⌘+E | Export map as SVG |

### Keyboard shortcuts (edit mode)

| Context | Action | Shortcut | Behavior |
|---------|--------|----------|----------|
| Editing | Exit edit mode | Escape | Return to navigation mode |
| Editing | Create sibling | Enter | Exit edit mode and create sibling node; enters edit mode on new node. If editing a root node, just exits edit mode (no sibling created -- roots have no parent, so "sibling" is meaningless; use Escape then Enter to create a new root instead) |
| Editing | Create child | Tab | Exit edit mode and create child node; enters edit mode on new node |
| Editing | Newline | Shift+Enter | Adds a newline to the text at cursor position, stays in edit mode |

### Spatial navigation rules

Arrow keys navigate spatially based on screen position, not tree structure. The direction of Left/Right flips depending on which side of its parent a node is on:

- **Right-side branches** (child.x > parent.x): Left moves toward parent, Right moves toward first child (expands if collapsed).
- **Left-side branches** (child.x < parent.x): Right moves toward parent, Left moves toward first child (expands if collapsed).
- **At a root node**: Left goes to first left-side child (if any), Right goes to first right-side child (if any).
- **Up/Down**: Move to the nearest visible node above/below the current node by y position. Can cross parent boundaries and tree boundaries. No-op at the topmost/bottommost visible node.

Direction of a branch is inferred from stored positions: if a child's x coordinate is less than its parent's x, it is a left-side branch. All navigation directions are no-ops when there is no node to move to (e.g., Left/Right at a leaf or childless side of a root).

### Layout direction

The default direction for new children is rightward from their parent. If a user drags a first-level child of a root to the left side of that root, its descendants will extend further leftward. The direction is inferred from positions, not stored explicitly.

### Layout modes

**Full layout (dagre):** Used when creating a brand-new tree or when the user explicitly requests reflow (future command). Dagre computes positions for all nodes in the tree from scratch.

**Incremental layout:** Used for all structural mutations (add child, add sibling, delete, collapse, expand). Instead of re-running dagre, the engine shifts affected siblings and their entire subtrees to make or close vertical space. This preserves any manual positioning the user has done.

The algorithm: when a node is inserted or removed, compute the delta in the parent's visible subtree height (sum of visible descendant heights plus fixed inter-sibling gaps). Shift all siblings below the affected position by that delta, moving each sibling and its entire subtree as a unit. The inter-sibling gap is a fixed constant (e.g., 20px). Each root tree is adjusted independently. After adjusting a tree, check whether its bounding box overlaps any other root tree's bounding box; if so, push the overlapping tree apart by the overlap distance.

### Viewport following

When a node is created (Tab or Enter in edit mode), the map automatically scrolls to keep the new node visible and the layout smoothly animates to accommodate the new position.

### Mouse interaction

- **Click on node**: Select that node (enters navigation mode if in edit mode)
- **Double-click on node**: Select and enter edit mode
- **Double-click on canvas**: Create new root node at click position; enter edit mode
- **Drag on canvas**: Pan the viewport
- **Drag on node**: Reposition the node (updates stored x/y)
- **Scroll wheel**: Zoom in/out centered on cursor position
- **Drag right edge of node**: Resize node width; text reflows within new width, height adjusts automatically

**Drag-to-reparent (MindNode-style):** While dragging a node, if it comes within proximity of another node, a visual indicator (connection line) appears suggesting it will become a child of that node. Dropping the dragged node while the indicator is visible reparents it. Dropping in open space (no proximity indicator) simply repositions the node without changing its parent. A node cannot be reparented to one of its own descendants.

---

## 6. Undo/redo system (diff-based)

Following tldraw's architecture, undo/redo is automatic and diff-based rather than command-based.

### How it works

1. Every store mutation produces a `RecordsDiff` — a structure with `added`, `updated` (as `[before, after]` pairs), and `removed` entries.
2. Named **marks** define undo boundaries. Operations like `addChild` call `editor.markHistory('add-child')` before mutating.
3. `editor.undo()` collects all diffs since the last mark, inverts them (swap added↔removed, reverse updated pairs), and applies the inverse diff.
4. Continuous operations (like typing text or dragging) produce many small diffs that are **squashed** into a single undo entry when the operation completes.

### What is excluded from undo history

Selection state and camera position are not tracked in the diff history. Undo reverses data changes (node creation, deletion, text edits, etc.) but does not jump your selection or viewport. When undo removes the currently selected node, selection follows the same fallback rules as delete (nearest sibling, then parent, then nearest root).

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
- Paste an image from clipboard → attaches to selected node, if no node selected creates a new node with the image
- Resize handle: a single dot in the upper-right corner of the image, visible on hover. Dragging it scales the image proportionally (aspect ratio is always locked). No free resize, no squishing -- images can only be made bigger or smaller.
- Image selection and deletion interaction (how users select an image within a node to resize or delete it) is designed during Chunk 12 implementation

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

Every mutation is debounced (500ms) and auto-saved to IndexedDB via `idb-keyval`. This survives tab closes and browser restarts. Each document has a UUID (`meta.id`), generated when the document is first created and preserved across saves and reloads. This UUID is the IndexedDB key for auto-save storage. Cross-tab sync uses BroadcastChannel keyed by document UUID with a monotonic revision counter stored alongside the document in IndexedDB. When a tab saves, it increments the revision and broadcasts the new value. Tabs that receive a higher revision reload the document state and show a non-blocking toast: "Document updated from another tab." No merge logic for v1.

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
| **2. Data model** | MindMapNode (with x/y), MindMap (with roots[]) types; flat store with parentId references; tree operations (add child, add sibling, add root, delete, reparent, reorder) | `core/src/model/`, `core/src/store/` | Unit tests for all tree operations including multi-root |
| **3. Serialization** | JSON round-trip (nested file ↔ flat runtime); markdown export; file format validation with zod | `core/src/serialization/` | Serialize → deserialize → equality; snapshot tests for markdown output |
| **4. Editor + TestEditor** | Editor class with store, mutation methods, history marks, diff-based undo/redo; TestEditor with simulated keyboard/pointer input and assertion methods | `core/src/editor/`, `core/src/test-editor/` | Undo/redo tests; keyboard simulation tests; history inspection tests |

Chunks 2 and 3 can be developed in parallel (they share types but are otherwise independent).

### Phase 2 — Layout and rendering (Chunks 5–7)

| Chunk | Scope | Deliverables | Tests |
|-------|-------|-------------|-------|
| **5. Layout engine** | @dagrejs/dagre integration for full layout of new trees; incremental sibling-shift layout for add/remove/collapse/expand (preserves manual positions); bidirectional layout (right-side LR, left-side RL via separate dagre runs); handle collapsed subtrees; independent layout per root tree; cross-tree overlap detection | `core/src/layout/` | Position snapshot tests; collapsed subtree exclusion tests; bidirectional layout tests; incremental layout preserves manual positions; cross-tree overlap push tests |
| **6. SVG renderer** | React components for nodes, edges, labels; custom pan/zoom viewport; render from Editor state | `web/src/components/` | Playwright visual regression screenshots |
| **7. Node styling** | Colors, shape variants, collapse indicators, selected/focused states; CSS | `web/src/components/` | Playwright screenshot comparisons |

### Phase 3 — Interaction (Chunks 8–12)

| Chunk | Scope | Deliverables | Tests |
|-------|-------|-------------|-------|
| **8. Keyboard navigation** | Spatial arrow key traversal (direction-aware), Tab creates child, Enter enters edit mode, Enter with nothing selected creates root, focus management, mode switching (nav/edit) | `web/src/input/keyboard.ts`; wired to Editor | TestEditor keyboard tests (the bulk of testing happens here); spatial navigation tests across tree boundaries |
| **9. Text editing** | Absolutely-positioned textarea over canvas (not foreignObject); Enter to edit text, Escape to exit; auto-enter on node creation; zoom-aware transforms | `web/src/components/EditableNode.tsx` | TestEditor type() tests; Playwright text rendering verification |
| **10. Collapse/expand** | Toggle collapse, Space shortcut, animated transitions for showing/hiding children | Wired through Editor | TestEditor collapse state tests |
| **11. Mouse interaction** | Click to select, double-click to edit (on node) or create root (on canvas), drag to pan (on canvas), drag to reposition nodes (updates stored x/y), drag to reparent, scroll to zoom | `web/src/input/mouse.ts` | TestEditor pointer simulation tests; drag-to-reposition tests |
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

### Two-layer testing approach

**Layer 1: Unit tests via TestEditor (vast majority of tests).** The TestEditor simulates all user interactions programmatically — keyboard events, pointer events, state transitions — without a browser. Tests run in milliseconds. This is where correctness verification happens: tree operations, keyboard navigation, undo/redo, collapse/expand, mode switching, text editing state machine, and edge cases. If you're tempted to write a Playwright test, first ask whether the behavior can be verified through the Editor API instead.

**Layer 2: Browser tests via Playwright (as few as possible).** Playwright tests are for things that genuinely require a browser: verifying SVG rendering looks correct (screenshot comparison), file dialog interactions, service worker behavior, clipboard/drag-drop with real browser APIs. These tests are slow (seconds each) and should only be written when TestEditor cannot cover the behavior.

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

### Obsidian plugin

The core engine's zero-dependency design makes an Obsidian plugin viable. The plugin would: register an ItemView, render the React component into `contentEl`, store files as `.mindmap.md` (markdown with embedded JSON in a code block), and use Vault API for persistence. This is ~3 chunks of additional work once the core is stable. The Excalidraw Obsidian plugin validates this approach at scale (~49,000 lines of code wrapping the Excalidraw React component).

---

## Appendix A: Prior art and influences

| Tool | What we take from it | What we avoid |
|------|---------------------|---------------|
| **MindNode** | Keyboard model (Tab for children), layout aesthetics, smooth animations, spatial arrow navigation | App Store lock-in, proprietary format |
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
    description: 'Add style field to nodes',
    up: (data: any) => {
      function addStyle(node: any) {
        node.style = node.style ?? {};
        node.children?.forEach(addStyle);
      }
      data.roots.forEach(addStyle);
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

- Canvas container: `role="group"`, `aria-label="Mind Map"`
- Each root tree: `role="tree"`
- Each visible node: `role="treeitem"`, `aria-level`, `aria-expanded`, `aria-selected`
- Node groups: `role="group"` wrapping children

These attributes are a byproduct of correct rendering, not an additional maintenance burden. They also enable Playwright ARIA snapshot testing as a supplementary verification layer if needed.
