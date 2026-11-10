// ABOUTME: Drives OutlineDocument through the TextFileView open, save, and external-change sequence.
// ABOUTME: A small fake view reproduces the base class's data/disk bookkeeping; no Obsidian involved.

import { describe, it, expect, beforeEach } from "vitest";
import { Editor, stubTextMeasurer, OUTLINE_CAPABILITIES, resetIdCounter } from "@limn/core";
import { OutlineDocument } from "../markdown/OutlineDocument";
import type { SaveHost } from "../markdown/OutlineDocument";

const THEME = { mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" };

class FakeTextFileView implements SaveHost {
  data = "";
  disk = "";
  writes: string[] = [];
  dirty = false;

  constructor(private readonly doc: OutlineDocument) {
    doc.attach(this);
  }

  requestSave(): void {
    this.dirty = true;
  }

  open(text: string): void {
    this.disk = text;
    this.data = text;
    this.dirty = false;
    this.doc.load(text, true);
  }

  /** What the debounce or a close does. */
  save(): void {
    const next = this.doc.viewData();
    this.dirty = false;
    if (next === this.data) return;
    this.data = next;
    this.disk = next;
    this.writes.push(next);
  }

  /** Another writer changed the file. */
  externalChange(text: string): void {
    this.disk = text;
    this.data = text;
    this.doc.load(text, false);
  }
}

function makeView(): { editor: Editor; doc: OutlineDocument; view: FakeTextFileView } {
  const editor = new Editor(stubTextMeasurer);
  editor.setCapabilities(OUTLINE_CAPABILITIES);
  const doc = new OutlineDocument(editor, () => THEME);
  return { editor, doc, view: new FakeTextFileView(doc) };
}

const HAND_FORMATTED = "-   Monday\n    -   Standup\n-   Tuesday\n";

describe("OutlineDocument through the TextFileView sequence", () => {
  beforeEach(() => resetIdCounter());

  it("writes nothing for selection and camera changes on a hand-formatted note", () => {
    const { editor, view } = makeView();
    view.open(HAND_FORMATTED);
    editor.select(editor.getRoots()[1]!.id);
    editor.setCamera(10, 20, 1.5);
    view.save();
    expect(view.writes).toEqual([]);
  });

  it("writes the canonical text with the edit after a text change", () => {
    const { editor, view } = makeView();
    view.open(HAND_FORMATTED);
    editor.setText(editor.getRoots()[0]!.id, "Monday!");
    view.save();
    expect(view.writes).toEqual(["- Monday!\n  - Standup\n- Tuesday\n"]);
  });

  it("writes nothing when an edit is undone before the save", () => {
    const { editor, view } = makeView();
    view.open(HAND_FORMATTED);
    editor.setText(editor.getRoots()[0]!.id, "Monday!");
    editor.undo();
    view.save();
    expect(view.writes).toEqual([]);
  });

  it("writes the canonical original when an edit is saved and then undone", () => {
    const { editor, view } = makeView();
    view.open(HAND_FORMATTED);
    editor.setText(editor.getRoots()[0]!.id, "Monday!");
    view.save();
    editor.undo();
    view.save();
    expect(view.writes).toEqual(["- Monday!\n  - Standup\n- Tuesday\n", "- Monday\n  - Standup\n- Tuesday\n"]);
  });

  it("keeps node ids and selection of unchanged nodes across an external change over a dirty edit", () => {
    const { editor, view } = makeView();
    view.open("- a\n- b\n");
    const [a, b] = editor.getRoots();
    editor.select(b!.id);
    editor.setText(a!.id, "a!");
    expect(view.dirty).toBe(true);
    view.externalChange("- a\n- b\n- c\n");
    expect(editor.getRoots().map((r) => r.text)).toEqual(["a", "b", "c"]);
    expect(editor.getRoots().map((r) => r.id).slice(0, 2)).toEqual([a!.id, b!.id]);
    expect(editor.getSelectedId()).toBe(b!.id);
  });

  it("writes only to the first note when a second note is opened over it", () => {
    const { editor, view } = makeView();
    view.open("- a\n");
    editor.setText(editor.getRoots()[0]!.id, "a!");
    view.save();
    view.open("- b\n");
    view.save();
    expect(view.writes).toEqual(["- a!\n"]);
  });

  it("writes nothing for a note the map refuses, even after the map is edited", () => {
    const { editor, view } = makeView();
    view.open("- parent\n  1. one\n  2. two\n");
    editor.addRoot("typed");
    view.save();
    expect(view.writes).toEqual([]);
  });

  it("drops an empty in-progress node on an external update with the same text and writes nothing", () => {
    const { editor, view } = makeView();
    view.open("- a\n");
    const root = editor.getRoots()[0]!;
    editor.addChild(root.id, "");
    expect(editor.getChildren(root.id)).toHaveLength(1);
    view.externalChange("- a\n");
    expect(editor.getChildren(editor.getRoots()[0]!.id)).toHaveLength(0);
    view.save();
    expect(view.writes).toEqual([]);
  });
});
