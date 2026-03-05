// ABOUTME: Native menu bar customization for the Limn desktop app.
// ABOUTME: Phase 1 provides minimal menus; Phase 4 adds full Edit/View/Help menus.

import SwiftUI

struct MenuCommands: Commands {
    var body: some Commands {
        // Remove the default "New Window" command for now (Phase 4 will add multi-window)
        CommandGroup(replacing: .newItem) {
            // Intentionally empty -- Phase 2 adds File > Open, Save, etc.
        }
    }
}
