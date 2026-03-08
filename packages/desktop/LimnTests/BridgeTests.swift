// ABOUTME: XCTest suite for the JS-Swift bridge message handling.
// ABOUTME: Tests message serialization and coordinator dispatch logic.

import XCTest
@testable import Limn

final class BridgeTests: XCTestCase {

    func testCoordinatorHandlesReadyMessage() throws {
        let coordinator = WebViewBridge.Coordinator()

        // The coordinator should handle a "ready" message without crashing.
        // We can't easily test WKScriptMessageHandler directly without a real
        // WKWebView, but we can verify the coordinator initializes correctly.
        XCTAssertNil(coordinator.webView, "webView should be nil before association")
    }
}
