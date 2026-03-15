# ADR 0001: Desktop File Format for Image Assets

## Status

PROPOSED

## Goals

Limn is a keyboard-first, offline-capable mind map editor that runs on three platforms:

- **Web** -- browser-based progressive web app (Chromium, Safari, Firefox)
- **Desktop** -- native macOS app (WKWebView + Swift, sandboxed)
- **Obsidian** -- plugin for the Obsidian markdown editor

All data is local. Nothing is sent to a server. Mind maps are stored as JSON with images stored separately from the document data.

### Current file formats

- **`.limn`** -- plain JSON text file. Human-readable, git-friendly. Used by Obsidian, which stores images in a sibling `.limn-assets/` directory (sidecar pattern).
- **`.limnz`** -- ZIP bundle (DEFLATE-compressed) containing `data.json` + `assets/` directory. Self-contained, portable. Used by the web version for file downloads. The DEFLATE compression produces poor git deltas (see Option F for details).

All three platforms can read both formats. Format is detected by ZIP magic bytes (`0x50 0x4B`), not file extension.

The web version always downloads as `.limnz` because browsers cannot create sidecar directories. On Chromium, the File System Access API allows save-in-place to a `.limnz` file handle; Safari and Firefox fall back to a browser download.

## Context

The desktop app currently saves `.limn` files (plain JSON) with images in a sibling `.limn-assets/` directory. This sidecar pattern works perfectly in Obsidian, which has full access to its vault filesystem. On the macOS desktop app, it breaks due to App Sandbox restrictions.

### The sandbox problem

macOS App Sandbox controls filesystem access. When a user opens a file via NSOpenPanel (or Finder double-click with a registered UTType), the sandbox grants access to the **selected file only**, not to sibling files or directories.

Concretely: when a user opens `~/Documents/demo.limn`, the sandbox grants read/write access to `demo.limn` but **not** to `~/Documents/demo.limn-assets/`. The app cannot read the images.

We investigated several sandbox mechanisms:

- **`com.apple.security.files.user-selected.related-items.read-write`** -- This entitlement grants access to files with the same base name but different extensions (e.g., `demo.limn` and `demo.limn-saved`). It does not extend to directories. `demo.limn-assets/` is not covered.
- **Security-scoped bookmarks** -- Once the user grants access to a directory via NSOpenPanel, the bookmark can be stored and restored on subsequent launches. This works for the *second* open onward, but requires the user to explicitly grant access the first time.
- **`requestDirectoryAccess()`** -- We implemented a directory access prompt that shows an NSOpenPanel pointed at the parent directory. It works for the *write* path (triggered when saving an image fails), but the *read* path on first open still fails silently.

### Current behavior

When a user opens a `.limn` file with image references on the desktop app for the first time:

1. The file opens and the mind map renders correctly (text, structure, layout)
2. `readSidecarAssets()` in `WebViewBridge.swift` tries to read the `.limn-assets/` directory
3. The sandbox blocks access -- the function **fails silently**, returning an empty dictionary
4. Images appear as empty placeholder boxes with no error message or prompt
5. The user has no way to know that images exist but couldn't be loaded

After the user grants directory access (triggered by saving an image), a security-scoped bookmark is stored. On subsequent opens (including session restore), the bookmark is resolved and the sidecar is readable without prompting.

**The problem is limited to the first open of a file with images.** But it's a bad first impression -- images silently disappear.

## Options

### Option A: Desktop defaults to `.limnz` (ZIP)

Desktop saves `.limnz` (self-contained ZIP) for new files. Obsidian keeps `.limn` + sidecar. Both platforms read both formats.

**Impact by platform:**

- **Web:** No change. Already downloads `.limnz` and reads both formats on upload.
- **Desktop:** New files save as `.limnz` (self-contained). Opening existing `.limn` files preserves their format -- regular save (Cmd+S) keeps `.limn`, save-as produces `.limnz`. No sandbox issues for desktop-created files because images are inside the ZIP.
- **Obsidian:** No change. Continues using `.limn` + sidecar. Can open `.limnz` files from other platforms.

