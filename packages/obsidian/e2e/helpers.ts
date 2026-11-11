// ABOUTME: Shared helpers for the end-to-end specs: panes, notes, map nodes, and plugin settings.
// ABOUTME: Panes are addressed by their index among the main area's leaves, in workspace order.

import { browser, $ } from "@wdio/globals";
import { Key } from "webdriverio";
import { obsidianPage } from "wdio-obsidian-service";

export const MAP_VIEW = "limn-markdown-view";
export const LIMN_VIEW = "limn-view";
export const MARKDOWN_VIEW = "markdown";

/** The modifier the map's key bindings use: the meta key on every platform. */
export const MOD = Key.Command;

interface MapNode {
  id: string;
  text: string;
  children: MapNode[];
}

/** The parts of a map view the specs read. */
interface MapViewLike {
  editor: {
    toJSON(): { roots: MapNode[] };
    getSelectedId(): string | null;
  };
}

/** Close every pane, restore the fixture vault, and put the plugin's settings back to their defaults. */
export async function resetState(): Promise<void> {
  await browser.executeObsidian(async ({ app, plugins }) => {
    // Collected first: detaching while iterating skips panes.
    const leaves: { detach(): void }[] = [];
    app.workspace.iterateRootLeaves((leaf) => { leaves.push(leaf); });
    leaves.forEach((leaf) => leaf.detach());
    // Menus drawn by the operating system are invisible to the test driver.
    (app.vault as unknown as { setConfig(key: string, value: unknown): void }).setConfig("nativeMenus", false);
    const limn = plugins.limn as unknown as {
      settings: { openMarkedNotesAs: string };
      leafChoices: WeakMap<object, unknown>;
      saveSettings(): Promise<void>;
    };
    limn.settings.openMarkedNotesAs = "mindmap";
    // Obsidian keeps the last pane's leaf when it is closed, and with it any "Open as" choice.
    limn.leafChoices = new WeakMap();
    await limn.saveSettings();
  });
  // A closing pane saves its file on the way out; restoring the vault under it would race that write.
  await browser.pause(300);
  await obsidianPage.resetVault();
}

export async function setOpenMarkedNotesAs(value: "mindmap" | "markdown"): Promise<void> {
  await browser.executeObsidian(async ({ plugins }, v) => {
    const limn = plugins.limn as unknown as { settings: { openMarkedNotesAs: string }; saveSettings(): Promise<void> };
    limn.settings.openMarkedNotesAs = v;
    await limn.saveSettings();
  }, value);
}

/** View type of every pane in the main area. */
export function viewTypes(): Promise<string[]> {
  return browser.executeObsidian(({ app }) => {
    const types: string[] = [];
    app.workspace.iterateRootLeaves((leaf) => { types.push(leaf.view.getViewType()); });
    return types;
  });
}

/** Path of the file each pane in the main area shows. */
export function panePaths(): Promise<(string | undefined)[]> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const paths: (string | undefined)[] = [];
    app.workspace.iterateRootLeaves((leaf) => {
      paths.push(leaf.view instanceof obsidian.FileView ? leaf.view.file?.path : undefined);
    });
    return paths;
  });
}

/** Open a note in the pane that has focus, the way a click in the file browser does. */
export async function openNote(path: string): Promise<void> {
  await browser.executeObsidian(async ({ app }, p) => {
    const file = app.vault.getFileByPath(p);
    if (!file) throw new Error(`No such file: ${p}`);
    await app.workspace.getLeaf(false).openFile(file);
  }, path);
}

/** Open a note in a new pane split off the focused one. */
export async function openNoteInSplit(path: string): Promise<void> {
  await browser.executeObsidian(async ({ app }, p) => {
    const file = app.vault.getFileByPath(p);
    if (!file) throw new Error(`No such file: ${p}`);
    const leaf = app.workspace.getLeaf("split");
    await leaf.openFile(file);
    app.workspace.setActiveLeaf(leaf, { focus: true });
  }, path);
}

