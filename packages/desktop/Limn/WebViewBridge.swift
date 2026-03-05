// ABOUTME: NSViewRepresentable wrapping WKWebView for the Limn web app.
// ABOUTME: Loads from bundle resources (release) or localhost:5173 (dev mode).

import SwiftUI
import WebKit

/// NSViewRepresentable that creates and manages a WKWebView for the Limn web app.
struct WebViewBridge: NSViewRepresentable {

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        // Register the message handler for JS -> Swift communication
        let handler = context.coordinator
        config.userContentController.add(handler, name: "limn")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        context.coordinator.webView = webView

        // Allow inspecting the web view in Safari dev tools
        webView.isInspectable = true

        loadContent(into: webView)
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        // No dynamic updates needed for Phase 1
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    private func loadContent(into webView: WKWebView) {
        // Dev mode: load from Vite dev server when LIMN_DEV_URL is set
        if let devURL = ProcessInfo.processInfo.environment["LIMN_DEV_URL"],
           let url = URL(string: devURL) {
            webView.load(URLRequest(url: url))
            return
        }

        // Production: load from bundle resources
        if let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") {
            webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        } else {
            // Fallback: show error message
            webView.loadHTMLString(
                "<html><body style='font-family:system-ui;padding:40px;color:#666'>"
                + "<h2>Web resources not found</h2>"
                + "<p>Run with LIMN_DEV_URL=http://localhost:5173/limn/ for development.</p>"
                + "</body></html>",
                baseURL: nil
            )
        }
    }

    // MARK: - Coordinator

    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?

        // WKScriptMessageHandler: receives messages from JS
        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String else {
                return
            }

            switch type {
            case "ready":
                // WebView is ready -- Phase 2 will send file data here
                break
            default:
                print("[Limn] Unknown message type: \(type)")
            }
        }

        // WKNavigationDelegate: log navigation errors
        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            print("[Limn] Navigation failed: \(error.localizedDescription)")
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            print("[Limn] Provisional navigation failed: \(error.localizedDescription)")
        }
    }
}
