// ABOUTME: Welcome screen shown on fresh launch with New/Open buttons and recent files.
// ABOUTME: Dismissed when a document window opens; reappears when all documents close.

import AppKit
import SwiftUI

struct WelcomeWindow: View {
    @Environment(\.openWindow) private var openWindow
    @Environment(\.dismissWindow) private var dismissWindow

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
                .frame(height: 20)

            Text("Limn")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("Keyboard-first mind mapping")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            VStack(spacing: 12) {
                Button("New Mind Map") {
                    let sentinel = URL(string: "limn:new/\(UUID().uuidString)")!
                    openWindow(value: sentinel)
                    dismissWindow(id: "welcome")
                }
                .controlSize(.large)

                Button("Open File...") {
                    Task { @MainActor in
                        guard let url = await FileOperations.showOpenPanel() else { return }
                        openWindow(value: url)
                        dismissWindow(id: "welcome")
                    }
                }
                .controlSize(.large)
            }
            .padding(.top, 8)

            Divider()
                .padding(.horizontal, 40)

            recentFilesList

            Spacer()
        }
        .frame(width: 360, height: 400)
    }

    @ViewBuilder
    private var recentFilesList: some View {
        let recentURLs = NSDocumentController.shared.recentDocumentURLs

        if recentURLs.isEmpty {
            Text("No Recent Files")
                .foregroundStyle(.tertiary)
                .font(.subheadline)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Text("Recent Files")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 4)

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(recentURLs, id: \.self) { url in
                            Button {
                                openWindow(value: url)
                                dismissWindow(id: "welcome")
                            } label: {
                                Text(url.deletingPathExtension().lastPathComponent)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.vertical, 4)
                                    .padding(.horizontal, 20)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }
}