/** Give a pane the focus, as a click on its tab does. */
export async function focusPane(index: number): Promise<void> {
  await browser.executeObsidian(({ app }, i) => {
    let n = 0;
    app.workspace.iterateRootLeaves((leaf) => {
      if (n++ === i) app.workspace.setActiveLeaf(leaf, { focus: true });
    });
  }, index);
}

export async function closePane(index: number): Promise<void> {
  await browser.executeObsidian(({ app }, i) => {
    const leaves: { detach(): void }[] = [];
    app.workspace.iterateRootLeaves((leaf) => { leaves.push(leaf); });
    leaves[i]?.detach();
  }, index);
}

export async function readNote(path: string): Promise<string> {
  return await browser.executeObsidian(async ({ app }, p) => {
    const file = app.vault.getFileByPath(p);
    if (!file) throw new Error(`No such file: ${p}`);
    return app.vault.read(file);
  }, path);
}

export function fileExists(path: string): Promise<boolean> {
  return browser.executeObsidian(({ app }, p) => app.vault.getFileByPath(p) !== null, path);
}

/** CSS selector for a pane's container. Tags the containers first, since Obsidian gives them no stable id. */
export async function paneSelector(index: number): Promise<string> {
  await browser.executeObsidian(({ app }) => {
    let i = 0;
    app.workspace.iterateRootLeaves((leaf) => {
      (leaf as unknown as { containerEl: HTMLElement }).containerEl.dataset.e2ePane = String(i++);
    });
  });
  return `[data-e2e-pane="${index}"]`;
}

/** Text of every node in a pane's map, depth first. */
export function mapTexts(pane = 0): Promise<string[]> {
  return browser.executeObsidian(({ app }, i) => {
    const views: unknown[] = [];
    app.workspace.iterateRootLeaves((leaf) => { views.push(leaf.view); });
    const view = views[i] as MapViewLike | undefined;
    if (!view?.editor) throw new Error(`Pane ${i} is not a map`);
    const texts: string[] = [];
    const visit = (node: MapNode) => { texts.push(node.text); node.children.forEach(visit); };
    view.editor.toJSON().roots.forEach(visit);
    return texts;
  }, pane);
}

/** How a pane's map is drawn: the zoom, the widest node as laid out, and how many nodes are in the DOM. */
export function mapDrawing(pane = 0): Promise<{ zoom: number; widestNode: number; drawnNodes: number }> {
  return browser.executeObsidian(({ app }, i) => {
    const views: unknown[] = [];
    app.workspace.iterateRootLeaves((leaf) => { views.push(leaf.view); });
    const view = views[i] as {
      contentEl: HTMLElement;
      editor?: { getCamera(): { zoom: number }; toJSON(): { roots: { width: number; children: never[] }[] } };
    } | undefined;
    if (!view?.editor) throw new Error(`Pane ${i} is not a map`);
    let widestNode = 0;
    const visit = (node: { width: number; children: never[] }) => {
      widestNode = Math.max(widestNode, node.width);
      node.children.forEach(visit);
    };
    view.editor.toJSON().roots.forEach(visit);
    return {
      zoom: view.editor.getCamera().zoom,
      widestNode,
      drawnNodes: view.contentEl.querySelectorAll("[data-node-id]").length,
    };
  }, pane);
}

/** Text of the selected node in a pane's map, or null when nothing is selected. */
export function selectedText(pane = 0): Promise<string | null> {
  return browser.executeObsidian(({ app }, i) => {
    const views: unknown[] = [];
    app.workspace.iterateRootLeaves((leaf) => { views.push(leaf.view); });
    const view = views[i] as MapViewLike | undefined;
    if (!view?.editor) throw new Error(`Pane ${i} is not a map`);
    const selected = view.editor.getSelectedId();
    let found: string | null = null;
    const visit = (node: MapNode) => { if (node.id === selected) found = node.text; node.children.forEach(visit); };
    view.editor.toJSON().roots.forEach(visit);
    return found;
  }, pane);
}

