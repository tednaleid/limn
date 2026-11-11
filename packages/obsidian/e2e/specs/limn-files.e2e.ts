// ABOUTME: End-to-end checks of .limn files in a real Obsidian: create, edit with the keyboard, save, and reopen.
// ABOUTME: Also covers undo and redo, two panes on one file, and renaming the file under an open view.

import { browser, expect, $ } from "@wdio/globals";
import { Key } from "webdriverio";
import {
  LIMN_VIEW, MOD, resetState, viewTypes, panePaths, openNote, openNoteInSplit, closePane, fileExists, paneSelector,
  mapTexts, selectedText, clickNode, typeIntoNode, addChild,
} from "../helpers";

const FILE = "Untitled.limn";

/** Create a .limn file with the plugin's command and build Root -> (One, Two) with the keyboard. */
async function createMap(): Promise<void> {
  await browser.executeObsidianCommand("limn:create-new");
  await browser.waitUntil(async () => (await viewTypes())[0] === LIMN_VIEW, { timeoutMsg: "the new file never opened as a map" });
  await $(`${await paneSelector(0)} [data-limn-canvas]`).click();
  await browser.keys("Enter");
  await typeIntoNode("Root");
  await browser.keys("Tab");
  await typeIntoNode("One");
  await addChild("Root", "Two");
}

/**
 * Close the pane, which saves, then open the file again. The closing pane's save can land after the
 * file is reopened, in which case the new view loads it when it arrives, so wait for the nodes.
 */
async function reopen(): Promise<void> {
  await closePane(0);
  await openNote(FILE);
  await browser.waitUntil(async () => (await viewTypes())[0] === LIMN_VIEW, { timeoutMsg: "the file never reopened as a map" });
  await browser.waitUntil(async () => (await mapTexts()).length > 0, { timeoutMsg: "the saved map never appeared" });
}

describe(".limn files", function () {
  beforeEach(resetState);

  it("creates a file that opens as a mind map", async function () {
    await browser.executeObsidianCommand("limn:create-new");
    await browser.waitUntil(async () => (await viewTypes())[0] === LIMN_VIEW, { timeoutMsg: "the new file never opened as a map" });
    expect(await panePaths()).toEqual([FILE]);
    expect(await fileExists(FILE)).toBe(true);
    await expect($(`${await paneSelector(0)} [data-limn-canvas]`)).toExist();
  });

  it("creates a second file beside the first", async function () {
    await browser.executeObsidianCommand("limn:create-new");
    await browser.waitUntil(() => fileExists(FILE), { timeoutMsg: "the first file was never created" });
    await browser.executeObsidianCommand("limn:create-new");
    await browser.waitUntil(() => fileExists("Untitled 1.limn"), { timeoutMsg: "the second file was never created" });
    expect(await panePaths()).toEqual(["Untitled 1.limn"]);
  });

  it("keeps nodes added, edited, and deleted with the keyboard after the file is closed and reopened", async function () {
    await createMap();
    expect(await mapTexts()).toEqual(["Root", "One", "Two"]);

    await clickNode("One");
    await browser.keys(Key.Backspace);
    await clickNode("Two");
    await browser.keys("Enter");
    await typeIntoNode(" more");
    expect(await mapTexts()).toEqual(["Root", "Two more"]);

    await reopen();
    expect(await mapTexts()).toEqual(["Root", "Two more"]);
  });

  it("undoes and redoes with the keyboard", async function () {
    await createMap();
    await browser.keys([MOD, "z"]);
    expect(await mapTexts()).not.toContain("Two");
    await browser.keys([MOD, Key.Shift, "z"]);
    expect(await mapTexts()).toEqual(["Root", "One", "Two"]);
  });

  it("moves the selection with the arrow keys", async function () {
    await createMap();
    await clickNode("Root");
    await browser.keys(Key.ArrowRight);
    expect(["One", "Two"]).toContain(await selectedText());
    const first = await selectedText();
    await browser.keys(first === "One" ? Key.ArrowDown : Key.ArrowUp);
    expect(await selectedText()).toBe(first === "One" ? "Two" : "One");
    await browser.keys(Key.ArrowLeft);
    expect(await selectedText()).toBe("Root");
  });

  it("shows an edit made in one pane in a second pane on the same file", async function () {
    await createMap();
    await openNoteInSplit(FILE);
    expect(await viewTypes()).toEqual([LIMN_VIEW, LIMN_VIEW]);
    await browser.waitUntil(async () => (await mapTexts(1)).length === 3, { timeoutMsg: "the second pane never showed the map" });

    await addChild("Root", "Three", 1);
    await browser.waitUntil(async () => (await mapTexts(0)).includes("Three"), {
      timeout: 15000, timeoutMsg: "the edit never reached the first pane",
    });
    expect(await mapTexts(0)).toEqual(await mapTexts(1));
  });

  it("follows the file when it is renamed", async function () {
    await createMap();
    await browser.executeObsidian(async ({ app }, from) => {
      const file = app.vault.getFileByPath(from);
      if (!file) throw new Error(`No such file: ${from}`);
      await app.fileManager.renameFile(file, "Renamed.limn");
    }, FILE);
    await browser.waitUntil(async () => (await panePaths())[0] === "Renamed.limn", { timeoutMsg: "the view never followed the rename" });
    await expect($(".workspace-tabs.mod-active .workspace-tab-header.is-active .workspace-tab-header-inner-title")).toHaveText("Renamed");

    await addChild("Root", "After rename");
    await closePane(0);
    expect(await fileExists(FILE)).toBe(false);
    await openNote("Renamed.limn");
    await browser.waitUntil(async () => (await viewTypes())[0] === LIMN_VIEW, { timeoutMsg: "the renamed file never reopened as a map" });
    await browser.waitUntil(async () => (await mapTexts()).length > 0, { timeoutMsg: "the saved map never appeared" });
    expect(await mapTexts()).toEqual(["Root", "One", "Two", "After rename"]);
  });

  it("leaves a file deleted when it is deleted while open with unsaved edits", async function () {
    await createMap();
    await browser.executeObsidian(async ({ app }, path) => {
      const file = app.vault.getFileByPath(path);
      if (!file) throw new Error(`No such file: ${path}`);
      await app.vault.delete(file);
    }, FILE);
    await browser.waitUntil(async () => (await viewTypes()).every((type) => type !== LIMN_VIEW), {
      timeoutMsg: "the map pane stayed open on a deleted file",
    });
    // Longer than the closing view takes to write a pending save.
    await browser.pause(1000);
    expect(await fileExists(FILE)).toBe(false);
    expect(await browser.executeObsidian(({ app }, path) => app.vault.adapter.exists(path), FILE)).toBe(false);
  });
});