**Pros:**

- Self-contained files work everywhere without special filesystem permissions
- Web and Obsidian are unaffected
- The interop path (Obsidian `.limn` opened on desktop) still works -- the directory access prompt triggers on first open, and subsequent opens use the stored bookmark

**Cons:**

- Desktop files are not git-friendly (binary ZIP)
- Two "primary" formats in the ecosystem: `.limn` for Obsidian, `.limnz` for desktop and web
- Opening an Obsidian `.limn` with images on desktop still requires a one-time directory access prompt

**Tension:** Accepts format divergence between platforms. Files created on one platform can be opened on another, but the "native" format differs. This may be confusing, or it may be fine if users mostly stay on one platform.

### Option B: `.limn` as macOS Document Package

Register `.limn` as a macOS Document Package (`LSTypeIsPackage = true`). The "file" is actually a directory that Finder shows as a single item:

```
MyMap.limn/
  data.json
  assets/
    abc123.png
```

macOS has first-class support for this pattern. Pages (`.pages`), Keynote (`.key`), GarageBand (`.band`), and RTFD all use document packages. When opened via NSOpenPanel, the sandbox grants access to the **entire package contents**.

**Impact by platform:**

- **Web:** Cannot download a directory. Web would continue using `.limnz` for downloads. Browsers don't support uploading a directory as a single document entity.
- **Desktop:** The "Apple way." Sandbox works natively. Opening a package via NSOpenPanel grants access to `data.json` and all assets inside. Single `.limn` extension. Internal structure is somewhat git-friendly (git sees `data.json` + `assets/` inside the directory).
- **Obsidian:** Breaks. Obsidian's `TextFileView` expects single text files -- it receives content via `setViewData(data: string)` and cannot handle directories. The vault sidebar would show `MyMap.limn/` as an expandable folder, exposing `data.json` and `assets/` to the user. `registerExtensions(["limn"], VIEW_TYPE_LIMN)` only works for file extensions, not directory suffixes. To handle packages, the Obsidian plugin would need to:
  - Migrate from `TextFileView` to `ItemView` and implement all file I/O manually
  - Use DOM event interception (the "folder-note" pattern) to handle clicks on `.limn` folders in the sidebar -- there is no official Obsidian API for this
  - Use CSS hacks to hide internal files (`data.json`, `assets/`) from the sidebar
  - Handle directory renames through vault events
  - Community folder-note plugins use this approach, but it is fragile and breaks across Obsidian updates

**Pros:**

- Native macOS solution -- the platform-blessed approach for multi-file documents
- Sandbox works perfectly without user prompts
- Single `.limn` extension on desktop
- Somewhat git-friendly (directory contents are individually trackable)

**Cons:**

- Fundamentally incompatible with Obsidian's file model
- Would require a fragile Obsidian plugin rewrite using unofficial DOM APIs
- Web still needs `.limnz` for downloads, so format divergence still exists
- Two different on-disk structures for the same `.limn` extension (file on Obsidian, directory on desktop)

**Tension:** This is the right solution for macOS but the wrong solution for Obsidian. The two platforms have fundamentally different file models -- macOS has first-class support for document packages, Obsidian has first-class support for single text files.

### Option C: Two on-disk representations, same extension

Desktop uses `.limn` document packages (directories). Obsidian uses `.limn` flat files. Same extension, different on-disk structure. Desktop detects directory vs. file on open (it already does format detection for ZIP vs. JSON by magic bytes).

**Impact by platform:**

- **Web:** Downloads as `.limnz` (unchanged). Can open flat `.limn` files on upload. Cannot open package `.limn` directories.
- **Desktop:** Uses package format for new files. Reads both flat files (from Obsidian) and packages (from desktop). Each gets the format its platform handles best.
- **Obsidian:** No change. Continues using flat `.limn` files. Cannot read package `.limn` directories from desktop -- they would appear as expandable folders in the vault sidebar.

