// ABOUTME: End-to-end checks of copying, cutting, and pasting subtrees as Markdown in both map views.
// ABOUTME: Covers a .limn file, a Markdown-backed note, and which of two panes receives a paste.

import { browser, expect, $ } from "@wdio/globals";
import {
  LIMN_VIEW, MAP_VIEW, MOD, resetState, viewTypes, openNote, openNoteInSplit, closePane, paneSelector, mapTexts, clickNode,
  typeIntoNode, addChild, readNote, waitForNote, copyFromMap, pasteTextIntoMap,
} from "../helpers";

const FILE = "Untitled.limn";

/** Create a .limn file with the plugin's command and build Root > A > A1 with the keyboard. */
async function createMap(): Promise<void> {
  await browser.executeObsidianCommand("limn:create-new");
  await browser.waitUntil(async () => (await viewTypes())[0] === LIMN_VIEW, { timeoutMsg: "the new file never opened as a map" });
  await $(`${await paneSelector(0)} [data-limn-canvas]`).click();
  await browser.keys("Enter");
  await typeIntoNode("Root");
  await browser.keys("Tab");
  await typeIntoNode("A");
  await addChild("A", "A1");
}

/** Close the pane, which saves, then open the file again and wait for its nodes. */
async function reopen(): Promise<void> {
  await closePane(0);
  await openNote(FILE);
  await browser.waitUntil(async () => (await viewTypes())[0] === LIMN_VIEW, { timeoutMsg: "the file never reopened as a map" });
  await browser.waitUntil(async () => (await mapTexts()).length > 0, { timeoutMsg: "the saved map never appeared" });
}

describe("Copy, cut, and paste in a .limn file", function () {
  beforeEach(resetState);

  it("copies a subtree as Markdown and pastes it under another node, surviving a reopen", async function () {
    await createMap();
    await clickNode("A");
    expect(await copyFromMap("copy")).toBe("- A\n  - A1");

    await clickNode("Root");
    await pasteTextIntoMap("- A\n  - A1");
    expect(await mapTexts()).toEqual(["Root", "A", "A1", "A", "A1"]);

    await reopen();
    expect(await mapTexts()).toEqual(["Root", "A", "A1", "A", "A1"]);
  });

  it("cuts a subtree and brings it back with a paste", async function () {
    await createMap();
    await clickNode("A");
    const cut = await copyFromMap("cut");
    expect(cut).toBe("- A\n  - A1");
    expect(await mapTexts()).toEqual(["Root"]);

    await clickNode("Root");
    await pasteTextIntoMap(cut);
    expect(await mapTexts()).toEqual(["Root", "A", "A1"]);
  });

  it("copies and pastes with the real keys", async function () {
    await createMap();
    await clickNode("A");
    await browser.keys([MOD, "c"]);
    await clickNode("Root");
    await browser.keys([MOD, "v"]);
    await browser.waitUntil(async () => (await mapTexts()).length === 5, { timeoutMsg: "the pasted subtree never appeared" });
    expect(await mapTexts()).toEqual(["Root", "A", "A1", "A", "A1"]);
  });
});

describe("Copy, cut, and paste in a Markdown-backed map", function () {
  beforeEach(resetState);

  it("writes pasted bullets into the note under the selected node", async function () {
    await openNote("marked.md");
    await clickNode("Root");
    await pasteTextIntoMap("- Pasted\n  - Child");
    const text = await waitForNote("marked.md", (t) => t.includes("Pasted"), "the pasted nodes never reached the note");
    expect(text).toBe(
      "---\nlimn-plugin: true\n---\n# A marked note\n\n- Root\n  - First\n  - Second\n  - Pasted\n    - Child\n",
    );
  });

  it("copies a node with its children as the note's own lines", async function () {
    await openNote("marked.md");
    await clickNode("Root");
    const copied = await copyFromMap("copy");
    const note = await readNote("marked.md");
    expect(copied).toBe("- Root\n  - First\n  - Second");
    expect(note).toContain(`\n${copied}\n`);
  });

  it("pastes only into the active pane", async function () {
    await openNote("marked.md");
    await openNoteInSplit("marked-b.md");
    expect(await viewTypes()).toEqual([MAP_VIEW, MAP_VIEW]);
    await browser.waitUntil(async () => (await mapTexts(1)).length > 0, { timeoutMsg: "the second map never appeared" });
    const before = await mapTexts(0);
    await clickNode("Root", 0);
    await clickNode("Other map", 1);
    await pasteTextIntoMap("- Only here");
    expect(await mapTexts(1)).toContain("Only here");
    expect(await mapTexts(0)).toEqual(before);
  });
});
