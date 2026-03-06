// ABOUTME: SwiftUI app entry point for the Limn desktop application.
// ABOUTME: Uses WindowGroup(for: URL.self) for per-document multi-window support.

import SwiftUI

@main
struct LimnApp: App {
    @NSApplicationDelegateAdaptor private var delegate: AppDelegate
    @Environment(\.openWindow) private var openWindow

    var body: some Scene {
        WindowGroup(for: URL.self) { $fileURL in
            DocumentWindow(fileURL: $fileURL)
                .task {
                    delegate.drainBufferedURLs { url in
                        openWindow(value: url)
                    }
                }
        } defaultValue: {
            // Each new empty window gets a unique sentinel URL so
            // SwiftUI does not deduplicate them with each other.
            URL(string: "limn:new/\(UUID().uuidString)")!
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 1200, height: 800)
        .commands {
            MenuCommands()
        }
    }
}