**Pros:**

- Single `.limn` extension everywhere
- Each platform uses its native format
- Desktop gets full sandbox benefits for its own files

**Cons:**

- Same extension with different on-disk structures is inherently confusing
- Sharing files between platforms doesn't "just work" -- a flat `.limn` from Obsidian opens fine on desktop, but a package `.limn` from desktop appears as a folder in Obsidian's vault
- iCloud and Dropbox sync behavior with document packages is uncertain (they may sync the directory contents individually, or they may treat it as an opaque package depending on configuration)
- Users can't easily tell which format a `.limn` file is without inspecting it

**Tension:** Unifies the extension at the cost of diverging the on-disk representation. The "same name, different thing" problem may cause more confusion than having two explicit extensions.

### Option D: Keep `.limn` + sidecar, auto-prompt for directory access on open

Keep the current format unchanged. When the desktop app opens a `.limn` file that references images but the sidecar directory can't be read, automatically show an NSOpenPanel pointed at the `.limn-assets/` directory (or its parent). The user clicks "Grant Access" once, and a security-scoped bookmark is stored for all future opens.

**Impact by platform:**

- **Web:** No change. Web uses `.limnz` for downloads and IndexedDB for auto-save.
- **Desktop:** On first open of a `.limn` file with images, the user sees a macOS-native "Grant Access" directory prompt. One click grants access and images load. Subsequent opens of the same file work without prompting (bookmark stored in UserDefaults). New files created on desktop use `.limn` + sidecar (or could default to `.limnz` if desired).
- **Obsidian:** No change. Full vault access, no sandbox involvement.

**Technical approach:**

1. `loadFileIntoWebView()` opens the `.limn` file and parses the JSON
2. Checks if the document references any assets (non-empty `assets` array in the JSON)
3. Tries `readSidecarAssets()` -- currently fails silently on sandbox permission errors
4. If assets are referenced but the sidecar returned empty results, show NSOpenPanel pointed at the sidecar directory
5. User clicks "Grant Access" (or "Open")
6. Store the directory bookmark via `SessionStore.createAndStoreDirectoryBookmark()`
7. Re-read sidecar assets and send them to JS with the file data

The `requestDirectoryAccess()` function already exists in `WebViewBridge.swift` and handles steps 4-6 for the write path. It would need to be adapted for the read-on-open path.

**Pros:**

- Keeps the single `.limn` format everywhere -- no format divergence
- Git-friendly plain JSON files
- The prompt is a one-time thing per file, and macOS-native permission dialogs are familiar to users
- No schema changes, no breaking changes
- Leverages existing `requestDirectoryAccess()` and `SessionStore` bookmark infrastructure

**Cons:**

- Extra friction on first open of a file with images (a permission dialog appears before images load)
- Users may not understand why they're being asked for directory access when they just opened a file
- If the `.limn-assets/` directory doesn't exist (file has image references but assets were deleted or never synced), the prompt would appear but granting access wouldn't help
- Only solves the desktop-to-Obsidian interop case; desktop-native files still have the sidecar complexity

**Tension:** This is the smallest departure from the current design. It accepts the sandbox limitation as a fact of life and works within it using Apple's own mechanisms. The question is whether a permission dialog on first open is an acceptable UX trade-off for keeping format simplicity.

### Option E: Inline images in JSON (remove sidecar entirely)

Store image data as base64 strings directly in the `.limn` JSON file. Eliminate sidecar directories and ZIP bundles. One file, one format, everywhere.

This would require changing the architecture invariant ("Images use sidecar storage. Never base64 in JSON.") and introducing a breaking schema change with a migration path.

**Impact by platform:**

- **Web:** Single `.limn` file for everything. No need for `.limnz` ZIP downloads. File System Access API save-in-place works with a single file. IndexedDB would store the full JSON including base64 image data.
- **Desktop:** Single file, no sandbox issues whatsoever. No sidecar to read. No directory prompts.
- **Obsidian:** Single file in the vault. No sidecar directory cluttering the vault. But vault files become much larger -- a mind map with 3 screenshots (~1 MB each) would be a 5+ MB JSON file.

