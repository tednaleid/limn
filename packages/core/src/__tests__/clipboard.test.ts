// ABOUTME: Tests for copying a subtree as Markdown and pasting a Markdown list as nodes.
// ABOUTME: Runs on TestEditor with the stub text measurer; no browser.

import { describe, it, expect } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { OUTLINE_CAPABILITIES } from "../editor/capabilities";
import type { Asset } from "../model/types";

/** A root "Root" with children "A" (children "A1", "A2") and "B". Returns the ids. */
function sampleMap(editor: TestEditor) {
  const root = editor.addRoot("Root");
  const a = editor.addChild(root, "A");
  const a1 = editor.addChild(a, "A1");
  const a2 = editor.addChild(a, "A2");
  const b = editor.addChild(root, "B");
  editor.exitEditMode();
  return { root, a, a1, a2, b };
}

/** Texts of a node's children, in order. */
function texts(editor: TestEditor, id: string): string[] {
  return editor.getChildren(id).map((n) => n.text);
}

const KNOWN_ASSET: Asset = { id: "known.png", filename: "known.png", mimeType: "image/png", width: 40, height: 30 };

describe("copyMarkdown", () => {
  it("writes the node and its descendants as a nested bullet list", () => {
    const editor = new TestEditor();
    const { a } = sampleMap(editor);
    expect(editor.copyMarkdown(a)).toBe("- A\n  - A1\n  - A2");
  });

  it("writes a leaf as a single bullet", () => {
    const editor = new TestEditor();
    const { b } = sampleMap(editor);
    expect(editor.copyMarkdown(b)).toBe("- B");
  });

  it("writes a root with its whole tree", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    expect(editor.copyMarkdown(root)).toBe("- Root\n  - A\n    - A1\n    - A2\n  - B");
  });

  it("marks a collapsed node with a star and still writes its children", () => {
    const editor = new TestEditor();
    const { a } = sampleMap(editor);
    editor.toggleCollapse(a);
    expect(editor.copyMarkdown(a)).toBe("* A\n  - A1\n  - A2");
  });

  it("writes multi-line text as backslash-continued lines", () => {
    const editor = new TestEditor();
    const root = editor.addRoot("one\ntwo");
    editor.exitEditMode();
    expect(editor.copyMarkdown(root)).toBe("- one\\\n  two");
  });

  it("writes a node's image as an embed with its display size", () => {
    const editor = new TestEditor();
    const root = editor.addRoot("Root");
    editor.exitEditMode();
    editor.setNodeImage(root, KNOWN_ASSET, 40, 30);
    expect(editor.copyMarkdown(root)).toBe("- Root\\\n  ![[known.png|40x30]]");
  });

  it("does not change the document or the undo stack", () => {
    const editor = new TestEditor();
    const { a } = sampleMap(editor);
    const before = JSON.stringify(editor.toJSON());
    const couldUndo = editor.canUndo();
    editor.copyMarkdown(a);
    expect(JSON.stringify(editor.toJSON())).toBe(before);
    expect(editor.canUndo()).toBe(couldUndo);
  });
});

