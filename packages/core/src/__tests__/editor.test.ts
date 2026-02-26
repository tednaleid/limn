import { describe, test, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import type { MindMapFileFormat } from "../serialization/schema";

const sampleMap: MindMapFileFormat = {
  version: 1,
  meta: { id: "test", theme: "default" },
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
        {
          id: "n1",
          text: "Child 1",
          x: 250,
          y: -30,
          width: 100,
          height: 32,
          children: [
            {
              id: "n3",
              text: "Grandchild",
              x: 500,
              y: -30,
              width: 100,
              height: 32,
              children: [],
            },
          ],
        },
        {
          id: "n2",
          text: "Child 2",
          x: 250,
          y: 30,
          width: 100,
          height: 32,
          children: [],
        },
      ],
    },
  ],
  assets: [],
};

describe("Editor", () => {
  let editor: TestEditor;

  beforeEach(() => {
    editor = new TestEditor();
    editor.loadJSON(sampleMap);
  });

  describe("selection", () => {
    test("starts with nothing selected", () => {
      expect(editor.getSelectedId()).toBeNull();
    });

    test("can select a node", () => {
      editor.select("n0");
      editor.expectSelected("n0");
    });

    test("can deselect", () => {
      editor.select("n0");
      editor.deselect();
      expect(editor.getSelectedId()).toBeNull();
    });
  });

  describe("edit mode", () => {
    test("starts in nav mode", () => {
      editor.expectNotEditing();
    });

    test("can enter edit mode on selected node", () => {
      editor.select("n0");
      editor.enterEditMode();
      editor.expectEditing("n0");
    });

    test("can exit edit mode", () => {
      editor.select("n0");
      editor.enterEditMode();
      editor.exitEditMode();
      editor.expectNotEditing();
      editor.expectSelected("n0");
    });

    test("enterEditMode is no-op when nothing selected", () => {
      editor.enterEditMode();
      editor.expectNotEditing();
    });
  });

  describe("addChild", () => {
    test("creates a child node with empty text", () => {
      const childId = editor.addChild("n0");
      expect(editor.getNode(childId).text).toBe("");
      expect(editor.getNode(childId).parentId).toBe("n0");
    });

    test("positions child to the right of parent", () => {
      const childId = editor.addChild("n2");
      const child = editor.getNode(childId);
      const parent = editor.getNode("n2");
      expect(child.x).toBeGreaterThan(parent.x);
    });

    test("auto-selects the new child", () => {
      const childId = editor.addChild("n0");
      editor.expectSelected(childId);
    });

    test("enters edit mode on the new child", () => {
      const childId = editor.addChild("n0");
      editor.expectEditing(childId);
    });
  });

  describe("deleteNode", () => {
    test("removes node and selects nearest sibling", () => {
      editor.select("n2");
      editor.deleteNode("n2");
      editor.expectSelected("n1");
    });

    test("selects parent when no siblings remain", () => {
      editor.select("n3");
      editor.deleteNode("n3");
      editor.expectSelected("n1");
    });

    test("deselects when canvas becomes empty", () => {
      editor.select("n0");
      editor.deleteNode("n0");
      expect(editor.getSelectedId()).toBeNull();
      editor.expectNodeCount(0);
    });
  });

  describe("undo/redo", () => {
    test("undo reverses addChild", () => {
      editor.expectNodeCount(4);
      editor.addChild("n0");
      editor.expectNodeCount(5);
      editor.undo();
      editor.expectNodeCount(4);
    });

    test("redo reapplies addChild", () => {
      editor.addChild("n0");
      editor.undo();
      editor.redo();
      editor.expectNodeCount(5);
    });

    test("undo reverses deleteNode", () => {
      editor.select("n2");
      editor.deleteNode("n2");
      editor.expectNodeCount(3);
      editor.undo();
      editor.expectNodeCount(4);
    });

    test("undo reverses setText", () => {
      editor.setText("n0", "Changed");
      expect(editor.getNode("n0").text).toBe("Changed");
      editor.undo();
      editor.expectText("n0", "Root");
    });

    test("multiple undos in sequence", () => {
      editor.addChild("n0");
      editor.addChild("n1");
      editor.expectNodeCount(6);
      editor.undo();
      editor.expectNodeCount(5);
      editor.undo();
      editor.expectNodeCount(4);
    });

    test("redo is cleared when a new mutation occurs after undo", () => {
      editor.addChild("n0");
      editor.undo();
      editor.addChild("n1");
      editor.redo(); // Should be a no-op
      editor.expectNodeCount(5);
    });
  });

  describe("keyboard dispatch (via TestEditor)", () => {
    test("Tab creates a child node and enters edit mode", () => {
      editor.select("n1");
      editor.pressKey("Tab");
      const selectedId = editor.getSelectedId();
      expect(selectedId).not.toBeNull();
      expect(selectedId).not.toBe("n1");
      editor.expectEditing(selectedId!);
      editor.expectChildren("n1", ["n3", selectedId!]);
    });

    test("Enter enters edit mode on selected node", () => {
      editor.select("n0");
      editor.pressKey("Enter");
      editor.expectEditing("n0");
    });

    test("Enter with nothing selected creates a new root", () => {
      editor.deselect();
      editor.pressKey("Enter");
      const selectedId = editor.getSelectedId();
      expect(selectedId).not.toBeNull();
      expect(editor.getNode(selectedId!).parentId).toBeNull();
      editor.expectEditing(selectedId!);
      editor.expectNodeCount(5);
    });

    test("Escape exits edit mode", () => {
      editor.select("n0");
      editor.pressKey("Enter");
      editor.expectEditing("n0");
      editor.pressKey("Escape");
      editor.expectNotEditing();
      editor.expectSelected("n0");
    });

    test("Escape deselects in nav mode", () => {
      editor.select("n0");
      editor.pressKey("Escape");
      expect(editor.getSelectedId()).toBeNull();
    });

    test("Backspace deletes selected node in nav mode", () => {
      editor.select("n2");
      editor.pressKey("Backspace");
      editor.expectNodeCount(3);
      editor.expectSelected("n1");
    });

    test("Space toggles collapse", () => {
      editor.select("n1");
      editor.pressKey(" ");
      editor.expectCollapsed("n1");
      editor.pressKey(" ");
      editor.expectExpanded("n1");
    });

    test("Cmd+Z undoes", () => {
      editor.select("n1");
      editor.pressKey("Tab");
      editor.expectNodeCount(5);
      editor.pressKey("Escape"); // exit edit mode
      editor.pressKey("z", { meta: true });
      editor.expectNodeCount(4);
    });

    test("Shift+Cmd+Z redoes", () => {
      editor.select("n1");
      editor.pressKey("Tab");
      const childId = editor.getSelectedId()!;
      editor.setText(childId, "keep me"); // Prevent empty node cleanup
      editor.pressKey("Escape");
      editor.expectNodeCount(5);
      editor.pressKey("z", { meta: true }); // undo setText
      editor.pressKey("z", { meta: true }); // undo addChild
      editor.expectNodeCount(4);
      editor.pressKey("z", { meta: true, shift: true }); // redo addChild
      editor.expectNodeCount(5);
    });

    test("Shift+Enter creates sibling in nav mode", () => {
      editor.select("n1");
      editor.pressKey("Enter", { shift: true });
      const selectedId = editor.getSelectedId();
      expect(selectedId).not.toBeNull();
      expect(editor.getNode(selectedId!).parentId).toBe("n0");
      editor.expectEditing(selectedId!);
    });

    test("Shift+Enter is no-op on root in nav mode", () => {
      editor.select("n0");
      editor.pressKey("Enter", { shift: true });
      editor.expectSelected("n0");
      editor.expectNodeCount(4);
    });

    test("Enter in edit mode creates sibling", () => {
      editor.select("n1");
      editor.enterEditMode();
      editor.pressKey("Enter");
      const selectedId = editor.getSelectedId();
      expect(selectedId).not.toBe("n1");
      expect(editor.getNode(selectedId!).parentId).toBe("n0");
      editor.expectEditing(selectedId!);
    });

    test("Enter in edit mode on root just exits edit mode", () => {
      editor.select("n0");
      editor.enterEditMode();
      editor.pressKey("Enter");
      editor.expectNotEditing();
      editor.expectSelected("n0");
      editor.expectNodeCount(4);
    });

    test("Tab in edit mode creates child", () => {
      editor.select("n2");
      editor.enterEditMode();
      editor.pressKey("Tab");
      const selectedId = editor.getSelectedId();
      expect(editor.getNode(selectedId!).parentId).toBe("n2");
      editor.expectEditing(selectedId!);
    });

    test("Cmd+Up reorders node up", () => {
      editor.select("n2");
      editor.pressKey("ArrowUp", { meta: true });
      editor.expectChildren("n0", ["n2", "n1"]);
    });

    test("Cmd+Down reorders node down", () => {
      editor.select("n1");
      editor.pressKey("ArrowDown", { meta: true });
      editor.expectChildren("n0", ["n2", "n1"]);
    });
  });

  describe("empty node cleanup", () => {
    test("Escape on empty node deletes it", () => {
      editor.select("n0");
      const childId = editor.addChild("n0");
      // Node has empty text, we're in edit mode
      editor.expectEditing(childId);
      editor.pressKey("Escape");
      // Empty node should be deleted
      editor.expectNodeCount(4);
      // Selection should fall back
      editor.expectNotEditing();
    });

    test("Escape on non-empty node keeps it", () => {
      editor.select("n0");
      editor.pressKey("Enter"); // enter edit mode
      editor.pressKey("Escape"); // exit edit mode
      editor.expectNodeCount(4);
      editor.expectSelected("n0");
    });
  });

  describe("setText", () => {
    test("updates node text", () => {
      editor.setText("n0", "Updated Root");
      editor.expectText("n0", "Updated Root");
    });
  });

  describe("toggleCollapse", () => {
    test("collapses and expands", () => {
      editor.toggleCollapse("n1");
      editor.expectCollapsed("n1");
      editor.toggleCollapse("n1");
      editor.expectExpanded("n1");
    });
  });

  describe("toJSON", () => {
    test("preserves camera position", () => {
      editor.setCamera(100, 200, 1.5);
      const data = editor.toJSON();
      expect(data.camera).toEqual({ x: 100, y: 200, zoom: 1.5 });
    });

    test("preserves camera through load and save round-trip", () => {
      const fileWithCamera: MindMapFileFormat = {
        ...sampleMap,
        camera: { x: 50, y: -75, zoom: 0.8 },
      };
      editor.loadJSON(fileWithCamera);
      const data = editor.toJSON();
      expect(data.camera).toEqual({ x: 50, y: -75, zoom: 0.8 });
    });
  });
});