**Schema change required:** The `Asset` type would need a `data: string` field for base64 content. This is a breaking change requiring a migration in `migration.ts` and a major version bump.

**Pros:**

- Maximum simplicity -- one file, one format, every platform
- No directories, no sandbox issues, no format divergence, no directory prompts
- Easy to share via email, chat, or any file transfer mechanism
- Easy to back up (single file)

**Cons:**

- **Auto-save performance:** Limn auto-saves on 500ms idle after edits (debounce mode). Every auto-save re-serializes the entire JSON including all base64 image data. A mind map with 3 images (~1 MB each) means serializing ~4 MB of JSON on every save. For a keyboard-first app where responsiveness matters, this adds noticeable latency.
- **File size:** Base64 encoding adds ~37% overhead (1 MB image becomes ~1.37 MB in JSON). Multiple images compound quickly.
- **Git diffs:** Base64 strings are opaque binary-as-text. Any image addition or change produces a massive, unreadable diff. The git-friendliness that makes `.limn` valuable for Obsidian vaults is largely lost for files with images.
- **Memory pressure:** The entire document including all image data must fit in memory as a single JSON string during serialization and parsing.
- **Obsidian vault bloat:** Large JSON files slow down vault indexing and search. Other plugins that scan vault files would process megabytes of base64 noise.
- **Desktop bridge overhead:** The desktop app's Swift-JS bridge already base64-encodes data to cross the WKWebView boundary. Inline base64 images would be double-encoded during transit.
- **Breaking change:** Requires schema migration, major version bump, and updates to all three platform persistence providers.

**Tension:** Trades the complexity of directories and format variants for the complexity of large JSON files and degraded performance. The simplest conceptual model but the worst runtime characteristics. Whether the performance costs are acceptable depends on how many images typical mind maps contain -- maps with zero or one small image would be fine; maps with several screenshots would suffer.

### Option F: ZIP format everywhere (including Obsidian)

Use ZIP as the universal `.limn` format on all three platforms. A `.limn` file is always a ZIP containing `data.json` + `assets/`.

Backward compatibility is straightforward: all three platforms already detect format by ZIP magic bytes (`0x50 0x4B`), not file extension. Old plain-JSON `.limn` files would be readable; on next save they become ZIP format.

**Why STORE (uncompressed) instead of DEFLATE (compressed):**

ZIP supports two main compression methods per entry: DEFLATE (standard compression) and STORE (no compression, raw bytes). The choice has a dramatic impact on git version control efficiency.

With DEFLATE, even a one-character change in `data.json` produces completely different compressed output. Git's delta algorithm works at the byte level -- it looks for matching byte sequences between file versions. Deflated data looks essentially random, so git can't find matches and must store a nearly-full copy for every commit.

With STORE, the file bytes are: `[ZIP headers][raw data.json text][ZIP headers][raw image1 bytes][ZIP headers][raw image2 bytes]...[central directory]`. When only the text changes, the image bytes remain byte-for-byte identical. Git's delta algorithm finds these matching sequences regardless of their position in the file and stores "copy N bytes from offset X in the previous version" instructions. The result is a delta proportional to the text change, not the file size.

**Concrete example:** A 20 MB mind map with 5 images (~4 MB each), where 30 commits change only text:

| | Loose objects (before gc) | After git gc (packed) |
|---|---|---|
| First commit | 20 MB | 20 MB (base) |
| 30 text-edit commits | 30 x 20 MB = 600 MB | ~21 MB total |
| Total repo size | ~620 MB | ~21 MB |

Each text-edit delta is roughly the size of the `data.json` diff (a few KB). The image entries are referenced by "copy" instructions, not re-stored. This efficiency applies during `git gc`, push, pull, and clone. Loose objects (between gc runs) are full copies, but `git gc` runs automatically and pack operations always use deltas.