/** Click the node with the given text in a pane's map, which selects it and gives the map the keyboard. */
export async function clickNode(text: string, pane = 0): Promise<void> {
  const id = await browser.executeObsidian(({ app }, i, t) => {
    const views: unknown[] = [];
    app.workspace.iterateRootLeaves((leaf) => { views.push(leaf.view); });
    const view = views[i] as MapViewLike | undefined;
    if (!view?.editor) throw new Error(`Pane ${i} is not a map`);
    let found: string | null = null;
    const visit = (node: MapNode) => { if (found === null && node.text === t) found = node.id; node.children.forEach(visit); };
    view.editor.toJSON().roots.forEach(visit);
    return found as string | null;
  }, pane, text);
  if (id === null) throw new Error(`No node with text "${text}" in pane ${pane}`);
  await $(`${await paneSelector(pane)} [data-node-id="${id}"]`).click();
}

const NODE_TEXT_BOX = "textarea[data-limn-edit]";

/**
 * Type into the node that has just entered edit mode, then leave edit mode. Waits for the text box
 * to take the keyboard first; keys sent before that would be read as map commands.
 */
export async function typeIntoNode(text: string): Promise<void> {
  await browser.waitUntil(() => $(NODE_TEXT_BOX).isFocused(), { timeoutMsg: "no node took the keyboard for editing" });
  await browser.keys([...text]);
  await browser.keys("Escape");
  await $(NODE_TEXT_BOX).waitForExist({ reverse: true });
}

/** Type into the node being edited and stay in edit mode. */
export async function typeIntoNodeWithoutLeaving(text: string): Promise<void> {
  await browser.waitUntil(() => $(NODE_TEXT_BOX).isFocused(), { timeoutMsg: "no node took the keyboard for editing" });
  await browser.keys([...text]);
}

/** Add a child with the given text under the named node, using the keyboard. */
export async function addChild(parent: string, text: string, pane = 0): Promise<void> {
  await clickNode(parent, pane);
  await browser.keys("Tab");
  await typeIntoNode(text);
}

/** Text in a pane's Markdown editor. */
export function editorText(pane: number): Promise<string> {
  return browser.executeObsidian(({ app, obsidian }, i) => {
    const views: unknown[] = [];
    app.workspace.iterateRootLeaves((leaf) => { views.push(leaf.view); });
    const view = views[i];
    if (!(view instanceof obsidian.MarkdownView)) throw new Error(`Pane ${i} is not a Markdown editor`);
    return view.editor.getValue();
  }, pane);
}

/** Replace the first line containing `find` in a pane's Markdown editor, as an edit typed by the user. */
export async function replaceEditorLine(pane: number, find: string, replacement: string): Promise<void> {
  await browser.executeObsidian(({ app, obsidian }, i, f, r) => {
    const views: unknown[] = [];
    app.workspace.iterateRootLeaves((leaf) => { views.push(leaf.view); });
    const view = views[i];
    if (!(view instanceof obsidian.MarkdownView)) throw new Error(`Pane ${i} is not a Markdown editor`);
    for (let line = 0; line < view.editor.lineCount(); line++) {
      if (view.editor.getLine(line).includes(f)) {
        view.editor.setLine(line, r);
        return;
      }
    }
    throw new Error(`No line containing "${f}"`);
  }, pane, find, replacement);
}

/** Wait until the note's text satisfies the predicate, then return it. */
export async function waitForNote(path: string, predicate: (text: string) => boolean, what: string): Promise<string> {
  let text = "";
  await browser.waitUntil(async () => {
    text = await readNote(path);
    return predicate(text);
  }, { timeout: 10000, timeoutMsg: `${path}: ${what}` });
  return text;
}
