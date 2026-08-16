// ABOUTME: Tests for the canonical whole-document layout used by outline-backed documents.
// ABOUTME: Covers determinism, root stacking, collapsed subtrees, and snap-back under OUTLINE_CAPABILITIES.

import { describe, test, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { OUTLINE_CAPABILITIES } from "../editor/capabilities";
import { TREE_PADDING, treeBoundingBox } from "../layout/layout";
import type { MindMapFileFormat } from "../serialization/schema";

/** Two roots; the first has a left-side child, a right-side child, and a collapsed child with a hidden grandchild. */
const scattered: MindMapFileFormat = {
  version: 1,
  meta: { id: "layout", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
  camera: { x: 0, y: 0, zoom: 1 },
  roots: [
    {
      id: "n0",
      text: "Root A",
      x: 300,
      y: 500,
      width: 100,
      height: 32,
      children: [
        { id: "n1", text: "Left child", x: -100, y: 400, width: 100, height: 32, children: [] },
        { id: "n2", text: "Right child", x: 700, y: 650, width: 100, height: 32, children: [] },
        {
          id: "n3",
          text: "Collapsed",
          x: 700,
          y: 700,
          width: 100,
          height: 32,
          collapsed: true,
          children: [{ id: "n4", text: "Hidden", x: 0, y: 0, width: 100, height: 32, children: [] }],
        },
      ],
    },
    { id: "n5", text: "Root B", x: -400, y: -900, width: 100, height: 32, children: [] },
  ],
  assets: [],
};

function positions(editor: TestEditor): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const root of editor.getRoots()) {
    const visit = (id: string) => {
      const n = editor.getNode(id);
      out[id] = [n.x, n.y];
      for (const c of n.children) visit(c);
    };
    visit(root.id);
  }
  return out;
}

describe("relayoutAll", () => {
  let editor: TestEditor;

  beforeEach(() => {
    editor = new TestEditor();
    editor.loadJSON(scattered);
  });

  test("puts every child to the right of its parent and every root at x = 0", () => {
    editor.relayoutAll();
    for (const id of ["n1", "n2", "n3"]) {
      expect(editor.getNode(id).x).toBeGreaterThan(editor.getNode("n0").x + editor.getNode("n0").width);
    }
    expect(editor.getNode("n0").x).toBe(0);
    expect(editor.getNode("n5").x).toBe(0);
  });

  test("siblings are stacked top to bottom in array order", () => {
    editor.relayoutAll();
    expect(editor.getNode("n1").y).toBeLessThan(editor.getNode("n2").y);
    expect(editor.getNode("n2").y).toBeLessThan(editor.getNode("n3").y);
  });

  test("roots are stacked in root order with TREE_PADDING between visible bounding boxes", () => {
    editor.relayoutAll();
    expect(editor.getNode("n0").y).toBe(0);
    const store = editor["store"];
    const boxA = treeBoundingBox(store, "n0");
    const boxB = treeBoundingBox(store, "n5");
    expect(boxB.minY).toBeCloseTo(boxA.maxY + TREE_PADDING, 6);
  });

  test("hidden children of a collapsed node are still positioned to the right of their parent", () => {
    editor.relayoutAll();
    expect(editor.getNode("n4").x).toBeGreaterThan(editor.getNode("n3").x);
    expect(editor.getNode("n3").collapsed).toBe(true);
  });

  test("is idempotent", () => {
    editor.relayoutAll();
    const once = positions(editor);
    editor.relayoutAll();
    expect(positions(editor)).toEqual(once);
  });

  describe("under OUTLINE_CAPABILITIES", () => {
    beforeEach(() => {
      editor.setCapabilities(OUTLINE_CAPABILITIES);
    });

    test("setting the capabilities lays the document out canonically", () => {
      const canonical = positions(editor);
      const fresh = new TestEditor();
      fresh.loadJSON(scattered);
      fresh.relayoutAll();
      expect(canonical).toEqual(positions(fresh));
    });

    test("a drag that neither reorders nor reparents snaps back on release", () => {
      const before = positions(editor);
      const n2 = editor.getNode("n2");
      editor.pointerDown("n2", n2.x + 10, n2.y + 10);
      editor.pointerMove(n2.x + 15, n2.y + 12);
      expect(editor.getNode("n2").x).not.toBe(before["n2"]?.[0]);
      editor.pointerUp();
      expect(positions(editor)).toEqual(before);
    });

    test("structural changes keep the layout canonical", () => {
      editor.addChild("n2", "new");
      editor.exitEditMode();
      const after = positions(editor);
      const fresh = new TestEditor();
      fresh.loadJSON(editor.toJSON());
      fresh.relayoutAll();
      expect(after).toEqual(positions(fresh));
    });

    test("undo returns to the canonical layout of the previous structure", () => {
      const before = positions(editor);
      editor.addChild("n0", "temp");
      editor.exitEditMode();
      editor.undo();
      expect(positions(editor)).toEqual(before);
    });
  });
});
