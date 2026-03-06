// ABOUTME: Native file dialogs and byte-level read/write for .limn files.
// ABOUTME: Wraps NSOpenPanel/NSSavePanel with security-scoped bookmark support.

import AppKit
import UniformTypeIdentifiers

/// UTType for .limn files (declared in Info.plist via project.yml in Phase 3)
extension UTType {
    static let limn = UTType("com.tednaleid.limn") ?? UTType(filenameExtension: "limn") ?? .data
}

enum FileOperations {

    /// Show an open panel for .limn files. Returns the file URL or nil if cancelled.
    static func showOpenPanel() async -> URL? {
        await MainActor.run {
            let panel = NSOpenPanel()
            panel.allowedContentTypes = [.limn]
            panel.allowsMultipleSelection = false
            panel.canChooseDirectories = false
            panel.canChooseFiles = true
            panel.message = "Choose a .limn mind map file"

            let response = panel.runModal()
            return response == .OK ? panel.url : nil
        }
    }

    /// Show a save panel for .limn files. Returns the file URL or nil if cancelled.
    static func showSavePanel(suggestedName: String = "Untitled.limn") async -> URL? {
        await MainActor.run {
            let panel = NSSavePanel()
            panel.allowedContentTypes = [.limn]
            panel.nameFieldStringValue = suggestedName
            panel.canCreateDirectories = true

            let response = panel.runModal()
            return response == .OK ? panel.url : nil
        }
    }

    /// Read raw bytes from a file URL.
    static func readFile(at url: URL) throws -> Data {
        return try Data(contentsOf: url)
    }

    /// Write raw bytes to a file URL.
    static func writeFile(_ data: Data, to url: URL) throws {
        try data.write(to: url, options: .atomic)
    }

    /// Create a security-scoped bookmark for persisting file access across launches.
    static func createBookmark(for url: URL) throws -> Data {
        return try url.bookmarkData(
            options: .withSecurityScope,
            includingResourceValuesForKeys: nil,
            relativeTo: nil
        )
    }

    /// Resolve a security-scoped bookmark back to a URL.
    static func resolveBookmark(_ data: Data) throws -> (URL, Bool) {
        var isStale = false
        let url = try URL(
            resolvingBookmarkData: data,
            options: .withSecurityScope,
            relativeTo: nil,
            bookmarkDataIsStale: &isStale
        )
        return (url, isStale)
    }
}
