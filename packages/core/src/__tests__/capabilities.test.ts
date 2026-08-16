// ABOUTME: Tests for DocumentCapabilities enforcement in the Editor.
// ABOUTME: Blocked actions leave the document unchanged; allowed ones behave as usual.

import { describe, test, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { FULL_CAPABILITIES, OUTLINE_CAPABILITIES } from "../editor/capabilities";
import type { MindMapFileFormat } from "../serialization/schema";

const sampleMap: MindMapFileFormat = {
  version: 1,
  meta: { id: "caps", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
  camera: { x: 0, y: 0, zoom: 1 },
  roots: [
    {
      id: "n0",
      text: "Root",
      x: 0,
      y: 0,
      width: 100,
      height: 32,
      children: [
        { id: "n1", text: "Child 1", x: 250, y: -30, width: 100, height: 32, children: [] },
        { id: "n2", text: "Child 2", x: 250, y: 30, width: 100, height: 32, children: [] },
      ],
    },
  ],
  assets: [],
};

function snapshot(editor: TestEditor): string {
  return JSON.stringify(editor.toJSON().roots);
}

describe("DocumentCapabilities", () => {
  let editor: TestEditor;

  beforeEach(() => {
    editor = new TestEditor();
    editor.loadJSON(sampleMap);
  });

  test("defaults to FULL_CAPABILITIES and setCapabilities replaces the set", () => {
    expect(editor.getCapabilities()).toEqual(FULL_CAPABILITIES);
    editor.setCapabilities(OUTLINE_CAPABILITIES);
    expect(editor.getCapabilities()).toEqual(OUTLINE_CAPABILITIES);
    expect(editor.getCapabilities().freePosition).toBe(false);
  });

  describe("with OUTLINE_CAPABILITIES", () => {
    beforeEach(() => {
      editor.setCapabilities(OUTLINE_CAPABILITIES);
    });

    test("nudgeNode and setNodePosition do nothing and add no undo entry", () => {
      const before = snapshot(editor);
      editor.nudgeNode("n1", 20, 20);
      editor.setNodePosition("n1", 999, 999);
      expect(snapshot(editor)).toBe(before);
      expect(editor.canUndo()).toBe(false);
    });

    test("width resize by keyboard and by handle does nothing", () => {
      const before = snapshot(editor);
      editor.resizeNode("n1", 40);
      editor.startWidthResize("n1");
      expect(editor.isResizingWidth()).toBe(false);
      editor.updateWidthResize(300);
      editor.endWidthResize();
      expect(snapshot(editor)).toBe(before);
      expect(editor.getNode("n1").widthConstrained).toBe(false);
      expect(editor.canUndo()).toBe(false);
    });

    test("image resize still works because images map to an embed width", () => {
      editor.setNodeImage("n1", { id: "pic.png", filename: "pic.png", mimeType: "image/png", width: 400, height: 200 }, 200, 100);
      editor.resizeNode("n1", 20);
      expect(editor.getNode("n1").image?.width).toBe(220);
      expect(editor.getNode("n1").image?.height).toBe(110);
    });

    test("color cycling and setNodeColorIndex do nothing", () => {
      const before = snapshot(editor);
      editor.cycleNodeColor("n1", 1);
      editor.setNodeColorIndex("n1", 5);
      expect(snapshot(editor)).toBe(before);
      expect(editor.canUndo()).toBe(false);
    });

    test("addChild ignores a left-side hint: the child lands to the right of the root", () => {
      const id = editor.addChild("n0", "left?", -1);
      expect(editor.getNode(id).x).toBeGreaterThan(editor.getNode("n0").x);
    });

    test("Alt+Left on a root child (side flip) does nothing", () => {
      editor.select("n1");
      const before = snapshot(editor);
      editor.moveNode("n1", "left");
      expect(snapshot(editor)).toBe(before);
    });

    test("structural actions still work: add sibling, indent, delete, undo", () => {
      editor.select("n1");
      const sib = editor.addSibling("n1", "Child 1b");
      expect(sib).not.toBeNull();
      editor.exitEditMode();
      editor.moveNode(sib as string, "right");
      expect(editor.getNode(sib as string).parentId).toBe("n1");
      editor.deleteNode(sib as string);
      expect(editor.getNode("n1").children).toEqual([]);
      editor.undo();
      expect(editor.getNode("n1").children).toHaveLength(1);
    });
  });

  test("with FULL_CAPABILITIES the same presentation actions do change the document", () => {
    const before = snapshot(editor);
    editor.nudgeNode("n1", 20, 20);
    expect(snapshot(editor)).not.toBe(before);
    editor.cycleNodeColor("n2", 1);
    expect(editor.getNode("n2").style?.colorIndex).toBeDefined();
    editor.startWidthResize("n2");
    expect(editor.isResizingWidth()).toBe(true);
    editor.endWidthResize();
  });
});
