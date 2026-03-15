// ABOUTME: Persists and restores open-file sessions using security-scoped bookmarks.
// ABOUTME: Stores bookmark data in UserDefaults; resolves bookmarks on app launch.

import Foundation

enum SessionStore {
    private static let bookmarksKey = "sessionBookmarks"
    private static let dirBookmarksKey = "sessionDirectoryBookmarks"

    /// Create a security-scoped bookmark and store it keyed by the file's absolute URL string.
    /// Called whenever a file is opened or saved-as.
    static func createAndStoreBookmark(for url: URL) {
        guard url.isFileURL else { return }
        do {
            let data = try FileOperations.createBookmark(for: url)
            var stored = allBookmarks()
            stored[url.absoluteString] = data
            UserDefaults.standard.set(stored, forKey: bookmarksKey)
        } catch {
            print("[Limn] Failed to create bookmark for \(url.lastPathComponent): \(error)")
        }
    }

    /// Create a security-scoped bookmark for the parent directory of a file.
    /// Call this when the Powerbox grants directory access (e.g., after NSSavePanel).
    /// Enables sidecar directory creation for assets.
    static func createAndStoreDirectoryBookmark(for fileURL: URL) {
        guard fileURL.isFileURL else { return }
        let dir = fileURL.deletingLastPathComponent()
        do {
            let data = try FileOperations.createBookmark(for: dir)
            var stored = allDirectoryBookmarks()
            stored[fileURL.absoluteString] = data
            UserDefaults.standard.set(stored, forKey: dirBookmarksKey)
        } catch {
            // Expected to fail when opened via NSOpenPanel (no directory access).
            // Sidecar writes will work after the user saves via NSSavePanel.
            print("[Limn] Directory bookmark not available for \(fileURL.lastPathComponent)")
        }
    }

    /// Start accessing the parent directory's security scope for a file URL.
    /// Returns the directory URL if access was granted, nil otherwise.
    @discardableResult
    static func startAccessingDirectory(for fileURL: URL) -> URL? {
        guard let data = allDirectoryBookmarks()[fileURL.absoluteString] else { return nil }
        do {
            let (url, _) = try FileOperations.resolveBookmark(data)
            if url.startAccessingSecurityScopedResource() {
                return url
            }
        } catch {
            // Bookmark is stale or unresolvable -- sidecar writes won't work
        }
        return nil
    }

    /// Save the current session: store bookmarks only for the provided file URLs.
    /// Called on app termination.
    static func saveSession(fileURLs: [URL]) {
        let stored = allBookmarks()
        var sessionBookmarks: [String: Data] = [:]
        for url in fileURLs {
            let key = url.absoluteString
            if let data = stored[key] {
                sessionBookmarks[key] = data
            } else {
                // Create a bookmark if one doesn't exist yet
                do {
                    sessionBookmarks[key] = try FileOperations.createBookmark(for: url)
                } catch {
                    print("[Limn] Failed to create bookmark on save: \(error)")
                }
            }
        }
        UserDefaults.standard.set(sessionBookmarks, forKey: bookmarksKey)

        // Preserve directory bookmarks for active files
        let allDirs = allDirectoryBookmarks()
        var sessionDirs: [String: Data] = [:]
        for url in fileURLs {
            if let data = allDirs[url.absoluteString] {
                sessionDirs[url.absoluteString] = data
            }
        }
        UserDefaults.standard.set(sessionDirs, forKey: dirBookmarksKey)
    }

    /// Restore the previous session. Resolves stored bookmarks, starts security
    /// scope access, and returns the file URLs. Stale, unresolvable, or deleted
    /// bookmarks are silently dropped.
    static func restoreSession() -> [URL] {
        let stored = allBookmarks()
        guard !stored.isEmpty else { return [] }

        var urls: [URL] = []
        var updated: [String: Data] = [:]

        for (key, data) in stored {
            do {
                let (url, isStale) = try FileOperations.resolveBookmark(data)
                guard url.startAccessingSecurityScopedResource() else {
                    print("[Limn] Could not start security scope for \(url.lastPathComponent)")
                    continue
                }

                // Verify the file still exists on disk
                guard FileManager.default.fileExists(atPath: url.path) else {
                    print("[Limn] File no longer exists: \(url.lastPathComponent)")
                    url.stopAccessingSecurityScopedResource()
                    continue
                }

                urls.append(url)

                // Also start directory access for sidecar writes
                startAccessingDirectory(for: url)

                if isStale {
                    // Re-create the bookmark so it's fresh for next launch
                    if let fresh = try? FileOperations.createBookmark(for: url) {
                        updated[url.absoluteString] = fresh
                    } else {
                        updated[key] = data
                    }
                } else {
                    updated[key] = data
                }
            } catch {
                print("[Limn] Failed to resolve bookmark: \(error)")
            }
        }

        UserDefaults.standard.set(updated, forKey: bookmarksKey)
        return urls
    }

    /// Stop accessing a security-scoped resource.
    static func stopAccessingResource(for url: URL) {
        url.stopAccessingSecurityScopedResource()
    }

    // MARK: - Private

    private static func allBookmarks() -> [String: Data] {
        return UserDefaults.standard.dictionary(forKey: bookmarksKey) as? [String: Data] ?? [:]
    }

    private static func allDirectoryBookmarks() -> [String: Data] {
        return UserDefaults.standard.dictionary(forKey: dirBookmarksKey) as? [String: Data] ?? [:]
    }
}
