// ABOUTME: SwiftUI view that hosts the WKWebView for a mind map document.
// ABOUTME: Owns the Coordinator and publishes it for menu access via FocusedValue.

import SwiftUI

struct DocumentWindow: View {
    @Binding var fileURL: URL?
    @State private var coordinator = WebViewBridge.Coordinator()

    var body: some View {
        WebViewBridge(coordinator: coordinator)
            .ignoresSafeArea()
            .focusedSceneValue(\.documentCoordinator, coordinator)
            .onAppear {
                if let url = fileURL, url.isFileURL {
                    coordinator.pendingFileURL = url
                }
            }
    }
}

// MARK: - FocusedValue for menu access to the active window's coordinator

extension FocusedValues {
    @Entry var documentCoordinator: WebViewBridge.Coordinator?
}