If an image *does* change, that commit's delta is proportional to the image size -- unavoidable with any format.

**Deterministic ZIP creation** (fixed `mtime` timestamps, sorted entry names) ensures that saving the same content twice produces byte-identical output. Without this, ZIP metadata differences between saves would create false deltas in git even when no content changed. fflate supports both `level: 0` (STORE) and per-entry `mtime` configuration.

**Impact by platform:**

- **Web:** Already uses ZIP for downloads (`.limnz`). Would also use ZIP for File System Access API save-in-place. The existing `buildLimnZip()` / `parseLimnFile()` functions handle all serialization.
- **Desktop:** ZIP is a single file -- no sidecar directory, no sandbox issues. The Swift side already handles ZIP format via base64 bridge messages. Would stop writing sidecar directories for new files.
- **Obsidian:** Requires a plugin refactor. `TextFileView` only handles text strings (`setViewData(data: string)` / `getViewData(): string`). The plugin would switch to `FileView` as its base class and use `vault.readBinary()` / `vault.modifyBinary()` for file I/O. `registerExtensions()` works for any extension regardless of content type. Estimated ~200-300 lines of new lifecycle and save-management code (debouncing, dirty tracking, external change detection) to replace what `TextFileView` provides for free. No sidecar directories needed.

**Pros:**

- Single format, single extension, all platforms
- No sandbox issues (single file, no sibling directories)
- No sidecar directories to manage on any platform
- Most of the implementation already exists (web download path, desktop read path)
- Git stores efficient deltas: text-only changes on a 20 MB file produce ~KB-sized deltas in packfiles (see STORE vs DEFLATE analysis above)

**Cons:**

- `git diff` shows "Binary files differ" -- git's delta compression helps storage size but the diff *output* is not human-readable. Would need a custom git diff driver (e.g., `unzip -p data.json | diff`) for meaningful output.
- Cannot `cat`, `grep`, or inspect a `.limn` file with standard text tools -- it's binary
- Obsidian's vault search will not index `.limn` file content (it's a ZIP, not text)
- Obsidian plugin refactor from `TextFileView` to `FileView` is medium effort
- Breaking change for existing Obsidian users with plain-JSON `.limn` files in their vaults (auto-migration on save, but a deliberate transition)
- Auto-save must re-zip `data.json` + all assets on every save, even if only text changed. The ZIP overhead is small (STORE is just concatenation with headers) but it's more work than writing a plain text file.

**Tension:** Trades human-readability and text-tool compatibility for universal single-file simplicity. The format works perfectly across all platforms and sandboxes, but you lose the ability to casually inspect or diff files with `cat` and `git diff`. For users who version-control their mind maps in git, the storage is efficient but the workflow requires extra tooling.

### Option G: Line-based text format (JSONL) with inline base64

Use a line-oriented text format where each line is a self-contained JSON object. Node data gets one line per node. Image data lives on its own line as a base64 string. Because each line is independent, git diffs show only the lines that actually changed -- unchanged images produce zero diff noise.

```
{"type":"meta","version":3,"id":"abc123","name":"My Map"}
{"type":"node","id":"root","text":"Central Idea","x":0,"y":0}
{"type":"node","id":"n1","text":"Branch","x":100,"y":50,"parentId":"root"}
{"type":"asset","id":"a1","filename":"img.png","mimeType":"image/png","w":800,"h":600,"data":"iVBORw0KGgo..."}
```

This is a breaking change: entirely new serialization format, requiring a migration from both JSON and ZIP formats, and a major version bump.

**Impact by platform:**

- **Web:** Single `.limn` file download (no ZIP needed). Text-based, so the File System Access API works with text file handles. The existing `buildLimnZip()` path would be replaced with JSONL serialization.
- **Desktop:** Single file, no sandbox issues. Text-based, so Swift reads/writes as UTF-8 string -- the current JSON message path works with minimal changes to the bridge.
- **Obsidian:** Text-based, so `TextFileView` still works. `setViewData()` receives the JSONL string, `getViewData()` returns it. No plugin base class change needed. However, vault files with images become large (megabytes of base64 text on disk).

