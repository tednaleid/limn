// ABOUTME: Tests for accessibility-related data exposed by Editor.
// ABOUTME: Verifies node depth and other data needed for ARIA attributes.

import { describe, it, expect } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";

describe("accessibility data", () => {
  it("getNodeDepth returns 0 for root nodes", () => {
    const editor = new TestEditor();
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0].id;
    expect(editor.getNodeDepth(rootId)).toBe(0);
  });

  it("getNodeDepth returns 1 for children of root", () => {
    const editor = new TestEditor();
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0].id;
    editor.select(rootId);
    editor.addChild(rootId, "Child");
    editor.exitEditMode();
    const children = editor.getChildren(rootId);
    expect(editor.getNodeDepth(children[0].id)).toBe(1);
  });

  it("getNodeDepth returns 2 for grandchildren", () => {
    const editor = new TestEditor();
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0].id;
    const childId = editor.addChild(rootId, "Child");
    editor.exitEditMode();
    const grandchildId = editor.addChild(childId, "Grandchild");
    editor.exitEditMode();
    expect(editor.getNodeDepth(grandchildId)).toBe(2);
  });

  it("hasVisibleChildren returns true for expanded node with children", () => {
    const editor = new TestEditor();
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0].id;
    editor.addChild(rootId, "Child");
    editor.exitEditMode();
    expect(editor.hasVisibleChildren(rootId)).toBe(true);
  });

  it("hasVisibleChildren returns false for collapsed node", () => {
    const editor = new TestEditor();
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0].id;
    editor.addChild(rootId, "Child");
    editor.exitEditMode();
    editor.toggleCollapse(rootId);
    expect(editor.hasVisibleChildren(rootId)).toBe(false);
  });

  it("hasVisibleChildren returns false for leaf node", () => {
    const editor = new TestEditor();
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0].id;
    expect(editor.hasVisibleChildren(rootId)).toBe(false);
  });
});
