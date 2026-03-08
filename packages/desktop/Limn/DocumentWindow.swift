// ABOUTME: SwiftUI view that hosts the WKWebView for a mind map document.
// ABOUTME: Owns the Coordinator and publishes it for menu access via FocusedValue.

import SwiftUI

struct DocumentWindow: View {
    @Binding var fileURL: URL
    let appDelegate: AppDelegate
    @State private var coordinator = WebViewBridge.Coordinator()

    var body: some View {
        WebViewBridge(
            coordinator: coordinator,
            fileURL: fileURL,
            appDelegate: appDelegate,
            onFileURLChanged: { url in
                fileURL = url
                appDelegate.updateCoordinatorFileURL(
                    ObjectIdentifier(coordinator),
                    fileURL: url
                )
            }
        )
        .ignoresSafeArea()
        .focusedSceneValue(\.documentCoordinator, coordinator)
        .onDisappear {
            appDelegate.unregisterCoordinator(
                ObjectIdentifier(coordinator)
            )
        }
    }
}

// MARK: - FocusedValue for menu access to the active window's coordinator

extension FocusedValues {
    @Entry var documentCoordinator: WebViewBridge.Coordinator?
}
