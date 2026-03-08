// ABOUTME: Persists and restores open-file sessions using security-scoped bookmarks.
// ABOUTME: Stores bookmark data in UserDefaults; resolves bookmarks on app launch.

import Foundation

enum SessionStore {
    private static let bookmarksKey = "sessionBookmarks"

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
}
