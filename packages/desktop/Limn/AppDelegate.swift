// ABOUTME: NSApplicationDelegate that handles file-open events from Finder and Dock.
// ABOUTME: Buffers URLs received before SwiftUI provides the openWindow action.

import AppKit

@Observable
class AppDelegate: NSObject, NSApplicationDelegate {
    /// URLs received before we have an openWindow action available.
    var bufferedURLs: [URL] = []

    /// Set by a SwiftUI view once the openWindow environment action is available.
    var openWindowAction: ((URL) -> Void)?

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
}
