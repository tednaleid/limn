// ABOUTME: SwiftUI app entry point for the Limn desktop application.
// ABOUTME: Creates a single-window app hosting the mind map in a WKWebView.

import SwiftUI

@main
struct LimnApp: App {
    var body: some Scene {
        WindowGroup {
            DocumentWindow(fileURL: .constant(nil))
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 1200, height: 800)
        .commands {
            MenuCommands()
        }
    }
}
