// ABOUTME: End-to-end checks that editing a Markdown-backed map changes the note, and only where it should.
// ABOUTME: Covers saving, a map and a Markdown editor on one note, images, collapsing, links, and untouched prose.

import { browser, expect, $, $$ } from "@wdio/globals";
import {
  MAP_VIEW, MARKDOWN_VIEW, MOD, resetState, viewTypes, panePaths, openNote, openNoteInSplit, focusPane, closePane, readNote,
  fileExists, paneSelector, mapTexts, savePane, clickNode, addChild, typeIntoNodeWithoutLeaving, editorText, replaceEditorLine, waitForNote,
} from "../helpers";

/**
 * Open the marked note as a map in pane 0 and as Markdown in pane 1. The map is opened last, so it is
 * fitted to the pane at its final width and every node can be clicked.
 */
async function openMapBesideMarkdown(path: string): Promise<void> {
  await openNote("plain.md");
  await openNoteInSplit(path);
  await browser.executeObsidianCommand("limn:open-as-markdown");
  await browser.waitUntil(async () => (await viewTypes())[1] === MARKDOWN_VIEW, { timeoutMsg: "second pane never became Markdown" });
  await focusPane(0);
  await openNote(path);
  expect(await viewTypes()).toEqual([MAP_VIEW, MARKDOWN_VIEW]);
}

/** Obsidian's global for the document of the focused window; used inside code run in the app. */
declare const activeDocument: Document;

