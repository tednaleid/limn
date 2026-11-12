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

/** The modifier the operating system's own copy, cut, and paste chords use. */
export const CLIPBOARD_MOD = process.platform === "darwin" ? Key.Command : Key.Ctrl;

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

/** A pane as far as closing it goes. Emptying a pane resolves once its view has closed and saved. */
interface ClosableLeaf {
  setViewState(state: { type: string }): Promise<void>;
  detach(): void;
}

/** Close every pane, restore the fixture vault, and put the plugin's settings back to their defaults. */
export async function resetState(): Promise<void> {
  await browser.executeObsidian(async ({ app, plugins }) => {
    // Collected first: detaching while iterating skips panes.
    const leaves: ClosableLeaf[] = [];
    app.workspace.iterateRootLeaves((leaf) => { leaves.push(leaf); });
    // Emptied one at a time and awaited: a closing view saves its file, and restoring the vault while
    // that write is under way would let it land on the restored files.
    for (const leaf of leaves) {
      await leaf.setViewState({ type: "empty" });
      leaf.detach();
    }
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

/** Close a pane and wait for its view to finish closing, which includes the save it makes on the way out. */
export async function closePane(index: number): Promise<void> {
  await browser.executeObsidian(async ({ app }, i) => {
    const leaves: ClosableLeaf[] = [];
    app.workspace.iterateRootLeaves((leaf) => { leaves.push(leaf); });
    const leaf = leaves[i];
    if (!leaf) return;
    await leaf.setViewState({ type: "empty" });
    leaf.detach();
  }, index);
}

/** Save a pane's file now, as its view does by itself a moment after an edit. Writes nothing when nothing changed. */
export async function savePane(index: number): Promise<void> {
  await browser.executeObsidian(async ({ app }, i) => {
    const views: unknown[] = [];
    app.workspace.iterateRootLeaves((leaf) => { views.push(leaf.view); });
    const view = views[i] as { save?: () => Promise<void> } | undefined;
    if (typeof view?.save !== "function") throw new Error(`Pane ${i} has nothing to save`);
    await view.save();
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

/**
 * Poll `read` until it returns `expected`. The failure message is built when the wait gives up, so it
 * reports the last value read.
 */
async function waitForValue<T>(read: () => Promise<T>, expected: T, describe: (last: T) => string): Promise<void> {
  const want = JSON.stringify(expected);
  let last = await read();
  try {
    await browser.waitUntil(async () => {
      last = await read();
      return JSON.stringify(last) === want;
    });
  } catch {
    throw new Error(describe(last));
  }
}

/** Wait until the main area's panes show exactly these view types, in order. */
export function waitForViewTypes(expected: string[]): Promise<void> {
  return waitForValue(viewTypes, expected, (last) => `the panes never became ${JSON.stringify(expected)}; they were ${JSON.stringify(last)}`);
}

/** Wait until the main area's panes show exactly these files, in order. */
export function waitForPanePaths(expected: (string | undefined)[]): Promise<void> {
  return waitForValue(panePaths, expected, (last) => `the panes never showed ${JSON.stringify(expected)}; they showed ${JSON.stringify(last)}`);
}

/** Wait until a pane's map holds exactly the given node texts, depth first. */
export function waitForMapTexts(expected: string[], pane = 0): Promise<void> {
  return waitForValue(
    () => mapTexts(pane), expected,
    (last) => `pane ${pane} never showed ${JSON.stringify(expected)}; it showed ${JSON.stringify(last)}`,
  );
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
    const ids: string[] = [];
    const visit = (node: MapNode) => { if (node.text === t) ids.push(node.id); node.children.forEach(visit); };
    view.editor.toJSON().roots.forEach(visit);
    return ids[0] ?? null;
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

/** Obsidian's global for the document of the focused window; used inside code run in the app. */
declare const activeDocument: Document;

/**
 * Raise a copy or cut event on the focused window's document and return the text/plain the map's
 * handler put on the clipboard. The handler writes during dispatch, so the data is read back there.
 */
export function copyFromMap(kind: "copy" | "cut"): Promise<string> {
  return browser.execute((k: "copy" | "cut") => {
    const data = new DataTransfer();
    activeDocument.dispatchEvent(new ClipboardEvent(k, { clipboardData: data, bubbles: true, cancelable: true }));
    return data.getData("text/plain");
  }, kind);
}

/** Raise a paste event carrying the given text/plain on the focused window's document. */
export async function pasteTextIntoMap(text: string): Promise<void> {
  await browser.execute((t: string) => {
    const data = new DataTransfer();
    data.setData("text/plain", t);
    activeDocument.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}
