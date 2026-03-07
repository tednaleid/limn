// ABOUTME: XCTest suite for SessionStore bookmark persistence and session restore.
// ABOUTME: Tests round-trip bookmark creation, session save/restore, and deleted file handling.

import XCTest
@testable import Limn

final class SessionStoreTests: XCTestCase {
    private let userDefaultsSuite = "com.tednaleid.limn.tests"
    private var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("limn-test-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        // Clear any stored bookmarks from previous test runs
        UserDefaults.standard.removeObject(forKey: "sessionBookmarks")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        UserDefaults.standard.removeObject(forKey: "sessionBookmarks")
        super.tearDown()
    }

    // MARK: - Tests

    func testCreateAndStoreBookmark() throws {
        let fileURL = tempDir.appendingPathComponent("test.limn")
        try "test data".write(to: fileURL, atomically: true, encoding: .utf8)

        SessionStore.createAndStoreBookmark(for: fileURL)

        // Verify a bookmark was stored in UserDefaults
        let stored = UserDefaults.standard.dictionary(forKey: "sessionBookmarks") as? [String: Data]
        XCTAssertNotNil(stored, "sessionBookmarks should exist in UserDefaults")
        XCTAssertNotNil(stored?[fileURL.absoluteString], "bookmark data should be stored for the file URL")
    }

    func testCreateBookmarkIgnoresNonFileURLs() {
        let sentinelURL = URL(string: "limn:new/abc123")!

        SessionStore.createAndStoreBookmark(for: sentinelURL)

        let stored = UserDefaults.standard.dictionary(forKey: "sessionBookmarks") as? [String: Data]
        XCTAssertNil(stored, "should not store bookmarks for non-file URLs")
    }

    func testSaveSessionStoresOnlyProvidedURLs() throws {
        let fileA = tempDir.appendingPathComponent("a.limn")
        let fileB = tempDir.appendingPathComponent("b.limn")
        let fileC = tempDir.appendingPathComponent("c.limn")
        for file in [fileA, fileB, fileC] {
            try "data".write(to: file, atomically: true, encoding: .utf8)
        }

        // Create bookmarks for all three files
        SessionStore.createAndStoreBookmark(for: fileA)
        SessionStore.createAndStoreBookmark(for: fileB)
        SessionStore.createAndStoreBookmark(for: fileC)

        // Save session with only A and C open
        SessionStore.saveSession(fileURLs: [fileA, fileC])

        let stored = UserDefaults.standard.dictionary(forKey: "sessionBookmarks") as? [String: Data]
        XCTAssertNotNil(stored?[fileA.absoluteString], "file A should be in session")
        XCTAssertNil(stored?[fileB.absoluteString], "file B should NOT be in session")
        XCTAssertNotNil(stored?[fileC.absoluteString], "file C should be in session")
    }

    func testRestoreSessionReturnsValidURLs() throws {
        let fileURL = tempDir.appendingPathComponent("restore-test.limn")
        try "restore data".write(to: fileURL, atomically: true, encoding: .utf8)

        // Simulate a previous session: create bookmark and save session
        SessionStore.createAndStoreBookmark(for: fileURL)
        SessionStore.saveSession(fileURLs: [fileURL])

        // Restore the session
        let restored = SessionStore.restoreSession()
        XCTAssertEqual(restored.count, 1, "should restore one file")
        XCTAssertEqual(restored.first?.lastPathComponent, "restore-test.limn")

        // Clean up security scope
        for url in restored {
            SessionStore.stopAccessingResource(for: url)
        }
    }

    func testRestoreSessionSkipsDeletedFiles() throws {
        let fileURL = tempDir.appendingPathComponent("deleted.limn")
        try "will be deleted".write(to: fileURL, atomically: true, encoding: .utf8)

        // Create bookmark while file exists
        SessionStore.createAndStoreBookmark(for: fileURL)
        SessionStore.saveSession(fileURLs: [fileURL])

        // Delete the file
        try FileManager.default.removeItem(at: fileURL)

        // Restore should return empty (file is gone)
        let restored = SessionStore.restoreSession()
        XCTAssertTrue(restored.isEmpty, "should not restore deleted files")
    }

    func testRestoreSessionReturnsEmptyWhenNoSession() {
        let restored = SessionStore.restoreSession()
        XCTAssertTrue(restored.isEmpty, "should return empty when no session exists")
    }

    func testSaveEmptySessionClearsBookmarks() throws {
        let fileURL = tempDir.appendingPathComponent("clear-test.limn")
        try "data".write(to: fileURL, atomically: true, encoding: .utf8)

        SessionStore.createAndStoreBookmark(for: fileURL)
        SessionStore.saveSession(fileURLs: [])

        let stored = UserDefaults.standard.dictionary(forKey: "sessionBookmarks") as? [String: Data]
        XCTAssertTrue(stored?.isEmpty ?? true, "session bookmarks should be empty after saving empty session")
    }
}