/** A one pixel PNG. */
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("Editing a Markdown-backed map", function () {
  beforeEach(resetState);

  it("leaves the note untouched when it is only viewed", async function () {
    const before = await readNote("marked.md");
    await openNote("marked.md");
    await clickNode("First");
    await savePane(0);
    expect(await readNote("marked.md")).toBe(before);
  });

  it("leaves a hand-formatted note byte-identical when it is opened and closed", async function () {
    const before = await readNote("hand-formatted.md");
    await openNote("hand-formatted.md");
    expect(await viewTypes()).toEqual([MAP_VIEW]);
    expect(await mapTexts()).toEqual(["Plus bullet", "Four space child", "Another child"]);
    await clickNode("Plus bullet");
    await savePane(0);
    await closePane(0);
    expect(await readNote("hand-formatted.md")).toBe(before);
  });

  it("writes a node added with the keyboard into the note", async function () {
    await openNote("marked.md");
    await addChild("Root", "from e2e");
    const text = await waitForNote("marked.md", (t) => t.includes("from e2e"), "the new node never reached the note");
    expect(text).toBe("---\nlimn-plugin: true\n---\n# A marked note\n\n- Root\n  - First\n  - Second\n  - from e2e\n");
  });

  it("keeps a map and a Markdown editor on the same note in step", async function () {
    await openMapBesideMarkdown("marked.md");

    await addChild("Root", "from the map");
    await browser.waitUntil(async () => (await editorText(1)).includes("  - from the map"), {
      timeout: 10000, timeoutMsg: "the map's edit never reached the Markdown editor",
    });

    await replaceEditorLine(1, "Second", "  - Second from Markdown");
    await browser.waitUntil(async () => (await mapTexts(0)).includes("Second from Markdown"), {
      timeout: 10000, timeoutMsg: "the Markdown edit never reached the map",
    });
    expect(await mapTexts(0)).toEqual(["Root", "First", "Second from Markdown", "from the map"]);
  });

  it("keeps both edits when a node is being edited while another line changes in the Markdown editor", async function () {
    await openMapBesideMarkdown("marked.md");

    await clickNode("First", 0);
    await browser.keys("Enter");
    await typeIntoNodeWithoutLeaving(" edited");
    await replaceEditorLine(1, "Second", "  - Second from Markdown");
    // Saved here, ahead of the map: each pane saves two seconds after its own last edit, and two panes
    // that write the note in the same instant do not merge; the later write replaces the earlier one.
    await savePane(1);
    await browser.waitUntil(async () => (await mapTexts(0)).includes("Second from Markdown"), {
      timeout: 10000, timeoutMsg: "the Markdown edit never reached the map while a node was being edited",
    });
    await browser.keys("Escape");

    const text = await waitForNote("marked.md", (t) => t.includes("First edited"), "the node edit never reached the note");
    expect(text).toContain("  - First edited\n");
    expect(text).toContain("  - Second from Markdown\n");
  });

  it("stores a pasted image as an attachment and shows it again after the note is reopened", async function () {
    await openNote("marked.md");
    await clickNode("First");
    await browser.execute((base64: string) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
      activeDocument.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    }, PNG_BASE64);

    const text = await waitForNote("marked.md", (t) => /!\[\[[^\]]+\.png/.test(t), "the embed never reached the note");
    const attachment = /!\[\[([^\]|]+\.png)/.exec(text)?.[1] ?? "";
    expect(text).toContain(`  - First\\\n    ![[${attachment}`);
    const attachmentPath = await browser.executeObsidian(({ app }, link) =>
      app.metadataCache.getFirstLinkpathDest(link, "marked.md")?.path ?? null, attachment);
    expect(attachmentPath).not.toBeNull();

    await closePane(0);
    await openNote("marked.md");
    const image = $(`${await paneSelector(0)} .node-image-group image`);
    await image.waitForExist();
    expect(await image.getAttribute("href")).toMatch(/^(app|blob|capacitor):/);
  });

  it("marks a collapsed node with a star bullet and an expanded one with a dash", async function () {
    await openNote("marked.md");
    await clickNode("Root");
    await browser.keys(" ");
    const collapsed = await waitForNote("marked.md", (t) => t.includes("* Root"), "collapsing never reached the note");
    expect(collapsed).toContain("\n* Root\n  - First\n  - Second\n");

    await browser.keys(" ");
    const expanded = await waitForNote("marked.md", (t) => t.includes("- Root"), "expanding never reached the note");
    expect(expanded).toContain("\n- Root\n  - First\n  - Second\n");
  });

  it("opens a wikilink's note in a new tab", async function () {
    await openNote("links.md");
    await clickNode("See [[Another note]]");
    await browser.keys([MOD, "Enter"]);
    await browser.waitUntil(async () => (await panePaths()).includes("Another note.md"), { timeoutMsg: "the linked note never opened" });
    expect(await panePaths()).toEqual(["links.md", "Another note.md"]);
    expect(await viewTypes()).toEqual([MAP_VIEW, MARKDOWN_VIEW]);
  });

  it("leaves a rule and a math block alone when a node is edited", async function () {
    await openNote("rule-math.md");
    expect(await mapTexts()).toEqual(["Root", "First"]);
    await addChild("Root", "from e2e");
    const text = await waitForNote("rule-math.md", (t) => t.includes("from e2e"), "the new node never reached the note");
    expect(text).toBe(
      "---\nlimn-plugin: true\n---\nAbove the rule.\n\n* * *\n\nBelow the rule.\n\n$$\n- x\n$$\n\n- Root\n  - First\n  - from e2e\n",
    );
  });

  it("refuses a note it cannot round-trip: says why, opens it as Markdown, and leaves the file alone", async function () {
    const before = await readNote("numbered.md");
    await openNote("numbered.md");
    let notice = "";
    await browser.waitUntil(async () => {
      notice = (await $$(".notice").map((el) => el.getProperty("textContent"))).join("\n");
      return notice.includes("Limn cannot show this note as a mind map without changing it");
    }, { timeoutMsg: "no notice explained the refusal" });
    expect(notice).toContain("Line 5: a list item contains a numbered list");
    await browser.waitUntil(async () => (await viewTypes())[0] === MARKDOWN_VIEW, { timeoutMsg: "the note never opened as Markdown" });
    expect(await editorText(0)).toBe(before);
    await savePane(0);
    expect(await readNote("numbered.md")).toBe(before);
    expect(await fileExists("numbered.md")).toBe(true);
  });
});
