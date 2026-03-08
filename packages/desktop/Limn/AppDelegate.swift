// ABOUTME: NSApplicationDelegate that handles file-open events from Finder and Dock.
// ABOUTME: Buffers URLs, tracks open coordinators, and manages session restore on launch/quit.

import AppKit

@Observable @MainActor
class AppDelegate: NSObject, NSApplicationDelegate {
    /// URLs received before we have an openWindow action available.
    /// Populated eagerly in init() so they're available before SwiftUI
    /// evaluates the WindowGroup defaultValue closure.
    var bufferedURLs: [URL] = []

    /// Set by a SwiftUI view once the openWindow environment action is available.
    var openWindowAction: ((URL) -> Void)?

    /// Set by a SwiftUI view to show the welcome window when all documents close.
    var showWelcomeAction: (() -> Void)?

    /// True when there are buffered URLs waiting to open (session restore or file-open on launch).
    var hasBufferedURLs: Bool { !bufferedURLs.isEmpty }

    /// Registry of open coordinators, keyed by coordinator identity.
    /// Stores a weak ref to the coordinator alongside its file URL.
    struct CoordinatorEntry {
        weak var coordinator: WebViewBridge.Coordinator?
        var fileURL: URL?
    }
    private var coordinatorEntries: [ObjectIdentifier: CoordinatorEntry] = [:]

    /// File URLs captured in applicationShouldTerminate for cleanup in
    /// applicationWillTerminate (after .onDisappear has cleared the registry).
    private var sessionFileURLs: [URL] = []

    override init() {
        super.init()
        // Restore session here (not in applicationDidFinishLaunching) because
        // SwiftUI evaluates the WindowGroup defaultValue closure before
        // applicationDidFinishLaunching fires.
        bufferedURLs = SessionStore.restoreSession()
    }

    // MARK: - NSApplicationDelegate

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            showWelcomeAction?()
        }
        return false
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        #if DEBUG
        DebugServer.start()
        #endif
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        // Save session here, before windows close. applicationWillTerminate fires
        // after .onDisappear has already unregistered all coordinators.
        sessionFileURLs = coordinatorEntries.values.compactMap(\.fileURL).filter { $0.isFileURL }
        SessionStore.saveSession(fileURLs: sessionFileURLs)
        return .terminateNow
    }

    func applicationWillTerminate(_ notification: Notification) {
        #if DEBUG
        DebugServer.stop()
        #endif
        for url in sessionFileURLs {
            SessionStore.stopAccessingResource(for: url)
        }
    }

    /// Called by macOS when the user double-clicks a .limn file, uses Open Recent,
    /// or drags a file onto the Dock icon.
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            if let opener = openWindowAction {
                opener(url)
            } else {
                bufferedURLs.append(url)
            }
        }
    }

    /// Drain any buffered URLs using the provided opener closure.
    func drainBufferedURLs(opener: @escaping (URL) -> Void) {
        openWindowAction = opener
        for url in bufferedURLs {
            opener(url)
        }
        bufferedURLs.removeAll()
    }

    /// Remove and return the first buffered URL, or nil if empty.
    /// Used by LimnApp to consume the first session-restored URL as
    /// the initial window instead of creating a blank canvas.
    func popFirstBufferedURL() -> URL? {
        guard !bufferedURLs.isEmpty else { return nil }
        return bufferedURLs.removeFirst()
    }

    // MARK: - Coordinator registry

    func registerCoordinator(_ id: ObjectIdentifier, coordinator: WebViewBridge.Coordinator, fileURL: URL?) {
        coordinatorEntries[id] = CoordinatorEntry(coordinator: coordinator, fileURL: fileURL)
    }

    func updateCoordinatorFileURL(_ id: ObjectIdentifier, fileURL: URL) {
        coordinatorEntries[id]?.fileURL = fileURL
    }

    func unregisterCoordinator(_ id: ObjectIdentifier) {
        coordinatorEntries.removeValue(forKey: id)
        if coordinatorEntries.isEmpty {
            showWelcomeAction?()
        }
    }

    /// Returns a live coordinator, optionally matching a filename.
    /// Falls back to the first entry with a live coordinator.
    func coordinator(forFilename filename: String? = nil) -> WebViewBridge.Coordinator? {
        if let filename = filename {
            for entry in coordinatorEntries.values {
                if let coord = entry.coordinator,
                   entry.fileURL?.lastPathComponent == filename {
                    return coord
                }
            }
            return nil
        }
        // Default: return first live coordinator
        for entry in coordinatorEntries.values {
            if let coord = entry.coordinator {
                return coord
            }
        }
        return nil
    }

    /// Returns a snapshot of all open windows with their index and file info.
    func windowList() -> [[String: Any]] {
        var result: [[String: Any]] = []
        for (index, entry) in coordinatorEntries.values.enumerated() {
            guard entry.coordinator != nil else { continue }
            var info: [String: Any] = ["index": index]
            if let url = entry.fileURL {
                info["filename"] = url.lastPathComponent
                info["url"] = url.absoluteString
            }
            result.append(info)
        }
        return result
    }
}
