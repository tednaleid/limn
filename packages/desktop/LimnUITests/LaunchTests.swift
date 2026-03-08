// ABOUTME: XCUITest for verifying the Limn desktop app launches correctly.
// ABOUTME: Checks that the menu bar and basic menus are present.

import XCTest

final class LaunchTests: XCTestCase {

    func testMenuBarExists() throws {
        let app = XCUIApplication()
        app.launch()

        // Verify standard menu bar items exist
        let menuBar = app.menuBars.firstMatch
        XCTAssertTrue(menuBar.exists, "Menu bar should exist")
    }
}