describe("pasteMarkdown", () => {
  const LIST = "- X\n  - X1\n  - X2\n- Y";

  it("adds the list's top-level items as the selected node's last children", () => {
    const editor = new TestEditor();
    const { root, a, b } = sampleMap(editor);
    editor.select(root);
    const pasted = editor.pasteMarkdown(LIST);
    expect(pasted).toHaveLength(2);
    expect(texts(editor, root)).toEqual(["A", "B", "X", "Y"]);
    expect(texts(editor, pasted[0] as string)).toEqual(["X1", "X2"]);
    editor.expectChildren(root, [a, b, ...pasted]);
  });

  it("selects the first pasted node and is not editing", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    const pasted = editor.pasteMarkdown(LIST);
    editor.expectSelected(pasted[0] as string).expectNotEditing();
  });

  it("is one undo step", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    const before = editor.copyMarkdown(root);
    editor.pasteMarkdown(LIST);
    editor.undo();
    expect(editor.copyMarkdown(root)).toBe(before);
    editor.redo();
    expect(texts(editor, root)).toEqual(["A", "B", "X", "Y"]);
  });

  it("expands a collapsed target", () => {
    const editor = new TestEditor();
    const { a } = sampleMap(editor);
    editor.toggleCollapse(a);
    editor.select(a);
    editor.pasteMarkdown("- New");
    editor.expectExpanded(a);
    expect(texts(editor, a)).toEqual(["A1", "A2", "New"]);
  });

  it("makes each top-level item a root when nothing is selected", () => {
    const editor = new TestEditor();
    sampleMap(editor);
    editor.deselect();
    const rootsBefore = editor.getRoots().length;
    const pasted = editor.pasteMarkdown(LIST);
    expect(editor.getRoots().length).toBe(rootsBefore + 2);
    expect(editor.getRoots().map((r) => r.id)).toEqual(expect.arrayContaining(pasted));
  });

  it("stacks each pasted root's tree below the one before", () => {
    const editor = new TestEditor();
    const [x, y] = editor.pasteMarkdown(LIST) as [string, string];
    const xTree = [x, ...editor.getNode(x).children].map((id) => editor.getNode(id));
    const xBottom = Math.max(...xTree.map((n) => n.y + n.height));
    expect(editor.getNode(y).y).toBeGreaterThan(xBottom);
    expect(editor.getNode(y).x).toBe(editor.getNode(x).x);
  });

  it("pastes into an empty map", () => {
    const editor = new TestEditor();
    const pasted = editor.pasteMarkdown(LIST);
    expect(editor.getRoots().map((r) => r.text)).toEqual(["X", "Y"]);
    editor.expectSelected(pasted[0] as string);
  });

  it("pastes text without bullets as one node", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    editor.pasteMarkdown("  just some words\nand more  ");
    expect(texts(editor, root)).toEqual(["A", "B", "just some words\nand more"]);
  });

  it("pastes nothing and records no undo step for blank text", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    const version = JSON.stringify(editor.toJSON());
    editor.undo();
    const afterOneUndo = JSON.stringify(editor.toJSON());
    editor.redo();
    expect(editor.pasteMarkdown("  \n ")).toEqual([]);
    expect(JSON.stringify(editor.toJSON())).toBe(version);
    editor.undo();
    expect(JSON.stringify(editor.toJSON())).toBe(afterOneUndo);
  });

  it("keeps the bullets and drops the text around them", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    editor.pasteMarkdown("# Heading\n\nSome prose.\n\n- X\n- Y\n\nMore prose.\n\n- Z");
    expect(texts(editor, root)).toEqual(["A", "B", "X", "Y", "Z"]);
  });

  it("accepts a list whose every line is indented, and tab indents", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    const pasted = editor.pasteMarkdown("    - X\n    \t- X1\n    - Y");
    expect(texts(editor, root)).toEqual(["A", "B", "X", "Y"]);
    expect(texts(editor, pasted[0] as string)).toEqual(["X1"]);
  });

  it("carries collapse markers", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    const pasted = editor.pasteMarkdown("* X\n  - X1");
    editor.expectCollapsed(pasted[0] as string);
  });

  it("round-trips a copied subtree", () => {
    const editor = new TestEditor();
    const { a, b } = sampleMap(editor);
    const copied = editor.copyMarkdown(a);
    editor.select(b);
    const pasted = editor.pasteMarkdown(copied);
    expect(editor.copyMarkdown(pasted[0] as string)).toBe(copied);
  });

  it("gives pasted nodes positions that do not overlap their siblings", () => {
    const editor = new TestEditor();
    const { root } = sampleMap(editor);
    editor.select(root);
    editor.pasteMarkdown(LIST);
    const kids = editor.getNode(root).children.map((id) => editor.getNode(id));
    const sameSide = kids.filter((k) => k.x > editor.getNode(root).x).sort((p, q) => p.y - q.y);
    for (let i = 1; i < sameSide.length; i++) {
      const prev = sameSide[i - 1]!;
      expect(sameSide[i]!.y).toBeGreaterThanOrEqual(prev.y + prev.height);
    }
  });

  it("puts pasted children on the right in a document without sides", () => {
    const editor = new TestEditor();
    editor.setCapabilities(OUTLINE_CAPABILITIES);
    const root = editor.addRoot("Root");
    editor.exitEditMode();
    editor.select(root);
    const pasted = editor.pasteMarkdown(LIST);
    for (const id of pasted) expect(editor.getNode(id).x).toBeGreaterThan(editor.getNode(root).x);
  });

  it("keeps an image whose asset the document has, and drops one it does not", () => {
    const editor = new TestEditor();
    const root = editor.addRoot("Root");
    editor.exitEditMode();
    editor.setNodeImage(root, KNOWN_ASSET, 40, 30);
    editor.select(root);
    const pasted = editor.pasteMarkdown("- has\\\n  ![[known.png|40x30]]\n- lost\\\n  ![[unknown.png|40x30]]");
    expect(editor.getNode(pasted[0] as string).image?.assetId).toBe("known.png");
    expect(editor.getNode(pasted[1] as string).image).toBeUndefined();
    expect(editor.getNode(pasted[1] as string).text).toBe("lost");
  });

  it("keeps the image of a node that was copied and then deleted", () => {
    const editor = new TestEditor();
    const { a, b } = sampleMap(editor);
    editor.setNodeImage(b, KNOWN_ASSET, 40, 30);
    const copied = editor.copyMarkdown(b);
    editor.deleteNode(b);
    editor.select(a);
    const pasted = editor.pasteMarkdown(copied);
    expect(editor.getNode(pasted[0] as string).image).toEqual({ assetId: "known.png", width: 40, height: 30 });
  });
});
