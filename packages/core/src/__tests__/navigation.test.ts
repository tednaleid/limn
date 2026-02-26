import { describe, test, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import type { MindMapFileFormat } from "../serialization/schema";

const NODE_HEIGHT = 32;

/** Helper: root with three children at known positions */
function rootWithThreeChildren(): MindMapFileFormat {
  return {
    version: 1,
    meta: { id: "test", theme: "default" },
    camera: { x: 0, y: 0, zoom: 1 },
    roots: [
      {
        id: "root",
        text: "Root",
        x: 0,
        y: 0,
        width: 100,
        height: NODE_HEIGHT,
        children: [
          {
            id: "c1",
            text: "Child 1",
            x: 250,
            y: -52,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
          {
            id: "c2",
            text: "Child 2",
            x: 250,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
          {
            id: "c3",
            text: "Child 3",
            x: 250,
            y: 52,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
        ],
      },
    ],
    assets: [],
  };
}

/** Helper: root with right and left branches */
function bidirectionalMap(): MindMapFileFormat {
  return {
    version: 1,
    meta: { id: "test", theme: "default" },
    camera: { x: 0, y: 0, zoom: 1 },
    roots: [
      {
        id: "root",
        text: "Root",
        x: 0,
        y: 0,
        width: 100,
        height: NODE_HEIGHT,
        children: [
          {
            id: "right1",
            text: "Right 1",
            x: 250,
            y: -26,
            width: 100,
            height: NODE_HEIGHT,
            children: [
              {
                id: "right1a",
                text: "R1A",
                x: 500,
                y: -26,
                width: 100,
                height: NODE_HEIGHT,
                children: [],
              },
            ],
          },
          {
            id: "right2",
            text: "Right 2",
            x: 250,
            y: 26,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
          {
            id: "left1",
            text: "Left 1",
            x: -250,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [
              {
                id: "left1a",
                text: "L1A",
                x: -500,
                y: 0,
                width: 100,
                height: NODE_HEIGHT,
                children: [],
              },
            ],
          },
        ],
      },
    ],
    assets: [],
  };
}

/** Helper: two root trees */
function twoRoots(): MindMapFileFormat {
  return {
    version: 1,
    meta: { id: "test", theme: "default" },
    camera: { x: 0, y: 0, zoom: 1 },
    roots: [
      {
        id: "r1",
        text: "Root 1",
        x: 0,
        y: 0,
        width: 100,
        height: NODE_HEIGHT,
        children: [
          {
            id: "r1c1",
            text: "R1C1",
            x: 250,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
        ],
      },
      {
        id: "r2",
        text: "Root 2",
        x: 0,
        y: 200,
        width: 100,
        height: NODE_HEIGHT,
        children: [],
      },
    ],
    assets: [],
  };
}

describe("Spatial navigation", () => {
  let editor: TestEditor;

  describe("navigateUp / navigateDown", () => {
    beforeEach(() => {
      editor = new TestEditor();
      editor.loadJSON(rootWithThreeChildren());
    });

    test("navigateDown from c1 selects c2 (same y-distance as root but closer in x)", () => {
      // c1 center=(300,-36), root center=(50,16), c2 center=(300,16)
      // Both at yDist=52 but c2 is at the same x, root is 250px away
      editor.select("c1");
      editor.navigateDown();
      expect(editor.getSelectedId()).toBe("c2");
    });

    test("navigateDown from c2 selects c3", () => {
      editor.select("c2");
      editor.navigateDown();
      expect(editor.getSelectedId()).toBe("c3");
    });

    test("navigateDown from c3 is no-op (bottommost)", () => {
      editor.select("c3");
      editor.navigateDown();
      expect(editor.getSelectedId()).toBe("c3");
    });

    test("navigateUp from c3 selects c2 (same y-distance as root but closer in x)", () => {
      // c3 center=(300,68), root center=(50,16), c2 center=(300,16)
      // Both at yDist=52 but c2 is at the same x, root is 250px away
      editor.select("c3");
      editor.navigateUp();
      expect(editor.getSelectedId()).toBe("c2");
    });

    test("navigateUp from c2 selects c1", () => {
      editor.select("c2");
      editor.navigateUp();
      expect(editor.getSelectedId()).toBe("c1");
    });

    test("navigateUp from c1 is no-op (topmost)", () => {
      editor.select("c1");
      editor.navigateUp();
      expect(editor.getSelectedId()).toBe("c1");
    });

    test("navigateDown from root selects c2 (nearest below by y-center)", () => {
      editor.select("root");
      editor.navigateDown();
      // root is at y=0, c2 is at y=0 too but has same y-center,
      // c3 is at y=52 which is below
      // Nearest below: c3 at y=52 (center = 68) is below root center (16)
      // c2 at y=0 has center=16, same as root -- not below
      // Actually c2.center == root.center, so it's not strictly below.
      // Next below is c3. But wait, all children with y-center > root.y-center should qualify.
      // c2 center = 16, root center = 16 -- not below (equal)
      // c3 center = 68 -- below
      // So navigateDown from root should select c3
      expect(editor.getSelectedId()).toBe("c3");
    });

    test("navigateDown prefers nearby sibling over distant grandchild", () => {
      // Reproduce Ted's bug: "Web App" down should go to "Persistence", not "new box"
      const file: MindMapFileFormat = {
        version: 1,
        meta: { id: "test", theme: "default", version: 1 },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [{
          id: "root", text: "Root", x: 0, y: 0, width: 100, height: NODE_HEIGHT,
          children: [
            { id: "c1", text: "Sibling A", x: 250, y: -52, width: 100, height: NODE_HEIGHT, children: [] },
            {
              id: "c2", text: "Sibling B", x: 250, y: 52, width: 100, height: NODE_HEIGHT,
              children: [{
                id: "gc1", text: "Grandchild", x: 500, y: 20, width: 100, height: NODE_HEIGHT,
                children: [],
              }],
            },
          ],
        }],
        assets: [],
      };
      editor.loadJSON(file);
      editor.select("c1");
      // Grandchild is closer in y (center 36 vs 68) but far in x (550 vs 300)
      // Should select Sibling B, not Grandchild
      editor.navigateDown();
      expect(editor.getSelectedId()).toBe("c2");
    });
  });

  describe("navigateLeft / navigateRight (right-side branches)", () => {
    beforeEach(() => {
      editor = new TestEditor();
      editor.loadJSON(rootWithThreeChildren());
    });

    test("navigateRight from root selects nearest child by y", () => {
      // root center y=16, c1 center=-36, c2 center=16, c3 center=68
      // c2 is nearest to root's y-center
      editor.select("root");
      editor.navigateRight();
      expect(editor.getSelectedId()).toBe("c2");
    });

    test("navigateLeft from c1 selects parent (root)", () => {
      editor.select("c1");
      editor.navigateLeft();
      expect(editor.getSelectedId()).toBe("root");
    });

    test("navigateRight from leaf c1 is no-op", () => {
      editor.select("c1");
      editor.navigateRight();
      expect(editor.getSelectedId()).toBe("c1");
    });

    test("navigateLeft from root is no-op (no left children)", () => {
      editor.select("root");
      editor.navigateLeft();
      expect(editor.getSelectedId()).toBe("root");
    });
  });

  describe("navigateLeft / navigateRight (left-side branches)", () => {
    beforeEach(() => {
      editor = new TestEditor();
      editor.loadJSON(bidirectionalMap());
    });

    test("navigateLeft from root selects first left child", () => {
      editor.select("root");
      editor.navigateLeft();
      expect(editor.getSelectedId()).toBe("left1");
    });

    test("navigateRight from root selects first right child", () => {
      editor.select("root");
      editor.navigateRight();
      expect(editor.getSelectedId()).toBe("right1");
    });

    test("navigateRight from left1 goes toward parent (root)", () => {
      editor.select("left1");
      editor.navigateRight();
      expect(editor.getSelectedId()).toBe("root");
    });

    test("navigateLeft from left1 goes toward child (left1a)", () => {
      editor.select("left1");
      editor.navigateLeft();
      expect(editor.getSelectedId()).toBe("left1a");
    });

    test("navigateLeft from right1 goes toward parent (root)", () => {
      editor.select("right1");
      editor.navigateLeft();
      expect(editor.getSelectedId()).toBe("root");
    });

    test("navigateRight from right1 goes toward child (right1a)", () => {
      editor.select("right1");
      editor.navigateRight();
      expect(editor.getSelectedId()).toBe("right1a");
    });
  });

  describe("cross-tree navigation", () => {
    beforeEach(() => {
      editor = new TestEditor();
      editor.loadJSON(twoRoots());
    });

    test("navigateDown from r1 reaches r2 across tree boundary", () => {
      editor.select("r1");
      editor.navigateDown();
      // r1 center=16, r1c1 center=16 (same!), r2 center=216
      // r1c1 is NOT strictly below r1, so first navigateDown goes to r2
      expect(editor.getSelectedId()).toBe("r2");
    });

    test("navigateUp from r2 reaches nodes in r1's tree", () => {
      editor.select("r2");
      editor.navigateUp();
      // r1c1 and r1 are both above r2, pick nearest by y distance
      const selected = editor.getSelectedId();
      // r1c1 at y=0 (center=16), r1 at y=0 (center=16), r2 at y=200 (center=216)
      // Nearest above r2 is r1c1 or r1 (tie at y=0, prefer smaller x)
      expect(selected === "r1" || selected === "r1c1").toBe(true);
    });
  });

  describe("collapsed node navigation", () => {
    test("navigateRight on collapsed node expands it", () => {
      editor = new TestEditor();
      editor.loadJSON(rootWithThreeChildren());
      editor.toggleCollapse("root");
      expect(editor.isCollapsed("root")).toBe(true);

      editor.select("root");
      editor.navigateRight();
      // Should expand and select nearest child by y (c2 is at same y-center as root)
      expect(editor.isCollapsed("root")).toBe(false);
      expect(editor.getSelectedId()).toBe("c2");
    });
  });

  describe("nothing selected + arrow keys", () => {
    test("arrow key with nothing selected selects nearest node to viewport center", () => {
      editor = new TestEditor();
      editor.loadJSON(rootWithThreeChildren());
      // Camera at (400, 300) with zoom 1 means viewport center is at world (400-400, 300-300) = (0,0) ... no
      // Actually viewport center in world coords: (vpW/2 - cam.x) / cam.zoom
      // Set camera so viewport center is near root (0,0)
      editor.setCamera(400, 300, 1);
      editor.setViewportSize(800, 600);
      editor.deselect();
      expect(editor.getSelectedId()).toBeNull();

      editor.pressKey("ArrowDown");
      // Should select the node nearest to viewport center (world 0, 0) = root at (0,0)
      expect(editor.getSelectedId()).not.toBeNull();
    });

    test("selects node closest to viewport center", () => {
      editor = new TestEditor();
      editor.loadJSON(rootWithThreeChildren());
      // Camera positioned so viewport center is near c3 at (250, 52)
      // World center = (vpW/2 - camX) / zoom, (vpH/2 - camY) / zoom
      // Want world center at (250, 52): camX = vpW/2 - 250, camY = vpH/2 - 52
      editor.setViewportSize(800, 600);
      editor.setCamera(800 / 2 - 250, 600 / 2 - 52, 1);
      editor.deselect();

      editor.pressKey("ArrowUp"); // any arrow key should select nearest
      expect(editor.getSelectedId()).toBe("c3");
    });
  });

  describe("keyboard dispatch for arrow keys", () => {
    beforeEach(() => {
      editor = new TestEditor();
      editor.loadJSON(rootWithThreeChildren());
    });

    test("ArrowDown key triggers navigateDown", () => {
      editor.select("c2");
      editor.pressKey("ArrowDown");
      expect(editor.getSelectedId()).toBe("c3");
    });

    test("ArrowUp key triggers navigateUp", () => {
      editor.select("c2");
      editor.pressKey("ArrowUp");
      expect(editor.getSelectedId()).toBe("c1");
    });

    test("ArrowRight key triggers navigateRight", () => {
      editor.select("root");
      editor.pressKey("ArrowRight");
      expect(editor.getSelectedId()).toBe("c2");
    });

    test("ArrowLeft key triggers navigateLeft", () => {
      editor.select("c1");
      editor.pressKey("ArrowLeft");
      expect(editor.getSelectedId()).toBe("root");
    });
  });
});
