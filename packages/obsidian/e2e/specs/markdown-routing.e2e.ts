// ABOUTME: End-to-end checks of which view a Markdown note opens in: marker, setting, and "Open as" choices.
// ABOUTME: Uses the file browser and the real menus, since routing wraps Obsidian's own leaf handling.

import { browser, expect, $, $$ } from "@wdio/globals";
import {
  MAP_VIEW, MARKDOWN_VIEW, resetState, setOpenMarkedNotesAs, viewTypes, panePaths, openNote, paneSelector,
  waitForMapTexts, waitForViewTypes, waitForPanePaths,
} from "../helpers";

/**
 * Do something to the file browser until it has the wanted effect. The file browser redraws its rows
 * while the vault is being restored between tests, and a click that lands during a redraw is lost.
 */
async function untilItTakes(act: () => Promise<void>, took: () => Promise<boolean>, failure: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await act();
    try {
      await browser.waitUntil(took, { timeout: 2000 });
      return;
    } catch {
      // Try again.
    }
  }
  throw new Error(failure);
}

async function openFileBrowserMenu(path: string): Promise<void> {
  await untilItTakes(
    () => $(`.nav-file-title[data-path="${path}"]`).click({ button: "right" }),
    () => $(".menu").isDisplayed(),
    `no menu for ${path}`,
  );
}

/** Click a note in the file browser. */
async function clickInFileBrowser(path: string): Promise<void> {
  await untilItTakes(
    () => $(`.nav-file-title[data-path="${path}"]`).click(),
    async () => (await panePaths())[0] === path,
    `${path} never opened`,
  );
}

/** Titles of the items in the menu that is open. */
async function menuTitles(): Promise<string[]> {
  await $(".menu").waitForDisplayed();
  return $$(".menu .menu-item-title").map((el) => el.getText());
}

async function waitForMenuClosed(): Promise<void> {
  await $(".menu").waitForExist({ reverse: true });
}

async function chooseMenuItem(title: string): Promise<void> {
  await $(".menu").waitForDisplayed();
  const items = await $$(".menu .menu-item").filter(async (el) => (await el.getText()) === title);
  expect(items.length).toBe(1);
  await items[0]?.click();
  await waitForMenuClosed();
}

async function waitForViewType(type: string): Promise<void> {
  await browser.waitUntil(async () => (await viewTypes())[0] === type, { timeoutMsg: `pane never became ${type}` });
}

describe("Routing Markdown notes", function () {
  beforeEach(resetState);

  it("opens a marked note as a map and an unmarked note as Markdown", async function () {
    await clickInFileBrowser("marked.md");
    await waitForViewTypes([MAP_VIEW]);
    await waitForMapTexts(["Root", "First", "Second"]);

    await clickInFileBrowser("plain.md");
    await waitForViewTypes([MARKDOWN_VIEW]);
  });

  it("switches a pane both ways from the menus and keeps the choice for that note in that pane", async function () {
    await clickInFileBrowser("marked.md");
    const pane = await paneSelector(0);

    await $(`${pane} .view-actions [aria-label="More options"]`).click();
    expect((await menuTitles()).filter((t) => t === "Open as Markdown")).toHaveLength(1);
    await chooseMenuItem("Open as Markdown");
    await waitForViewType(MARKDOWN_VIEW);

    await clickInFileBrowser("plain.md");
    await clickInFileBrowser("marked.md");
    await waitForViewTypes([MARKDOWN_VIEW]);

    await $(`${pane} .cm-content`).click({ button: "right" });
    await chooseMenuItem("Open as mind map");
    await waitForViewType(MAP_VIEW);

    await clickInFileBrowser("plain.md");
    await clickInFileBrowser("marked.md");
    await waitForViewTypes([MAP_VIEW]);
  });

  it("offers both views for a marked note in the file browser menu, and only the map for an unmarked one", async function () {
    await openFileBrowserMenu("marked.md");
    const marked = await menuTitles();
    expect(marked).toContain("Open as mind map");
    expect(marked).toContain("Open as Markdown");
    await browser.keys("Escape");
    await waitForMenuClosed();

    await openFileBrowserMenu("plain.md");
    const plain = await menuTitles();
    expect(plain).toContain("Open as mind map");
    expect(plain).not.toContain("Open as Markdown");
    await chooseMenuItem("Open as mind map");
    await waitForViewType(MAP_VIEW);
    await waitForPanePaths(["plain.md"]);
  });

  it("opens marked notes as Markdown when the setting says so, and still opens them as a map on request", async function () {
    await setOpenMarkedNotesAs("markdown");
    await clickInFileBrowser("marked.md");
    await waitForViewTypes([MARKDOWN_VIEW]);

    await browser.executeObsidianCommand("limn:open-as-mindmap");
    await waitForViewType(MAP_VIEW);
    await waitForMapTexts(["Root", "First", "Second"]);
  });

  it("does not carry an \"Open as mind map\" choice over to the next note opened in that pane", async function () {
    await setOpenMarkedNotesAs("markdown");
    await openNote("marked.md");
    await browser.executeObsidianCommand("limn:open-as-mindmap");
    await waitForViewType(MAP_VIEW);

    await clickInFileBrowser("marked-b.md");
    await waitForViewTypes([MARKDOWN_VIEW]);
  });
});
