// ABOUTME: Tests for copying a subtree as Markdown and pasting a Markdown list as nodes.
// ABOUTME: Runs on TestEditor with the stub text measurer; no browser.

import { describe, it, expect } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";

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
