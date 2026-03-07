// ABOUTME: XCTest suite for FileOperations read/write and bookmark round-trip.
// ABOUTME: Tests file I/O with temp files and security-scoped bookmark creation.

import XCTest
@testable import Limn

final class FileOperationsTests: XCTestCase {
    private var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("limn-fileops-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    // MARK: - Read/Write

    func testWriteAndReadFile() throws {
        let url = tempDir.appendingPathComponent("test.limn")
        let content = Data("hello limn".utf8)

        try FileOperations.writeFile(content, to: url)
        let read = try FileOperations.readFile(at: url)

        XCTAssertEqual(read, content)
    }

    func testReadNonexistentFileThrows() {
        let url = tempDir.appendingPathComponent("nonexistent.limn")

        XCTAssertThrowsError(try FileOperations.readFile(at: url))
    }

    func testWriteOverwritesExistingFile() throws {
        let url = tempDir.appendingPathComponent("overwrite.limn")
        try FileOperations.writeFile(Data("first".utf8), to: url)
        try FileOperations.writeFile(Data("second".utf8), to: url)

        let read = try FileOperations.readFile(at: url)
        XCTAssertEqual(String(data: read, encoding: .utf8), "second")
    }

    // MARK: - Bookmarks

    func testBookmarkRoundTrip() throws {
        let url = tempDir.appendingPathComponent("bookmark.limn")
        try FileOperations.writeFile(Data("data".utf8), to: url)

        let bookmarkData = try FileOperations.createBookmark(for: url)
        let (resolved, isStale) = try FileOperations.resolveBookmark(bookmarkData)

        XCTAssertEqual(resolved.lastPathComponent, "bookmark.limn")
        XCTAssertFalse(isStale, "freshly created bookmark should not be stale")
    }
}
