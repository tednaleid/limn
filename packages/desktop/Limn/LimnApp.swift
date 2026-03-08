// ABOUTME: SwiftUI app entry point for the Limn desktop application.
// ABOUTME: Uses WindowGroup(for: URL.self) for per-document multi-window support.

import SwiftUI

@main
struct LimnApp: App {
    @NSApplicationDelegateAdaptor private var delegate: AppDelegate
    @Environment(\.openWindow) private var openWindow

    var body: some Scene {
        WindowGroup(for: URL.self) { $fileURL in
            DocumentWindow(fileURL: $fileURL, appDelegate: delegate)
                .task {
                    delegate.drainBufferedURLs { url in
                        openWindow(value: url)
                    }
                }
        } defaultValue: {
            // If session restore has URLs waiting, use the first one for this
            // initial window instead of creating a blank canvas.
            delegate.popFirstBufferedURL()
                ?? URL(string: "limn:new/\(UUID().uuidString)")!
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 1200, height: 800)
        .commands {
            MenuCommands()
        }
    }
}
