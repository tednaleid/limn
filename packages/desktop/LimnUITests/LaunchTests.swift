// ABOUTME: XCUITest for verifying the Limn desktop app launches correctly.
// ABOUTME: Checks that the main window appears and basic menus are present.

import XCTest

final class LaunchTests: XCTestCase {

    func testAppLaunches() throws {
        let app = XCUIApplication()
        app.launch()

        // Verify the main window exists
        XCTAssertTrue(app.windows.count > 0, "App should have at least one window")
    }

    func testMenuBarExists() throws {
        let app = XCUIApplication()
        app.launch()

        // Verify standard menu bar items exist
        let menuBar = app.menuBars.firstMatch
        XCTAssertTrue(menuBar.exists, "Menu bar should exist")
    }
}
