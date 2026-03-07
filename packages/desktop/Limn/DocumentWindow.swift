// ABOUTME: SwiftUI view that hosts the WKWebView for a mind map document.
// ABOUTME: Owns the Coordinator and publishes it for menu access via FocusedValue.

import SwiftUI

struct DocumentWindow: View {
    @Binding var fileURL: URL
    @State private var coordinator = WebViewBridge.Coordinator()

    var body: some View {
        WebViewBridge(coordinator: coordinator)
            .ignoresSafeArea()
            .focusedSceneValue(\.documentCoordinator, coordinator)
            .task {
                let delegate = NSApp?.delegate as? AppDelegate
                delegate?.registerCoordinator(
                    ObjectIdentifier(coordinator),
                    coordinator: coordinator,
                    fileURL: fileURL.isFileURL ? fileURL : nil
                )
                if fileURL.isFileURL {
                    coordinator.pendingFileURL = fileURL
                }
                coordinator.onFileURLChanged = { url in
                    fileURL = url
                    delegate?.updateCoordinatorFileURL(
                        ObjectIdentifier(coordinator),
                        fileURL: url
                    )
                }
            }
            .onDisappear {
                (NSApp?.delegate as? AppDelegate)?.unregisterCoordinator(
                    ObjectIdentifier(coordinator)
                )
            }
    }
}

// MARK: - FocusedValue for menu access to the active window's coordinator

extension FocusedValues {
    @Entry var documentCoordinator: WebViewBridge.Coordinator?
}
