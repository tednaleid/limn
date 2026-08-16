// ABOUTME: Tests for reconcileIds, which re-attaches existing ids to a freshly parsed forest.
// ABOUTME: Also covers Editor.applyExternalUpdate with reconciliation keeping selection.

import { describe, test, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { reconcileIds } from "../serialization/reconcile";
import { parseSubtree, outlineToFileNodes } from "../markdown/outline";
import { generateNodeId } from "../store/MindMapStore";
import type { MindMapFileFormat, MindMapFileNode } from "../serialization/schema";

const base: MindMapFileFormat = {
  version: 1,
  meta: { id: "rec", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
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
        { id: "n1", text: "Alpha", x: 250, y: -30, width: 100, height: 32, children: [] },
        {
          id: "n2",
          text: "Beta",
          x: 250,
          y: 30,
          width: 100,
          height: 32,
          children: [{ id: "n3", text: "Beta child", x: 500, y: 30, width: 100, height: 32, children: [] }],
        },
      ],
    },
  ],
  assets: [],
};

function incoming(md: string): MindMapFileNode[] {
  return outlineToFileNodes(parseSubtree(md), generateNodeId);
}

function ids(nodes: MindMapFileNode[]): unknown {
  return nodes.map((n) => ({ id: n.id, text: n.text, children: ids(n.children) }));
}

describe("reconcileIds", () => {
  let editor: TestEditor;

  beforeEach(() => {
    editor = new TestEditor();
    editor.loadJSON(base);
  });

  test("identical structure keeps every id", () => {
    const result = reconcileIds(editor["store"], incoming("- Root\n  - Alpha\n  - Beta\n    - Beta child"));
    expect(ids(result)).toEqual([
      { id: "n0", text: "Root", children: [
        { id: "n1", text: "Alpha", children: [] },
        { id: "n2", text: "Beta", children: [{ id: "n3", text: "Beta child", children: [] }] },
      ] },
    ]);
  });

  test("reordered siblings keep their ids by text", () => {
    const result = reconcileIds(editor["store"], incoming("- Root\n  - Beta\n    - Beta child\n  - Alpha"));
    const root = result[0] as MindMapFileNode;
    expect(root.children.map((c) => [c.id, c.text])).toEqual([["n2", "Beta"], ["n1", "Alpha"]]);
    expect(root.children[0]?.children[0]?.id).toBe("n3");
  });

  test("a renamed node at the same position keeps its id; a new node gets a fresh id", () => {
    const result = reconcileIds(editor["store"], incoming("- Root\n  - Alpha renamed\n  - Beta\n  - Gamma"));
    const root = result[0] as MindMapFileNode;
    expect(root.children[0]?.id).toBe("n1");
    expect(root.children[1]?.id).toBe("n2");
    expect(root.children[2]?.id).toMatch(/^n\d+$/);
    expect(["n0", "n1", "n2", "n3"]).not.toContain(root.children[2]?.id);
  });

  test("a deleted node's id disappears and is not reused", () => {
    const result = reconcileIds(editor["store"], incoming("- Root\n  - Beta"));
    const root = result[0] as MindMapFileNode;
    expect(root.children.map((c) => c.id)).toEqual(["n2"]);
  });

  test("a new root keeps a fresh id; existing roots match by text", () => {
    const result = reconcileIds(editor["store"], incoming("- Brand new\n- Root\n  - Alpha"));
    expect(result[0]?.id).not.toBe("n0");
    expect(result[1]?.id).toBe("n0");
    expect(result[1]?.children[0]?.id).toBe("n1");
  });
});

describe("Editor.applyExternalUpdate with reconcileIds", () => {
  test("selection and edit mode survive when the selected node still exists", () => {
    const editor = new TestEditor();
    editor.loadJSON(base);
    editor.select("n2");
    editor.enterEditMode();
    const data: MindMapFileFormat = { ...base, roots: incoming("- Root\n  - Alpha\n  - Beta\n    - Beta child\n  - Gamma") };
    editor.applyExternalUpdate(data, { reconcileIds: true });
    expect(editor.getSelectedId()).toBe("n2");
    expect(editor.isEditing()).toBe(true);
    expect(editor.getNode("n0").children).toHaveLength(3);
  });

  test("without the option, ids come from the incoming data (existing cross-tab behavior)", () => {
    const editor = new TestEditor();
    editor.loadJSON(base);
    editor.select("n2");
    const data: MindMapFileFormat = { ...base, roots: incoming("- Root\n  - Alpha\n  - Beta") };
    editor.applyExternalUpdate(data);
    expect(editor.getSelectedId()).toBeNull();
  });
});
