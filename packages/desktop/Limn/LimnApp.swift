// ABOUTME: SwiftUI app entry point for the Limn desktop application.
// ABOUTME: Uses WindowGroup(for: URL.self) for per-document multi-window support.

import SwiftUI

@main
struct LimnApp: App {
    @NSApplicationDelegateAdaptor private var delegate: AppDelegate
    @Environment(\.openWindow) private var openWindow
    @Environment(\.dismissWindow) private var dismissWindow

    var body: some Scene {
        Window("Welcome to Limn", id: "welcome") {
            WelcomeWindow()
                .task {
                    delegate.drainBufferedURLs { url in
                        openWindow(value: url)
                    }
                    delegate.showWelcomeAction = {
                        openWindow(id: "welcome")
                    }
                }
        }
        .restorationBehavior(.disabled)
        .defaultLaunchBehavior(.presented)

        WindowGroup(for: URL.self) { $fileURL in
            DocumentWindow(fileURL: $fileURL, appDelegate: delegate)
                .task {
                    dismissWindow(id: "welcome")
                    delegate.drainBufferedURLs { url in
                        openWindow(value: url)
                    }
                    delegate.showWelcomeAction = {
                        openWindow(id: "welcome")
                    }
                }
        } defaultValue: {
            URL(string: "limn:new/\(UUID().uuidString)")!
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 1200, height: 800)
        .defaultLaunchBehavior(.suppressed)
        .commands {
            MenuCommands()
        }
    }
}
