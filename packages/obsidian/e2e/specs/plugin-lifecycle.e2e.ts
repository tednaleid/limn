// ABOUTME: End-to-end checks of what happens to open Markdown-backed maps when the plugin is disabled or reloaded.
// ABOUTME: A map pane must become a working Markdown pane with no edit lost, and come back usable.

import { browser, expect, $ } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import {
  MAP_VIEW, MARKDOWN_VIEW, resetState, viewTypes, openNote, readNote, paneSelector, mapDrawing, addChild, editorText,
  waitForNote, waitForMapTexts, waitForViewTypes,
} from "../helpers";

async function waitForViewType(type: string): Promise<void> {
  await browser.waitUntil(async () => (await viewTypes())[0] === type, { timeoutMsg: `pane never became ${type}` });
}

describe("Disabling and reloading the plugin", function () {
  beforeEach(async function () {
    await obsidianPage.enablePlugin("limn");
    await resetState();
  });

  after(async function () {
    await obsidianPage.enablePlugin("limn");
  });

  it("turns an open map pane back into a Markdown pane showing the note", async function () {
    const before = await readNote("marked.md");
    await openNote("marked.md");
    await waitForViewTypes([MAP_VIEW]);

    await obsidianPage.disablePlugin("limn");
    await waitForViewType(MARKDOWN_VIEW);
    expect(await editorText(0)).toBe(before);
    await expect($(`${await paneSelector(0)} .cm-content`)).toBeDisplayed();
    expect(await readNote("marked.md")).toBe(before);
  });

  it("keeps an edit made just before the plugin is disabled", async function () {
    await openNote("marked.md");
    await addChild("Root", "last second");
    await obsidianPage.disablePlugin("limn");

    await waitForViewType(MARKDOWN_VIEW);
    const text = await waitForNote("marked.md", (t) => t.includes("last second"), "the edit never reached the note");
    expect(text).toContain("  - last second\n");
    expect(await editorText(0)).toBe(text);
    await expect($(`${await paneSelector(0)} .cm-content`)).toBeDisplayed();
  });

  it("brings the map back, still editable, when the plugin is turned off and on with a map pane open", async function () {
    await openNote("marked.md");
    await obsidianPage.disablePlugin("limn");
    await waitForViewType(MARKDOWN_VIEW);

    await obsidianPage.enablePlugin("limn");
    await waitForViewType(MAP_VIEW);
    await waitForMapTexts(["Root", "First", "Second"]);
    // The plugin's styles load after its code, so the map is first measured and sized without them.
    let drawing = await mapDrawing();
    await browser.waitUntil(async () => {
      drawing = await mapDrawing();
      return drawing.widestNode < 200 && drawing.drawnNodes === 3 && drawing.zoom === 1;
    }).catch(() => { throw new Error(`the map never settled: ${JSON.stringify(drawing)}`); });

    await addChild("Root", "after reload");
    const text = await waitForNote("marked.md", (t) => t.includes("after reload"), "the edit never reached the note");
    expect(text).toContain("  - after reload\n");
  });
});
