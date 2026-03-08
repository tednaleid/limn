// ABOUTME: NSViewRepresentable wrapping WKWebView for the Limn web app.
// ABOUTME: Handles JS-Swift bridge messages for file operations and persistence.

import SwiftUI
import WebKit

/// NSViewRepresentable that creates and manages a WKWebView for the Limn web app.
struct WebViewBridge: NSViewRepresentable {
    /// Coordinator is created externally by DocumentWindow so it can be published
    /// via focusedSceneValue for menu access.
    let coordinator: Coordinator
    var fileURL: URL?
    let appDelegate: AppDelegate
    var onFileURLChanged: ((URL) -> Void)?

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        // Register the message handler for JS -> Swift communication
        config.userContentController.add(coordinator, name: "limn")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = coordinator
        coordinator.webView = webView

        // Allow inspecting the web view in Safari dev tools
        webView.isInspectable = true

        // Register coordinator with AppDelegate. Uses assumeIsolated because
        // makeNSView runs on the main thread but is nonisolated in Swift 6,
        // while coordinator properties are @MainActor-isolated.
        MainActor.assumeIsolated {
            coordinator.onFileURLChanged = onFileURLChanged
            appDelegate.registerCoordinator(
                ObjectIdentifier(coordinator),
                coordinator: coordinator,
                fileURL: fileURL?.isFileURL == true ? fileURL : nil
            )
            if let url = fileURL, url.isFileURL {
                coordinator.pendingFileURL = url
            }
        }

