// ABOUTME: XCTest suite for AppDelegate URL buffering and coordinator registry.
// ABOUTME: Tests drainBufferedURLs, popFirstBufferedURL, and coordinator lifecycle.

import XCTest
@testable import Limn

@MainActor
final class AppDelegateTests: XCTestCase {

    // MARK: - URL buffering

    func testDrainBufferedURLsCallsOpenerForEachURL() {
        let delegate = AppDelegate()
        let urlA = URL(string: "file:///tmp/a.limn")!
        let urlB = URL(string: "file:///tmp/b.limn")!
        delegate.bufferedURLs = [urlA, urlB]

        var opened: [URL] = []
        delegate.drainBufferedURLs { url in
            opened.append(url)
        }

        XCTAssertEqual(opened, [urlA, urlB])
        XCTAssertTrue(delegate.bufferedURLs.isEmpty, "buffer should be drained")
    }

    func testDrainSetsOpenWindowAction() {
        let delegate = AppDelegate()
        XCTAssertNil(delegate.openWindowAction)

        delegate.drainBufferedURLs { _ in }

        XCTAssertNotNil(delegate.openWindowAction)
    }

    func testPopFirstBufferedURLReturnsFirstAndRemoves() {
        let delegate = AppDelegate()
        let urlA = URL(string: "file:///tmp/a.limn")!
        let urlB = URL(string: "file:///tmp/b.limn")!
        delegate.bufferedURLs = [urlA, urlB]

        let first = delegate.popFirstBufferedURL()
        XCTAssertEqual(first, urlA)
        XCTAssertEqual(delegate.bufferedURLs, [urlB])
    }

    func testPopFirstBufferedURLReturnsNilWhenEmpty() {
        let delegate = AppDelegate()
        delegate.bufferedURLs.removeAll()  // init() may restore from session
        XCTAssertNil(delegate.popFirstBufferedURL())
    }

    // MARK: - Coordinator registry

    func testRegisterAndUnregisterCoordinator() {
        let delegate = AppDelegate()
        let coordinator = WebViewBridge.Coordinator()
        let id = ObjectIdentifier(coordinator)
        let fileURL = URL(string: "file:///tmp/test.limn")!

        delegate.registerCoordinator(id, coordinator: coordinator, fileURL: fileURL)

        // Update with a new URL
        let newURL = URL(string: "file:///tmp/renamed.limn")!
        delegate.updateCoordinatorFileURL(id, fileURL: newURL)

        // Unregister
        delegate.unregisterCoordinator(id)
        // No crash = success (internals are private, so we just verify no errors)
    }

    func testRegisterCoordinatorWithNilFileURL() {
        let delegate = AppDelegate()
        let coordinator = WebViewBridge.Coordinator()
        let id = ObjectIdentifier(coordinator)

        // Should not crash when fileURL is nil (new unsaved window)
        delegate.registerCoordinator(id, coordinator: coordinator, fileURL: nil)
        delegate.unregisterCoordinator(id)
    }

    // MARK: - Coordinator lookup

    func testCoordinatorForFilenameReturnsMatch() {
        let delegate = AppDelegate()
        let coordinator = WebViewBridge.Coordinator()
        let id = ObjectIdentifier(coordinator)
        let fileURL = URL(string: "file:///tmp/test.limn")!

        delegate.registerCoordinator(id, coordinator: coordinator, fileURL: fileURL)

        let found = delegate.coordinator(forFilename: "test.limn")
        XCTAssertIdentical(found, coordinator)
    }

    func testCoordinatorForFilenameReturnsNilWhenNoMatch() {
        let delegate = AppDelegate()
        let coordinator = WebViewBridge.Coordinator()
        let id = ObjectIdentifier(coordinator)
        let fileURL = URL(string: "file:///tmp/test.limn")!

        delegate.registerCoordinator(id, coordinator: coordinator, fileURL: fileURL)

        XCTAssertNil(delegate.coordinator(forFilename: "nonexistent.limn"))
    }

    func testCoordinatorDefaultReturnsFirstLive() {
        let delegate = AppDelegate()
        let coordinator = WebViewBridge.Coordinator()
        let id = ObjectIdentifier(coordinator)

        delegate.registerCoordinator(id, coordinator: coordinator, fileURL: nil)

        let found = delegate.coordinator()
        XCTAssertIdentical(found, coordinator)
    }

    func testWindowListReturnsEntries() {
        let delegate = AppDelegate()
        let coordinator = WebViewBridge.Coordinator()
        let id = ObjectIdentifier(coordinator)
        let fileURL = URL(string: "file:///tmp/test.limn")!

        delegate.registerCoordinator(id, coordinator: coordinator, fileURL: fileURL)

        let list = delegate.windowList()
        XCTAssertEqual(list.count, 1)
        XCTAssertEqual(list[0]["filename"] as? String, "test.limn")
    }
}
