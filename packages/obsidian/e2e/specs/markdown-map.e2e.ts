// ABOUTME: End-to-end checks that a marked Markdown note opens as a mind map in a real Obsidian.
// ABOUTME: Drives the map with the keyboard and asserts on the note's text in the vault.

import { browser, expect, $$ } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

const MAP_VIEW = "limn-markdown-view";

function activeViewType(): Promise<string | undefined> {
  return browser.executeObsidian(({ app }) => app.workspace.activeLeaf?.view.getViewType());
}

/** The first node drawn in the active pane's map. */
function firstNode() {
  return $$(".workspace-leaf.mod-active .limn-view [data-node-id]")[0];
}

function readNote(path: string): Promise<string> {
  return browser.executeObsidian(async ({ app }, p) => {
    const file = app.vault.getFileByPath(p);
    if (!file) throw new Error(`No such note: ${p}`);
    return app.vault.read(file);
  }, path);
}

describe("Markdown-backed mind maps", function () {
  beforeEach(async function () {
    await browser.executeObsidian(({ app }) => {
      app.workspace.iterateRootLeaves((leaf) => leaf.detach());
    });
    await obsidianPage.resetVault();
  });

  it("opens a marked note as a map and an unmarked note as Markdown", async function () {
    await obsidianPage.openFile("marked.md");
    expect(await activeViewType()).toBe(MAP_VIEW);
    await expect(firstNode()).toExist();

    await obsidianPage.openFile("plain.md");
    expect(await activeViewType()).toBe("markdown");
  });

  it("leaves the note untouched when it is only viewed", async function () {
    const before = await readNote("marked.md");
    await obsidianPage.openFile("marked.md");
    await firstNode().click();
    await browser.pause(3000);
    expect(await readNote("marked.md")).toBe(before);
  });

  it("writes a node added with the keyboard into the note", async function () {
    await obsidianPage.openFile("marked.md");
    await firstNode().click();
    await browser.keys("Tab");
    await browser.keys([..."from e2e"]);
    await browser.keys("Escape");

    await browser.waitUntil(async () => (await readNote("marked.md")).includes("from e2e"), {
      timeout: 10000,
      timeoutMsg: "the new node never reached the note",
    });
    const text = await readNote("marked.md");
    expect(text).toContain("limn-plugin: true");
    expect(text).toContain("# A marked note");
    expect(text).toMatch(/^ {2}- from e2e$/m);
  });
});