        loadContent(into: webView)
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
    }

    func makeCoordinator() -> Coordinator {
        coordinator
    }

    private func loadContent(into webView: WKWebView) {
        // Dev mode: load from Vite dev server when LIMN_DEV_URL is set
        if let devURL = ProcessInfo.processInfo.environment["LIMN_DEV_URL"],
           let url = URL(string: devURL) {
            webView.load(URLRequest(url: url))
            return
        }

        // Production: load bundled web resources from Resources/web/
        if let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") {
            webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        } else {
            #if DEBUG
            // No bundled resources -- try the Vite dev server as a fallback.
            // This handles Finder-launched dev builds where LIMN_DEV_URL isn't set.
            webView.load(URLRequest(url: URL(string: "http://localhost:5173/limn/")!))
            #else
            fatalError("Missing bundled web resources in Release build")
            #endif
        }
    }

    // MARK: - Coordinator

    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?

        /// Path to the currently open file (nil for unsaved documents).
        var currentFileURL: URL?

        /// File URL to load once the web view signals "ready" (cold-start buffering).
        var pendingFileURL: URL?

        /// True after the web view has sent the "ready" message.
        var isReady = false

        /// Called when the file URL changes (open, save-as) so the window binding
        /// stays in sync with SwiftUI's WindowGroup dedup.
        var onFileURLChanged: ((URL) -> Void)?

        // WKScriptMessageHandler: receives messages from JS
        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String else {
                return
            }
            let payload = body["payload"] as? [String: Any]

            switch type {
            case "ready":
                isReady = true
                if let url = pendingFileURL {
                    pendingFileURL = nil
                    loadFileIntoWebView(url: url)
                }

            case "save":
                guard let base64 = payload?["data"] as? String else { return }
                handleSave(base64: base64)

            case "requestOpen":
                handleRequestOpen()

            case "requestSaveAs":
                guard let base64 = payload?["data"] as? String else { return }
                handleRequestSaveAs(base64: base64)

            default:
                print("[Limn] Unknown message type: \(type)")
            }
        }

        // MARK: - Message handlers

        private func handleSave(base64: String) {
            guard let data = Data(base64Encoded: base64) else {
                print("[Limn] Save failed: invalid base64")
                return
            }

            if let url = currentFileURL {
                // Save to the current file
                do {
                    try FileOperations.writeFile(data, to: url)
                    sendToJS(type: "fileSaved", payload: ["filename": url.lastPathComponent])
                } catch {
                    print("[Limn] Save failed: \(error.localizedDescription)")
                }
            } else {
                // No file open yet -- trigger save-as
                handleRequestSaveAs(base64: base64)
            }
        }

        private func handleRequestOpen() {
            Task { @MainActor in
                guard let url = await FileOperations.showOpenPanel() else { return }
                loadFileIntoWebView(url: url)
            }
        }

        /// Read a file from disk and send it to the web view as a loadFile message.
        func loadFileIntoWebView(url: URL) {
            do {
                let data = try FileOperations.readFile(at: url)
                let base64 = data.base64EncodedString()
                currentFileURL = url
                onFileURLChanged?(url)
                updateWindowTitle(url.lastPathComponent)
                NSDocumentController.shared.noteNewRecentDocumentURL(url)
                SessionStore.createAndStoreBookmark(for: url)
                appDelegate?.updateCoordinatorFileURL(ObjectIdentifier(self), fileURL: url)

                sendToJS(type: "loadFile", payload: [
                    "data": base64,
                    "filename": url.lastPathComponent,
                ])
            } catch {
                print("[Limn] Open failed: \(error.localizedDescription)")
            }
        }

        private func handleRequestSaveAs(base64: String) {
            guard let data = Data(base64Encoded: base64) else {
                print("[Limn] SaveAs failed: invalid base64")
                return
            }

            Task { @MainActor in
                let suggestedName = currentFileURL?.lastPathComponent ?? "Untitled.limn"
                guard let url = await FileOperations.showSavePanel(suggestedName: suggestedName) else { return }
                do {
                    try FileOperations.writeFile(data, to: url)
                    currentFileURL = url
                    onFileURLChanged?(url)
                    updateWindowTitle(url.lastPathComponent)
                    NSDocumentController.shared.noteNewRecentDocumentURL(url)
                    SessionStore.createAndStoreBookmark(for: url)
                    self.appDelegate?.updateCoordinatorFileURL(ObjectIdentifier(self), fileURL: url)
                    sendToJS(type: "fileSaved", payload: ["filename": url.lastPathComponent])
                } catch {
                    print("[Limn] SaveAs failed: \(error.localizedDescription)")
                }
            }
        }

        // MARK: - App delegate access

        private var appDelegate: AppDelegate? {
            NSApp?.delegate as? AppDelegate
        }

        // MARK: - Menu-triggered actions

        /// Dispatch a synthetic keyboard event into the web view so the existing
        /// JS keyboard handler processes it. Used by native menu items.
        func triggerKeyboardShortcut(key: String, meta: Bool = false, shift: Bool = false) {
            let js = "window.dispatchEvent(new KeyboardEvent('keydown',{key:'\(key)',metaKey:\(meta),shiftKey:\(shift),bubbles:true}))"
            webView?.evaluateJavaScript(js)
        }

        // MARK: - Window title

        /// Update the macOS window title bar to show the current filename
        /// and set the proxy icon via representedURL.
        private func updateWindowTitle(_ filename: String) {
            Task { @MainActor in
                webView?.window?.title = filename
                webView?.window?.representedURL = currentFileURL
            }
        }

        // MARK: - JS communication

        /// Send a message from Swift to JS via evaluateJavaScript.
        func sendToJS(type: String, payload: [String: Any] = [:]) {
            guard let webView = webView else { return }

            // Serialize payload to JSON
            let payloadJSON: String
            if payload.isEmpty {
                payloadJSON = "{}"
            } else if let jsonData = try? JSONSerialization.data(withJSONObject: payload),
                      let jsonString = String(data: jsonData, encoding: .utf8) {
                payloadJSON = jsonString
            } else {
                print("[Limn] Failed to serialize payload")
                return
            }

            let js = """
            (function() {
                var fn = window.limn && window.limn.desktop && window.limn.desktop.onMessage;
                if (fn) {
                    try { fn({type:"\(type)",payload:\(payloadJSON)}); return "ok"; }
                    catch(e) { return "ERROR: " + e.message; }
                } else {
                    return "MISSING";
                }
            })()
            """
            webView.evaluateJavaScript(js) { result, error in
                if let error = error {
                    print("[Limn] JS eval error: \(error.localizedDescription)")
                } else if let str = result as? String, str != "ok" {
                    print("[Limn] sendToJS(\(type)): \(str)")
                }
            }
        }

        // MARK: - WKNavigationDelegate

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
