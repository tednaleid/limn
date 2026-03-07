// ABOUTME: Debug-only HTTP server for inspecting the running desktop app.
// ABOUTME: Exposes /eval, /screenshot, /state, /windows endpoints on localhost:9876.

#if DEBUG

import AppKit
import Network
import WebKit

/// Minimal HTTP server using Network.framework for debug inspection of the app.
/// Only compiled into Debug builds -- never ships in Release.
enum DebugServer {
    private nonisolated(unsafe) static var listener: NWListener?
    private nonisolated(unsafe) static var coordinatorProvider: ((String?) -> WebViewBridge.Coordinator?)?

    /// Start listening on localhost:9876.
    /// - Parameter provider: closure returning a coordinator for a given filename (nil = default).
    static func start(coordinatorProvider: @escaping (String?) -> WebViewBridge.Coordinator?) {
        self.coordinatorProvider = coordinatorProvider

        let params = NWParameters.tcp
        params.requiredLocalEndpoint = NWEndpoint.hostPort(host: .ipv4(.loopback), port: 9876)

        do {
            let listener = try NWListener(using: params)
            listener.newConnectionHandler = { connection in
                handleConnection(connection)
            }
            listener.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    print("[DebugServer] Listening on localhost:9876")
                case .failed(let error):
                    print("[DebugServer] Failed: \(error)")
                default:
                    break
                }
            }
            listener.start(queue: .global(qos: .utility))
            self.listener = listener
        } catch {
            print("[DebugServer] Could not create listener: \(error)")
        }
    }

    static func stop() {
        listener?.cancel()
        listener = nil
        coordinatorProvider = nil
    }

    // MARK: - Connection handling

    private static func handleConnection(_ connection: NWConnection) {
        connection.start(queue: .global(qos: .utility))
        // Read up to 1MB of request data
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1_048_576) { data, _, _, error in
            if let error = error {
                print("[DebugServer] Receive error: \(error)")
                connection.cancel()
                return
            }
            guard let data = data else {
                connection.cancel()
                return
            }
            let request = parseRequest(data)
            routeRequest(request, connection: connection)
        }
    }

    // MARK: - HTTP parsing

    struct HTTPRequest {
        var method: String
        var path: String
        var query: [String: String]
        var body: String
    }

    static func parseRequest(_ data: Data) -> HTTPRequest {
        let raw = String(data: data, encoding: .utf8) ?? ""
        let lines = raw.split(separator: "\r\n", omittingEmptySubsequences: false)

        var method = "GET"
        var fullPath = "/"
        if let requestLine = lines.first {
            let parts = requestLine.split(separator: " ", maxSplits: 2)
            if parts.count >= 2 {
                method = String(parts[0])
                fullPath = String(parts[1])
            }
        }

        // Split path and query string
        var path = fullPath
        var query: [String: String] = [:]
        if let qIndex = fullPath.firstIndex(of: "?") {
            path = String(fullPath[fullPath.startIndex..<qIndex])
            let queryString = String(fullPath[fullPath.index(after: qIndex)...])
            for param in queryString.split(separator: "&") {
                let kv = param.split(separator: "=", maxSplits: 1)
                if kv.count == 2 {
                    let key = String(kv[0]).removingPercentEncoding ?? String(kv[0])
                    let value = String(kv[1]).removingPercentEncoding ?? String(kv[1])
                    query[key] = value
                }
            }
        }

        // Body is after the blank line
        var body = ""
        if let blankLineIndex = lines.firstIndex(of: "") {
            let bodyLines = lines[(blankLineIndex + 1)...]
            body = bodyLines.joined(separator: "\r\n")
        }

        return HTTPRequest(method: method, path: path, query: query, body: body)
    }

    // MARK: - Routing

    private static func routeRequest(_ request: HTTPRequest, connection: NWConnection) {
        let filename = request.query["file"]

        switch (request.method, request.path) {
        case ("GET", "/windows"):
            handleWindows(connection: connection)
        case ("POST", "/eval"):
            handleEval(body: request.body, filename: filename, connection: connection)
        case ("GET", "/screenshot"):
            handleScreenshot(filename: filename, connection: connection)
        case ("GET", "/state"):
            handleState(filename: filename, connection: connection)
        default:
            sendJSON(["error": "Not found: \(request.method) \(request.path)"], status: 404, connection: connection)
        }
    }

    // MARK: - Handlers

    private static func handleWindows(connection: NWConnection) {
        DispatchQueue.main.async {
            let delegate = NSApp?.delegate as? AppDelegate
            let windows = delegate?.windowList() ?? []
            sendJSONArray(windows, connection: connection)
        }
    }

    private static func handleEval(body: String, filename: String?, connection: NWConnection) {
        let js = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !js.isEmpty else {
            sendJSON(["error": "Empty JS body"], status: 400, connection: connection)
            return
        }

        DispatchQueue.main.async {
            guard let coordinator = coordinatorProvider?(filename),
                  let webView = coordinator.webView else {
                sendJSON(["error": filename != nil ? "No window for file: \(filename!)" : "No active window"], status: 404, connection: connection)
                return
            }

            webView.evaluateJavaScript(js) { result, error in
                if let error = error {
                    sendJSON(["error": error.localizedDescription], connection: connection)
                } else {
                    sendJSON(["result": result ?? NSNull()], connection: connection)
                }
            }
        }
    }

    private static func handleScreenshot(filename: String?, connection: NWConnection) {
        DispatchQueue.main.async {
            guard let coordinator = coordinatorProvider?(filename),
                  let webView = coordinator.webView else {
                sendJSON(["error": filename != nil ? "No window for file: \(filename!)" : "No active window"], status: 404, connection: connection)
                return
            }

            let config = WKSnapshotConfiguration()
            webView.takeSnapshot(with: config) { image, error in
                if let error = error {
                    sendJSON(["error": "Screenshot failed: \(error.localizedDescription)"], connection: connection)
                    return
                }
                guard let image = image,
                      let tiff = image.tiffRepresentation,
                      let bitmap = NSBitmapImageRep(data: tiff),
                      let png = bitmap.representation(using: .png, properties: [:]) else {
                    sendJSON(["error": "Screenshot conversion failed"], connection: connection)
                    return
                }
                sendRaw(data: png, contentType: "image/png", connection: connection)
            }
        }
    }

    private static func handleState(filename: String?, connection: NWConnection) {
        let js = """
        (function() {
            var nodes = document.querySelectorAll('[data-node-id]');
            var selected = document.querySelector('[data-node-id].selected');
            return JSON.stringify({
                nodeCount: nodes.length,
                selectedId: selected ? selected.getAttribute('data-node-id') : null,
                filename: document.title || null,
                zoom: window.__lmnZoom || null
            });
        })()
        """

        DispatchQueue.main.async {
            guard let coordinator = coordinatorProvider?(filename),
                  let webView = coordinator.webView else {
                sendJSON(["error": filename != nil ? "No window for file: \(filename!)" : "No active window"], status: 404, connection: connection)
                return
            }

            webView.evaluateJavaScript(js) { result, error in
                if let error = error {
                    sendJSON(["error": error.localizedDescription], connection: connection)
                } else if let jsonString = result as? String,
                          let jsonData = jsonString.data(using: .utf8) {
                    // Send the pre-serialized JSON directly
                    sendRaw(data: jsonData, contentType: "application/json", connection: connection)
                } else {
                    sendJSON(["error": "Unexpected result"], connection: connection)
                }
            }
        }
    }

    // MARK: - Response helpers

    static func formatJSONResponse(_ dict: [String: Any], status: Int = 200) -> Data {
        let statusText = status == 200 ? "OK" : (status == 404 ? "Not Found" : "Bad Request")
        let jsonData = (try? JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys])) ?? Data("{}".utf8)
        let header = "HTTP/1.1 \(status) \(statusText)\r\nContent-Type: application/json\r\nContent-Length: \(jsonData.count)\r\nConnection: close\r\n\r\n"
        return Data(header.utf8) + jsonData
    }

    private static func sendJSON(_ dict: [String: Any], status: Int = 200, connection: NWConnection) {
        let response = formatJSONResponse(dict, status: status)
        connection.send(content: response, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private static func sendJSONArray(_ array: [[String: Any]], connection: NWConnection) {
        let jsonData = (try? JSONSerialization.data(withJSONObject: array, options: [.sortedKeys])) ?? Data("[]".utf8)
        let header = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: \(jsonData.count)\r\nConnection: close\r\n\r\n"
        let response = Data(header.utf8) + jsonData
        connection.send(content: response, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private static func sendRaw(data: Data, contentType: String, connection: NWConnection) {
        let header = "HTTP/1.1 200 OK\r\nContent-Type: \(contentType)\r\nContent-Length: \(data.count)\r\nConnection: close\r\n\r\n"
        let response = Data(header.utf8) + data
        connection.send(content: response, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }
}

#endif
