// ABOUTME: Tests for the clipboard event handler shared by the web app and the Obsidian views.
// ABOUTME: Events are plain objects with a fake clipboardData; no browser.

import { describe, it, expect, vi } from "vitest";
import { TestEditor } from "@limn/core";
import { fakeProvider } from "./fakeProvider";

const g = globalThis as Record<string, unknown>;
if (typeof g.window === "undefined") g.window = globalThis;
const win = g.window as Record<string, unknown>;
if (typeof win.dispatchEvent !== "function") win.dispatchEvent = vi.fn();
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => "blob:mock";
  globalThis.URL.revokeObjectURL = () => {};
}
class FakeImage {
  naturalWidth = 800;
  naturalHeight = 600;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) {
    queueMicrotask(() => this.onload?.());
  }
}
g.Image = FakeImage;

const { handleClipboardEvent } = await import("../input/clipboard");
const { isForeignInput } = await import("../input/foreignInput");

type Kind = "copy" | "cut" | "paste";

function fakeEvent(
  data: Record<string, string> = {},
  target: object = { tagName: "DIV", dataset: {} },
  items: unknown[] = [],
) {
  const store = new Map(Object.entries(data));
  return {
    target,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    clipboardData: {
      items,
      getData: (type: string) => store.get(type) ?? "",
      setData: (type: string, value: string) => { store.set(type, value); },
    },
    written: store,
  };
}

/** Root "Root" with child "A" that has child "A1"; three nodes in all. */
function setup() {
  const editor = new TestEditor();
  const root = editor.addRoot("Root");
  const a = editor.addChild(root, "A");
  editor.addChild(a, "A1");
  editor.exitEditMode();
  return { editor, root, a };
}

function run(
  kind: Kind,
  editor: TestEditor,
  event: ReturnType<typeof fakeEvent>,
  extra: { hasTextSelection?: () => boolean; isActive?: () => boolean } = {},
) {
  handleClipboardEvent(kind, event as unknown as ClipboardEvent, {
    editor,
    provider: fakeProvider(),
    hasTextSelection: () => false,
    ...extra,
  });
}

function childTexts(editor: TestEditor, id: string): string[] {
  return editor.getChildren(id).map((n) => n.text);
}

describe("handleClipboardEvent copy and cut", () => {
  it("copy writes the selected subtree as Markdown and leaves the map alone", () => {
    const { editor, a } = setup();
    editor.select(a);
    const e = fakeEvent();
    run("copy", editor, e);
    expect(e.written.get("text/plain")).toBe("- A\n  - A1");
    expect(e.defaultPrevented).toBe(true);
    editor.expectNodeCount(3);
  });

  it("cut writes the same text and removes the subtree, which undo restores", () => {
    const { editor, root, a } = setup();
    editor.select(a);
    const e = fakeEvent();
    run("cut", editor, e);
    expect(e.written.get("text/plain")).toBe("- A\n  - A1");
    expect(e.defaultPrevented).toBe(true);
    expect(childTexts(editor, root)).toEqual([]);
    editor.undo();
    expect(childTexts(editor, root)).toEqual(["A"]);
  });

  it.each(["copy", "cut"] as const)("%s with nothing selected does nothing", (kind) => {
    const { editor } = setup();
    editor.deselect();
    const e = fakeEvent();
    run(kind, editor, e);
    expect(e.written.size).toBe(0);
    expect(e.defaultPrevented).toBe(false);
  });

  it("copy while editing does nothing", () => {
    const { editor, a } = setup();
    editor.select(a);
    editor.enterEditMode();
    const e = fakeEvent();
    run("copy", editor, e);
    expect(e.written.size).toBe(0);
    expect(e.defaultPrevented).toBe(false);
  });

  it.each(["copy", "cut"] as const)("%s with a text selection on the page does nothing", (kind) => {
    const { editor, a } = setup();
    editor.select(a);
    const e = fakeEvent();
    run(kind, editor, e, { hasTextSelection: () => true });
    expect(e.written.size).toBe(0);
    expect(e.defaultPrevented).toBe(false);
    editor.expectNodeCount(3);
  });
});

