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

    test("Tab on empty node does not create child of deleted node", () => {
      editor.select("n0");
      const childId = editor.addChild("n0");
      editor.expectEditing(childId);
      // Tab on empty node: should exit edit (delete empty node), not crash
      editor.pressKey("Tab");
      editor.expectNodeCount(4);
      editor.expectNotEditing();
    });

    test("Enter on empty node does not create sibling of deleted node", () => {
      editor.select("n1");
      const childId = editor.addChild("n1");
      editor.expectEditing(childId);
      // Enter on empty node: should exit edit (delete empty node), not crash
      editor.pressKey("Enter");
      editor.expectNodeCount(4);
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

    test("consecutive setText calls produce single undo entry", () => {
      editor.setText("n0", "H");
      editor.setText("n0", "He");
      editor.setText("n0", "Hel");
      editor.setText("n0", "Hell");
      editor.setText("n0", "Hello");
      editor.expectText("n0", "Hello");
      editor.undo();
      editor.expectText("n0", "Root");
    });

    test("setText on different node breaks squash", () => {
      editor.setText("n0", "Changed Root");
      editor.setText("n1", "Changed Child");
      editor.undo();
      editor.expectText("n1", "Child 1");
      editor.expectText("n0", "Changed Root");
    });

    test("non-setText mutation breaks squash", () => {
      editor.setText("n0", "Changed");
      editor.addChild("n0");
      editor.undo(); // undo addChild
      editor.undo(); // undo setText
      editor.expectText("n0", "Root");
    });

    test("updates node dimensions via text measurer", () => {
      // n0 is root → fontSize 16, charWidth=9, lineHeight=23, paddingY=7
      editor.setText("n0", "A much longer text string for testing");
      const node = editor.getNode("n0");
      // 37 chars → 37 * 9 + 16 = 349
      expect(node.width).toBe(349);
      expect(node.height).toBe(37); // 1 line * 23 + 7*2
    });

    test("updates dimensions for multi-line text", () => {
      editor.setText("n0", "Line 1\nLine 2\nLine 3");
      const node = editor.getNode("n0");
      // n0 is root → 3 lines * 23 + 7*2 = 83
      expect(node.height).toBe(83);
    });
  });

  describe("toggleCollapse", () => {
    test("collapses and expands", () => {
      editor.toggleCollapse("n1");
      editor.expectCollapsed("n1");
      editor.toggleCollapse("n1");
      editor.expectExpanded("n1");
    });

    test("Tab on collapsed node expands parent and creates visible child", () => {
      editor.select("n1");
      editor.toggleCollapse("n1");
      editor.expectCollapsed("n1");

      // Tab creates a child -- parent should auto-expand
      editor.pressKey("Tab");

      editor.expectExpanded("n1");
      const childId = editor.getSelectedId()!;
      expect(childId).not.toBe("n1");
      editor.expectEditing(childId);

      // New child should be in visible nodes (not hidden by collapsed parent)
      const visible = editor.getVisibleNodes();
      expect(visible.some((n) => n.id === childId)).toBe(true);
    });
  });

  describe("zoom", () => {
    test("zoomIn increases zoom level", () => {
      editor.setCamera(0, 0, 1);
      editor.zoomIn();
      expect(editor.getCamera().zoom).toBeGreaterThan(1);
    });

    test("zoomOut decreases zoom level", () => {
      editor.setCamera(0, 0, 1);
      editor.zoomOut();
      expect(editor.getCamera().zoom).toBeLessThan(1);
    });

    test("zoomToFit fits all nodes in viewport", () => {
      editor.setCamera(999, 999, 5);
      editor.zoomToFit(800, 600);
      const cam = editor.getCamera();
      // Should have changed from the extreme values
      expect(cam.x).not.toBe(999);
      expect(cam.y).not.toBe(999);
      expect(cam.zoom).not.toBe(5);
      // Zoom should be reasonable (not clamped to extremes)
      expect(cam.zoom).toBeGreaterThan(0);
      expect(cam.zoom).toBeLessThanOrEqual(3);
    });

    test("zoomToNode centers on the given node", () => {
      editor.setCamera(0, 0, 1);
      editor.zoomToNode("n3", 800, 600);
      const cam = editor.getCamera();
      const node = editor.getNode("n3");
      // Node center should be near viewport center
      const screenX = node.x * cam.zoom + cam.x + (node.width * cam.zoom) / 2;
      const screenY = node.y * cam.zoom + cam.y + (node.height * cam.zoom) / 2;
      expect(Math.abs(screenX - 400)).toBeLessThan(1);
      expect(Math.abs(screenY - 300)).toBeLessThan(1);
    });

    test("Cmd+= dispatches zoomIn", () => {
      editor.setCamera(0, 0, 1);
      editor.pressKey("=", { meta: true });
      expect(editor.getCamera().zoom).toBeGreaterThan(1);
    });

    test("Cmd+- dispatches zoomOut", () => {
      editor.setCamera(0, 0, 1);
      editor.pressKey("-", { meta: true });
      expect(editor.getCamera().zoom).toBeLessThan(1);
    });
  });

  describe("canvas pan via keyboard", () => {
    test("Shift+ArrowRight pans canvas right", () => {
      editor.setCamera(0, 0, 1);
      editor.pressKey("ArrowRight", { shift: true });
      expect(editor.getCamera().x).toBeLessThan(0);
    });

    test("Shift+ArrowLeft pans canvas left", () => {
      editor.setCamera(0, 0, 1);
      editor.pressKey("ArrowLeft", { shift: true });
      expect(editor.getCamera().x).toBeGreaterThan(0);
    });

    test("Shift+ArrowDown pans canvas down", () => {
      editor.setCamera(0, 0, 1);
      editor.pressKey("ArrowDown", { shift: true });
      expect(editor.getCamera().y).toBeLessThan(0);
    });

    test("Shift+ArrowUp pans canvas up", () => {
      editor.setCamera(0, 0, 1);
      editor.pressKey("ArrowUp", { shift: true });
      expect(editor.getCamera().y).toBeGreaterThan(0);
    });
  });

  describe("viewport following", () => {
    test("addChild scrolls to keep new node visible", () => {
      // Set up a viewport where n0's child would be off-screen to the right
      editor.setViewportSize(800, 600);
      // Camera at (0,0) zoom 1: viewport shows world x=[0,800], y=[0,600]
      // n0 is at (0,0). A child at x=250 is on-screen. But if we pan left so
      // n0 is at the right edge, a child would be off-screen.
      editor.setCamera(700, 300, 1); // n0 at screen x=700
      const childId = editor.addChild("n0");
      const child = editor.getNode(childId);
      const cam = editor.getCamera();
      // The child should be visible: its screen position should be within viewport
      const screenX = child.x * cam.zoom + cam.x;
      expect(screenX).toBeGreaterThanOrEqual(0);
      expect(screenX + child.width * cam.zoom).toBeLessThanOrEqual(800);
    });

    test("addSibling scrolls to keep new sibling visible", () => {
      editor.setViewportSize(800, 600);
      // Pan so n2 is near the bottom edge; a new sibling below it would be off-screen
      editor.setCamera(0, -50, 1); // n2 at y=30 → screen y = 30 + (-50) = -20 ...
      // Let's make it so sibling would be below viewport
      // n2 is at y=30, height=32. Sibling below would be at y~82.
      // Camera with y = -500: screen y of sibling = 82 + (-500) = -418, off top
      // Better: camera.y = 300, viewport [0,600] in screen, world y = (screenY - 300)/1
      // n2 at world y=30, screen y = 30 + 300 = 330. Good.
      // Sibling at world y~82, screen y = 82 + 300 = 382. Still on-screen.
      // Let's use zoom to push things off: zoom=2, n2 at screen y=30*2+300=360
      // Sibling at world y~82, screen y = 82*2+300 = 464. Still on-screen.
      // Simplest: set camera so the sibling's position would be past viewport bottom
      editor.setCamera(0, 0, 1); // viewport shows world y=[0,600]
      // n2 is at y=30. If we force it down...
      // Actually, with default positions, siblings stay on-screen. Let me create a deeper tree.
      // Just verify that ensureNodeVisible is called (functional test):
      // Move n2 very far down so its sibling would be off-screen
      editor.setNodePosition("n2", 250, 800);
      editor.setCamera(0, 0, 1); // viewport shows world y=[0,600]
      editor.select("n2");
      editor.exitEditMode();
      const sibId = editor.addSibling("n2");
      expect(sibId).not.toBeNull();
      const sib = editor.getNode(sibId!);
      const cam = editor.getCamera();
      const screenY = sib.y * cam.zoom + cam.y;
      // Should have scrolled so sibling is visible
      expect(screenY).toBeGreaterThanOrEqual(-sib.height);
      expect(screenY).toBeLessThanOrEqual(600);
    });

    test("does not scroll when new node is already visible", () => {
      editor.setViewportSize(800, 600);
      editor.setCamera(400, 300, 1); // n0 at screen (400,300), well within viewport
      const camBefore = { ...editor.getCamera() };
      editor.addChild("n0");
      // Child at world x=250, screen x = 250 + 400 = 650. On-screen.
      // Camera should not have changed (or changed minimally for the child)
      const camAfter = editor.getCamera();
      // At minimum, x shouldn't have jumped dramatically
      expect(Math.abs(camAfter.x - camBefore.x)).toBeLessThan(100);
    });
  });

  describe("toMarkdown", () => {
    test("exports markdown outline from current state", () => {
      const md = editor.toMarkdown();
      expect(md).toContain("# Root");
      expect(md).toContain("## Child 1");
      expect(md).toContain("## Child 2");
      expect(md).toContain("- Grandchild");
    });
  });

  describe("detachToRoot", () => {
    test("Shift+Tab on child detaches it to a root", () => {
      editor.select("n1");
      expect(editor.getNode("n1").parentId).toBe("n0");

      editor.pressKey("Tab", { shift: true });

      expect(editor.getNode("n1").parentId).toBeNull();
      expect(editor.getRoots().map((r) => r.id)).toContain("n1");
    });

    test("Shift+Tab on root is a no-op", () => {
      editor.select("n0");
      const rootsBefore = editor.getRoots().length;

      editor.pressKey("Tab", { shift: true });

      expect(editor.getRoots().length).toBe(rootsBefore);
      expect(editor.getNode("n0").parentId).toBeNull();
    });

    test("detachToRoot preserves children", () => {
      editor.select("n1");
      const childrenBefore = [...editor.getNode("n1").children];

      editor.pressKey("Tab", { shift: true });

      expect(editor.getNode("n1").children).toEqual(childrenBefore);
    });

    test("detachToRoot is undoable", () => {
      editor.select("n1");
      const parentBefore = editor.getNode("n1").parentId;

      editor.pressKey("Tab", { shift: true });
      expect(editor.getNode("n1").parentId).toBeNull();

      editor.undo();
      expect(editor.getNode("n1").parentId).toBe(parentBefore);
    });
  });

  describe("vim-style hjkl navigation", () => {
    test("h navigates left (same as ArrowLeft)", () => {
      editor.select("n1");
      editor.pressKey("h");
      expect(editor.getSelectedId()).toBe("n0");
    });

    test("l navigates right (same as ArrowRight)", () => {
      editor.select("n1");
      editor.pressKey("l");
      expect(editor.getSelectedId()).toBe("n3");
    });

    test("j navigates down (same as ArrowDown)", () => {
      editor.select("n1");
      editor.pressKey("j");
      expect(editor.getSelectedId()).toBe("n2");
    });

    test("k navigates up (same as ArrowUp)", () => {
      editor.select("n2");
      editor.pressKey("k");
      expect(editor.getSelectedId()).toBe("n1");
    });

    test("Shift+l pans canvas right", () => {
      editor.setCamera(0, 0, 1);
      editor.pressKey("l", { shift: true });
      expect(editor.getCamera().x).toBeLessThan(0);
    });

    test("Shift+h pans canvas left", () => {
      editor.setCamera(0, 0, 1);
      editor.pressKey("h", { shift: true });
      expect(editor.getCamera().x).toBeGreaterThan(0);
    });

    test("Shift+j pans canvas down", () => {
      editor.setCamera(0, 0, 1);
      editor.pressKey("j", { shift: true });
      expect(editor.getCamera().y).toBeLessThan(0);
    });

    test("Shift+k pans canvas up", () => {
      editor.setCamera(0, 0, 1);
      editor.pressKey("k", { shift: true });
      expect(editor.getCamera().y).toBeGreaterThan(0);
    });

    test("Cmd+j reorders node down", () => {
      editor.select("n1");
      editor.pressKey("j", { meta: true });
      editor.expectChildren("n0", ["n2", "n1"]);
    });

    test("Cmd+k reorders node up", () => {
      editor.select("n2");
      editor.pressKey("k", { meta: true });
      editor.expectChildren("n0", ["n2", "n1"]);
    });
  });

  describe("importRoots", () => {
    const importData: MindMapFileFormat = {
      version: 1,
      meta: { id: "imported", theme: "default" },
      camera: { x: 0, y: 0, zoom: 1 },
      roots: [
        {
          id: "r1",
          text: "Imported Root",
          x: 0,
          y: 0,
          width: 100,
          height: 32,
          children: [
            {
              id: "r1c1",
              text: "Imported Child",
              x: 250,
              y: 0,
              width: 100,
              height: 32,
              children: [],
            },
          ],
        },
      ],
      assets: [],
    };

    test("adds imported roots alongside existing nodes", () => {
      const rootsBefore = editor.getRoots().length;
      editor.importRoots(importData, 500, 200);
      expect(editor.getRoots().length).toBe(rootsBefore + 1);
    });

    test("offsets imported node positions", () => {
      editor.importRoots(importData, 500, 200);
      // Find the imported root (not n0)
      const imported = editor.getRoots().find((r) => r.id !== "n0")!;
      expect(imported.x).toBe(500);
      expect(imported.y).toBe(200);
    });

    test("generates new IDs to avoid collisions", () => {
      editor.importRoots(importData, 500, 200);
      const imported = editor.getRoots().find((r) => r.id !== "n0")!;
      // Should not use the original IDs from importData
      expect(imported.id).not.toBe("r1");
    });

    test("preserves tree structure with children", () => {
      editor.importRoots(importData, 500, 200);
      const imported = editor.getRoots().find((r) => r.id !== "n0")!;
      expect(imported.children.length).toBe(1);
      const child = editor.getNode(imported.children[0]!);
      expect(child.text).toBe("Imported Child");
    });

    test("is undoable", () => {
      const rootsBefore = editor.getRoots().length;
      editor.importRoots(importData, 500, 200);
      expect(editor.getRoots().length).toBe(rootsBefore + 1);
      editor.undo();
      expect(editor.getRoots().length).toBe(rootsBefore);
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
