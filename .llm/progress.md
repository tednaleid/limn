# Desktop App Progress

## Phase 1: XcodeGen project + WKWebView shell
- [x] Create packages/desktop/project.yml (XcodeGen config)
- [x] Create SwiftUI app entry point (LimnApp.swift)
- [x] Create WKWebView wrapper (WebViewBridge.swift)
- [x] Create document window view (DocumentWindow.swift)
- [x] Create sandbox entitlements
- [x] Create Assets.xcassets with placeholder icon
- [x] Add justfile recipes (desktop-gen, desktop-build, desktop-run)
- [x] Add .xcodeproj to .gitignore
- [x] Dev mode: load from localhost:5173 via env var
- [x] Verify: app launches, mind map renders, keyboard shortcuts work

## Phase 2: JS-Swift bridge + single-file persistence
- [x] Swift: WKScriptMessageHandler for typed messages
- [x] Swift: NSSavePanel/NSOpenPanel with .limn UTType filter
- [x] TS: desktop-bridge.ts
- [x] TS: desktop-persistence.ts (DesktopPersistenceProvider)
- [x] TS: App.tsx detects desktop mode, swaps persistence provider
- [x] Auto-save wired up
- [x] Verify: open .limn via File > Open, edit, auto-save works

## Phase 3+4: File associations + Multi-window + native menus
- [x] Info.plist: CFBundleDocumentTypes + UTExportedTypeDeclarations (via project.yml)
- [x] AppDelegate: application(_:open:) for Finder/Dock file opens
- [x] Cold-start buffering (pendingFileURL drained on "ready")
- [x] NSDocumentController.shared.noteNewRecentDocumentURL()
- [x] WindowGroup(for: URL.self) with per-document windows
- [x] Automatic duplicate window prevention (SwiftUI URL dedup)
- [x] Native menus: File (New, Open, Save, Save As), Edit (Undo, Redo)
- [x] Menu items dispatch via synthetic KeyboardEvent to web view
- [x] Save As updates window URL binding for dedup
- [x] Verify: double-click .limn in Finder opens app
- [x] Verify: 3 files open in 3 windows, menus work
- [x] Verify: opening already-open file focuses existing window (dedup)
- [x] Verify: undo/redo works per-window

## Phase 5: Polish
- [x] Security-scoped bookmarks for reopen-on-launch
- [x] Welcome window with recent files list
- [x] Session save/restore across app restarts
- [x] window.representedURL for proxy icon
- [x] Window title shows filename
- [x] App icon with generation script (just desktop-icon)
- [x] About panel (auto-generated from Info.plist, version synced with packages)
- [x] Dark mode detection (WKWebView propagates prefers-color-scheme)
- [x] Version sync: bump-version.ts updates desktop project.yml MARKETING_VERSION
- [x] desktop-clean includes Xcode DerivedData cache

## Phase 6: Packaging
- [ ] Code signing
- [ ] Hardened Runtime entitlements
- [ ] Notarization
- [ ] DMG creation