describe("handleClipboardEvent paste", () => {
  it("adds the pasted bullets under the selected node", () => {
    const { editor, root } = setup();
    editor.select(root);
    const e = fakeEvent({ "text/plain": "- X\n- Y" });
    run("paste", editor, e);
    expect(childTexts(editor, root)).toEqual(["A", "X", "Y"]);
    expect(e.defaultPrevented).toBe(true);
  });

  it("does nothing for empty text", () => {
    const { editor, root } = setup();
    editor.select(root);
    const e = fakeEvent({ "text/plain": "  " });
    run("paste", editor, e);
    editor.expectNodeCount(3);
    expect(e.defaultPrevented).toBe(false);
  });

  it("leaves text to the textarea while editing", () => {
    const { editor, root } = setup();
    editor.select(root);
    editor.enterEditMode();
    const e = fakeEvent({ "text/plain": "- X" });
    run("paste", editor, e);
    editor.expectNodeCount(3);
    expect(e.defaultPrevented).toBe(false);
  });

  it("attaches an image and adds no nodes when both an image and text are present", async () => {
    const { editor, root } = setup();
    editor.select(root);
    const file = new Blob(["x"], { type: "image/png" });
    const e = fakeEvent({ "text/plain": "- X" }, undefined, [{ type: "image/png", getAsFile: () => file }]);
    run("paste", editor, e);
    expect(e.defaultPrevented).toBe(true);
    await vi.waitFor(() => { expect(editor.getNode(root).image).toBeDefined(); });
    editor.expectNodeCount(3);
  });

  it("attaches an image while a node is being edited", async () => {
    const { editor, root } = setup();
    editor.select(root);
    editor.enterEditMode();
    const file = new Blob(["x"], { type: "image/png" });
    const e = fakeEvent({}, undefined, [{ type: "image/png", getAsFile: () => file }]);
    run("paste", editor, e);
    expect(e.defaultPrevented).toBe(true);
    await vi.waitFor(() => { expect(editor.getNode(root).image).toBeDefined(); });
  });
});

describe("handleClipboardEvent gating", () => {
  it.each(["copy", "cut", "paste"] as const)("%s from another input does nothing", (kind) => {
    const { editor, a } = setup();
    editor.select(a);
    const e = fakeEvent({ "text/plain": "- X" }, { tagName: "INPUT", dataset: {} });
    run(kind, editor, e);
    expect(e.written.get("text/plain")).toBe("- X");
    expect(e.defaultPrevented).toBe(false);
    editor.expectNodeCount(3);
  });

  it.each(["copy", "cut", "paste"] as const)("%s does nothing when the view is inactive", (kind) => {
    const { editor, a } = setup();
    editor.select(a);
    const e = fakeEvent({ "text/plain": "- X" });
    run(kind, editor, e, { isActive: () => false });
    expect(e.defaultPrevented).toBe(false);
    editor.expectNodeCount(3);
  });
});

describe("isForeignInput", () => {
  it("is true for INPUT, a plain TEXTAREA, and contentEditable elements", () => {
    expect(isForeignInput({ tagName: "INPUT", dataset: {} } as unknown as EventTarget)).toBe(true);
    expect(isForeignInput({ tagName: "TEXTAREA", dataset: {} } as unknown as EventTarget)).toBe(true);
    expect(isForeignInput({ tagName: "DIV", dataset: {}, isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });

  it("is false for the Limn edit textarea, a DIV, and null", () => {
    expect(isForeignInput({ tagName: "TEXTAREA", dataset: { limnEdit: "true" } } as unknown as EventTarget)).toBe(false);
    expect(isForeignInput({ tagName: "DIV", dataset: {} } as unknown as EventTarget)).toBe(false);
    expect(isForeignInput(null)).toBe(false);
  });
});
