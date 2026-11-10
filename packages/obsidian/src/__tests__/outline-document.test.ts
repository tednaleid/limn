// ABOUTME: Tests for OutlineDocument: note text into the Editor, Editor back to note text, save signal.
// ABOUTME: Runs on Editor + stubTextMeasurer; no Obsidian or DOM involved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Editor, stubTextMeasurer, OUTLINE_CAPABILITIES, parseOutline, writeOutline, findOutlineIssues, resetIdCounter,
} from "@limn/core";
import { OutlineDocument, mimeTypeForName } from "../markdown/OutlineDocument";
import type { SaveHost } from "../markdown/OutlineDocument";

const THEME = { mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" };

const NOTE = [
  "---",
  "limn-plugin: true",
  "---",
  "# Weekly plan",
  "",
  "Some prose before the list.",
  "",
  "- Monday",
  "  - Standup",
  "* Tuesday",
  "  - Hidden",
  "",
  "A paragraph between two lists.",
  "",
  "- Friday",
  "  - Retro",
  "",
].join("\n");

function makeDoc(): { editor: Editor; doc: OutlineDocument } {
  const editor = new Editor(stubTextMeasurer);
  editor.setCapabilities(OUTLINE_CAPABILITIES);
  return { editor, doc: new OutlineDocument(editor, () => THEME) };
}

function fakeHost(data: string): Omit<SaveHost, "data"> & { data: string; requestSave: ReturnType<typeof vi.fn<() => void>> } {
  return { data, requestSave: vi.fn<() => void>() };
}

const rootTexts = (editor: Editor) => editor.getRoots().map((r) => r.text);

describe("OutlineDocument.load", () => {
  beforeEach(() => resetIdCounter());

  it("loads every top-level item as a root, in document order, with collapse and children", () => {
    const { editor, doc } = makeDoc();
    doc.load(NOTE, true);
    expect(rootTexts(editor)).toEqual(["Monday", "Tuesday", "Friday"]);
    const tuesday = editor.getRoots()[1]!;
    expect(tuesday.collapsed).toBe(true);
    expect(editor.getChildren(tuesday.id).map((c) => c.text)).toEqual(["Hidden"]);
    expect(editor.getRoots().every((r) => r.x === 0)).toBe(true);
    expect(editor.getTheme()).toBe("system");
  });

  it("writes an untouched note back as its canonical form, prose intact", () => {
    const { doc } = makeDoc();
    doc.load(NOTE, true);
    expect(doc.text()).toBe(writeOutline(parseOutline(NOTE)));
    expect(doc.text()).toContain("A paragraph between two lists.");
  });

  it("is byte-identical for an already canonical note", () => {
    const canonical = writeOutline(parseOutline(NOTE));
    const { doc } = makeDoc();
    doc.load(canonical, true);
    expect(doc.text()).toBe(canonical);
  });

  it("keeps CRLF notes CRLF", () => {
    const { doc } = makeDoc();
    doc.load("- a\r\n  - b\r\n", true);
    expect(doc.text()).toBe("- a\r\n  - b\r\n");
  });
});

describe("OutlineDocument.text after edits", () => {
  beforeEach(() => resetIdCounter());

  it("puts a new child in its root's region and a new root in the last list region", () => {
    const { editor, doc } = makeDoc();
    doc.load(NOTE, true);
    const monday = editor.getRoots()[0]!;
    editor.addChild(monday.id, "Review");
    editor.exitEditMode();
    editor.addRoot("Saturday");
    editor.exitEditMode();
    const text = doc.text();
    const lines = text.split("\n");
    expect(lines.indexOf("  - Review")).toBe(lines.indexOf("- Monday") + 2);
    expect(lines.indexOf("- Saturday")).toBe(lines.indexOf("  - Retro") + 1);
  });

  it("appends the first list after prose with a blank line, keeping trailing blank lines last", () => {
    const { editor, doc } = makeDoc();
    doc.load("Just prose.\n", true);
    editor.addRoot("First");
    editor.exitEditMode();
    expect(doc.text()).toBe("Just prose.\n\n- First\n");
  });

  it("starts an empty note and a frontmatter-only note with the list itself", () => {
    const empty = makeDoc();
    empty.doc.load("", true);
    empty.editor.addRoot("First");
    empty.editor.exitEditMode();
    expect(empty.doc.text()).toBe("- First\n");

    const marked = makeDoc();
    marked.doc.load("---\nlimn-plugin: true\n---\n", true);
    marked.editor.addRoot("First");
    marked.editor.exitEditMode();
    expect(marked.doc.text()).toBe("---\nlimn-plugin: true\n---\n- First\n");
  });

  it("writes a region whose roots were all deleted as empty and leaves the prose", () => {
    const { editor, doc } = makeDoc();
    doc.load("Intro\n\n- Only\n\nOutro\n", true);
    editor.deleteNode(editor.getRoots()[0]!.id);
    expect(doc.text()).toBe("Intro\n\n\nOutro\n");
    expect(doc.text()).not.toContain("- Only");
  });

  it("does not write empty leaf nodes that are still being edited", () => {
    const { editor, doc } = makeDoc();
    doc.load("- a\n", true);
    editor.addChild(editor.getRoots()[0]!.id, "");
    expect(doc.text()).toBe("- a\n");
  });

  it("does not add a list region for a root that renders nothing", () => {
    const { editor, doc } = makeDoc();
    const host = fakeHost("Just prose.\n");
    doc.attach(host);
    doc.load("Just prose.\n", true);
    editor.addRoot("");
    expect(doc.text()).toBe("Just prose.\n");
    expect(host.requestSave).not.toHaveBeenCalled();
    editor.setText(editor.getRoots()[0]!.id, "First");
    expect(doc.text()).toBe("Just prose.\n\n- First\n");
    expect(host.requestSave).toHaveBeenCalled();
  });

  it("separates a root whose text was cleared from the paragraph above it, so the paragraph stays a paragraph", () => {
    const { editor, doc } = makeDoc();
    doc.load("Intro paragraph\n- Root\n  - child\n", true);
    editor.setText(editor.getRoots()[0]!.id, " ");
    const text = doc.text();
    expect(text).toBe("Intro paragraph\n\n-\n  - child\n");
    expect(findOutlineIssues(text)).toEqual([]);
  });
});

describe("OutlineDocument.attach", () => {
  beforeEach(() => resetIdCounter());

  it("does not request a save for camera or selection changes, even on a non-canonical note", () => {
    const { editor, doc } = makeDoc();
    const raw = "-   Monday\n    -   Standup\n";      // non-canonical indent
    const host = fakeHost(raw);
    doc.attach(host);
    doc.load(raw, true);
    editor.select(editor.getRoots()[0]!.id);
    editor.setCamera(10, 20, 1.5);
    editor.setTheme("dark");
    expect(host.requestSave).not.toHaveBeenCalled();
  });

  it("requests a save on a document change, and again on undo once the note was written", () => {
    const { editor, doc } = makeDoc();
    const raw = "-   Monday\n";
    const host = fakeHost(raw);
    doc.attach(host);
    doc.load(raw, true);
    editor.setText(editor.getRoots()[0]!.id, "Tuesday");
    expect(host.requestSave).toHaveBeenCalledTimes(1);
    host.data = doc.viewData();                       // TextFileView.save(): getViewData, then data = result
    expect(host.data).toBe("- Tuesday\n");
    editor.undo();
    expect(host.requestSave).toHaveBeenCalledTimes(2);
    expect(doc.text()).toBe("- Monday\n");
  });

  it("stops after detach", () => {
    const { editor, doc } = makeDoc();
    const host = fakeHost("- a\n");
    const detach = doc.attach(host);
    doc.load("- a\n", true);
    detach();
    editor.setText(editor.getRoots()[0]!.id, "b");
    expect(host.requestSave).not.toHaveBeenCalled();
  });
});

describe("OutlineDocument.viewData", () => {
  beforeEach(() => resetIdCounter());

  it("hands back the note exactly as loaded when nothing changed, and canonical text after a change", () => {
    const { editor, doc } = makeDoc();
    const raw = "+ Alpha\n    + Beta\n\n+ Gamma\n";
    doc.load(raw, true);
    editor.select(editor.getRoots()[0]!.id);
    expect(doc.viewData()).toBe(raw);
    editor.setText(editor.getRoots()[0]!.id, "Alpha!");
    expect(doc.viewData()).toBe("- Alpha!\n  - Beta\n- Gamma\n");
    editor.undo();
    expect(doc.viewData()).toBe("- Alpha\n  - Beta\n- Gamma\n");
  });
});

describe("OutlineDocument external updates", () => {
  beforeEach(() => resetIdCounter());

  it("keeps selection and camera when the note changes elsewhere", () => {
    const { editor, doc } = makeDoc();
    doc.load("- a\n- b\n", true);
    const b = editor.getRoots()[1]!;
    editor.select(b.id);
    editor.setCamera(5, 6, 2);
    doc.load("- a\n  - a1\n- b\n- c\n", false);
    expect(editor.getSelectedId()).toBe(b.id);
    expect(editor.getCamera()).toEqual({ x: 5, y: 6, zoom: 2 });
    expect(rootTexts(editor)).toEqual(["a", "b", "c"]);
    expect(doc.text()).toBe("- a\n  - a1\n- b\n- c\n");
  });

  it("re-maps roots to regions after an external load", () => {
    const { editor, doc } = makeDoc();
    doc.load("- a\n\nprose\n\n- b\n", true);
    doc.load("- a\n- a2\n\nprose\n\n- b\n", false);
    editor.addRoot("new");
    editor.exitEditMode();
    expect(doc.text()).toBe("- a\n- a2\n\nprose\n\n- b\n- new\n");
  });
});

describe("OutlineDocument images", () => {
  beforeEach(() => resetIdCounter());

  it("registers embed targets as assets with unknown size and guesses the mime type", () => {
    const { editor, doc } = makeDoc();
    doc.load("- ![[pic.png]]\n- Caption\\\n  ![[photo.jpg|200]]\n", true);
    expect(editor.getAssets()).toEqual([
      { id: "pic.png", filename: "pic.png", mimeType: "image/png", width: 0, height: 0 },
      { id: "photo.jpg", filename: "photo.jpg", mimeType: "image/jpeg", width: 0, height: 0 },
    ]);
    expect(editor.getImageDisplaySize(editor.getRoots()[0]!.id)).toBeNull();
  });

  it("draws the image once the natural size is known and never changes the note text for it", () => {
    const { editor, doc } = makeDoc();
    const host = fakeHost("- ![[pic.png]]\n");
    doc.attach(host);
    doc.load("- ![[pic.png]]\n", true);
    doc.setImageNaturalSize("pic.png", 800, 600);
    expect(doc.hasNaturalSize("pic.png")).toBe(true);
    expect(editor.getImageDisplaySize(editor.getRoots()[0]!.id)).toEqual({ width: 300, height: 225 });
    expect(doc.text()).toBe("- ![[pic.png]]\n");
    expect(host.requestSave).not.toHaveBeenCalled();
  });

  it("remembers natural sizes across external loads, including sizes learned from pasted assets", () => {
    const { editor, doc } = makeDoc();
    doc.load("- ![[pic.png]]\n", true);
    doc.setImageNaturalSize("pic.png", 800, 600);
    editor.setNodeImage(editor.getRoots()[0]!.id, { id: "new.png", filename: "new.png", mimeType: "image/png", width: 40, height: 20 }, 40, 20);
    doc.load("- ![[pic.png]]\n- ![[new.png]]\n", false);
    expect(editor.getImageDisplaySize(editor.getRoots()[0]!.id)).toEqual({ width: 300, height: 225 });
    expect(editor.getImageDisplaySize(editor.getRoots()[1]!.id)).toEqual({ width: 40, height: 20 });
  });

  it("mimeTypeForName", () => {
    expect(mimeTypeForName("a/b/x.JPG")).toBe("image/jpeg");
    expect(mimeTypeForName("x.webp")).toBe("image/webp");
    expect(mimeTypeForName("x.pdf")).toBe("application/octet-stream");
  });
});

describe("OutlineDocument.clear", () => {
  it("empties the map and the note text", () => {
    const { editor, doc } = makeDoc();
    doc.load(NOTE, true);
    doc.clear();
    expect(editor.getRoots()).toHaveLength(0);
    expect(doc.text()).toBe("");
  });
});

describe("OutlineDocument with a note it cannot round-trip", () => {
  beforeEach(() => resetIdCounter());
  const UNSUPPORTED = "---\nlimn-plugin: true\n---\n- parent\n  1. one\n  2. two\n";

  it("blocks the note and hands back the exact text", () => {
    const { editor, doc } = makeDoc();
    doc.load(UNSUPPORTED, true);
    expect(doc.blockedBy.map((i) => i.line)).toEqual([5, 6]);
    expect(editor.getRoots()).toEqual([]);
    expect(doc.viewData()).toBe(UNSUPPORTED);
  });

  it("never requests a save while blocked", () => {
    const { editor, doc } = makeDoc();
    const host = fakeHost(UNSUPPORTED);
    doc.attach(host);
    doc.load(UNSUPPORTED, true);
    editor.addRoot("typed");
    expect(host.requestSave).not.toHaveBeenCalled();
    expect(doc.viewData()).toBe(UNSUPPORTED);
  });

  it("drops unsaved map edits when an external change makes the note unsupported", () => {
    const { editor, doc } = makeDoc();
    doc.load("- a\n", true);
    editor.addRoot("dirty");
    doc.load(UNSUPPORTED, false);
    expect(doc.blockedBy.length).toBe(2);
    expect(doc.viewData()).toBe(UNSUPPORTED);
  });

  it("unblocks when supported text is loaded", () => {
    const { editor, doc } = makeDoc();
    doc.load(UNSUPPORTED, true);
    doc.load("- a\n", true);
    expect(doc.blockedBy).toEqual([]);
    expect(editor.getRoots()).toHaveLength(1);
  });

  it("unblocks on clear", () => {
    const { doc } = makeDoc();
    doc.load(UNSUPPORTED, true);
    doc.clear();
    expect(doc.blockedBy).toEqual([]);
  });
});

describe("OutlineDocument natural sizes", () => {
  beforeEach(() => resetIdCounter());

  it("forgets natural sizes when a different note is loaded", () => {
    const { doc } = makeDoc();
    doc.load("- a\n  ![[image.png]]\n", true);
    doc.setImageNaturalSize("image.png", 800, 600);
    doc.load("- b\n  ![[image.png]]\n", true);
    expect(doc.hasNaturalSize("image.png")).toBe(false);
  });

  it("keeps natural sizes across an external update of the same note", () => {
    const { doc } = makeDoc();
    doc.load("- a\n  ![[image.png]]\n", true);
    doc.setImageNaturalSize("image.png", 800, 600);
    doc.load("- a2\n  ![[image.png]]\n", false);
    expect(doc.hasNaturalSize("image.png")).toBe(true);
  });
});
