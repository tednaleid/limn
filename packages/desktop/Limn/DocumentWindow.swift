// ABOUTME: SwiftUI view that hosts the WKWebView for a mind map document.
// ABOUTME: Wraps WebViewBridge as the main content of each window.

import SwiftUI

struct DocumentWindow: View {
    var body: some View {
        WebViewBridge()
            .ignoresSafeArea()
    }
}