**Pros:**

- Single format, single extension, all platforms -- and it's text
- Git diffs are human-readable: adding a node = one new line, editing text = one changed line
- Unchanged images produce zero diff noise (their base64 lines are identical between commits)
- No sandbox issues (single file)
- No sidecar directories on any platform
- Obsidian plugin keeps `TextFileView` (no base class refactor needed)
- Standard text tools work: `cat`, `grep`, `diff`, `wc -l`

**Cons:**

- **Auto-save performance:** Same concern as Option E. Every save writes the entire file including all base64 image data. A mind map with 3 screenshots (~1 MB each) means writing ~4 MB on every 500ms-idle auto-save. Could be partially mitigated by only rewriting when content actually changed, or by caching serialized lines for unchanged nodes/assets, but the I/O cost is inherent.
- **File size:** Base64 adds ~37% overhead. A mind map with several images is multiple MB of text.
- **Obsidian vault bloat:** Large text files slow vault indexing. Other plugins that scan vault contents process megabytes of base64 noise.
- **Breaking change:** Entirely new serialization format. All three platform persistence providers and the core serialization layer need updates. Migration path from both JSON and ZIP formats required.
- **Deterministic serialization required:** JSON key ordering must be consistent within each line, or git sees false changes on every save. Requires a custom serializer that enforces key order -- `JSON.stringify()` alone is not sufficient (key order depends on insertion order in JavaScript objects).
- **Custom parser:** Cannot use `JSON.parse()` on the whole file. Must split by lines, parse each line, and reconstruct the document structure. More complex than parsing a single JSON object.

**Tension:** The best git-diff story of any option -- human-readable, line-level diffs, unchanged images invisible. But it's the biggest breaking change, has the same auto-save performance characteristics as inline base64 (Option E), and requires custom serialization/parsing infrastructure. The question is whether the git-friendliness justifies the migration cost and the departure from standard JSON.

## Decision

(To be decided.)

## Consequences

(To be filled in after the decision is made.)

## References

- [macOS Document Packages](https://developer.apple.com/library/archive/documentation/CoreFoundation/Conceptual/CFBundles/DocumentPackages/DocumentPackages.html) -- Apple's documentation on directory-as-file packages
- [Accessing files from the macOS App Sandbox](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox) -- Sandbox filesystem access rules
- [Obsidian TextFileView API](https://docs.obsidian.md/Reference/TypeScript+API/TextFileView) -- Single text file view base class
- [Obsidian Folder Notes plugin](https://github.com/LostPaul/obsidian-folder-notes) -- Community plugin demonstrating folder-as-document pattern (DOM interception approach)
- [fflate](https://github.com/101arrowz/fflate) -- ZIP library used by Limn; supports `level: 0` (STORE) and per-entry `mtime`
- [Reproducible ZIP archives](https://reproducible-builds.org/docs/archives/) -- Guidance on deterministic archive creation for version control
- [JSON Lines](https://jsonlines.org/) -- Specification for newline-delimited JSON

### Key source files

- `packages/desktop/Limn/FileOperations.swift` -- Save/open panel, UTType declarations
- `packages/desktop/Limn/WebViewBridge.swift` -- File load/save, format detection, `readSidecarAssets()`, `requestDirectoryAccess()`
- `packages/desktop/Limn/SessionStore.swift` -- Security-scoped bookmark storage and restoration
- `packages/web/src/persistence/desktop-persistence.ts` -- JS-side save format selection (JSON vs ZIP based on extension)
- `packages/web/src/persistence/file.ts` -- ZIP building (`buildLimnZip`), format detection, web download
- `packages/obsidian/src/LimnView.ts` -- Extends `TextFileView`
- `packages/obsidian/src/main.ts` -- `registerExtensions`, commands
- `packages/desktop/project.yml` -- `UTExportedTypeDeclarations` for `.limn` and `.limnz`
