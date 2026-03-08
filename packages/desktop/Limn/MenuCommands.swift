// ABOUTME: Native File and Edit menus for the Limn desktop app.
// ABOUTME: Uses FocusedValue to dispatch actions to the active window's Coordinator.

import SwiftUI

struct MenuCommands: Commands {
    @FocusedValue(\.documentCoordinator) var coordinator
    @Environment(\.openWindow) var openWindow
    @Environment(\.dismissWindow) var dismissWindow

    var body: some Commands {
        // MARK: - File menu

        CommandGroup(replacing: .newItem) {
            Button("New") {
                let sentinel = URL(string: "limn:new/\(UUID().uuidString)")!
                openWindow(value: sentinel)
                dismissWindow(id: "welcome")
            }
            .keyboardShortcut("n")

            Button("Open...") {
                Task { @MainActor in
                    guard let url = await FileOperations.showOpenPanel() else { return }
                    openWindow(value: url)
                    dismissWindow(id: "welcome")
                }
            }
            .keyboardShortcut("o")
        }

        CommandGroup(after: .newItem) {
            Divider()

            Button("Save") {
                coordinator?.triggerKeyboardShortcut(key: "s", meta: true)
            }
            .keyboardShortcut("s")
            .disabled(coordinator == nil)

            Button("Save As...") {
                coordinator?.triggerKeyboardShortcut(key: "s", meta: true, shift: true)
            }
            .keyboardShortcut("s", modifiers: [.command, .shift])
            .disabled(coordinator == nil)
        }

        // MARK: - Help menu

        CommandGroup(replacing: .help) {
            Button("Keyboard Shortcuts") {
                coordinator?.triggerKeyboardShortcut(key: "?")
            }
            .keyboardShortcut("/", modifiers: [.command, .shift])
            .disabled(coordinator == nil)
        }

        // MARK: - Edit menu

        CommandGroup(replacing: .undoRedo) {
            Button("Undo") {
                coordinator?.triggerKeyboardShortcut(key: "z", meta: true)
            }
            .keyboardShortcut("z")
            .disabled(coordinator == nil)

            Button("Redo") {
                coordinator?.triggerKeyboardShortcut(key: "z", meta: true, shift: true)
            }
            .keyboardShortcut("z", modifiers: [.command, .shift])
            .disabled(coordinator == nil)
        }
    }
}
