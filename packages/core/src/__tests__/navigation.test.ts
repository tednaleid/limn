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

describe("Navigation", () => {
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

    test("navigateDown stays among siblings, ignores spatially close parent", () => {
      // Reproduce Ted's bug: from "Layout", Down went to parent "Persistence"
      // because it was spatially closer (slightly below + far left) than
      // the next sibling "SVG Renderer" (far below + same x).
      // Parent root at y=2 is barely below layout center, but spatial score
      // (yDist=2 + xDist*0.5=125 = 127) beats svg (yDist=200).
      const file: MindMapFileFormat = {
        version: 1,
        meta: { id: "test", theme: "default" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [{
          id: "root", text: "Persistence", x: 0, y: 2, width: 100, height: NODE_HEIGHT,
          children: [
            { id: "store", text: "Store", x: 250, y: -200, width: 100, height: NODE_HEIGHT, children: [] },
            {
              id: "layout", text: "Layout", x: 250, y: 0, width: 100, height: NODE_HEIGHT,
              children: [
                { id: "t1", text: "test", x: 500, y: -10, width: 100, height: NODE_HEIGHT, children: [] },
              ],
            },
            { id: "svg", text: "SVG Renderer", x: 250, y: 200, width: 100, height: NODE_HEIGHT, children: [] },
          ],
        }],
        assets: [],
      };
      editor.loadJSON(file);
      editor.select("layout");
      editor.navigateDown();
      expect(editor.getSelectedId()).toBe("svg");
    });

    test("navigateUp stays among siblings, ignores spatially close children", () => {
      // From "Layout", Up went to child "test" (slightly above + far right)
      // because spatial score (yDist=10 + xDist*0.5=125 = 135) beats
      // distant sibling "Store" (yDist=200).
      // Same fixture as above.
      const file: MindMapFileFormat = {
        version: 1,
        meta: { id: "test", theme: "default" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [{
          id: "root", text: "Persistence", x: 0, y: 2, width: 100, height: NODE_HEIGHT,
          children: [
            { id: "store", text: "Store", x: 250, y: -200, width: 100, height: NODE_HEIGHT, children: [] },
            {
              id: "layout", text: "Layout", x: 250, y: 0, width: 100, height: NODE_HEIGHT,
              children: [
                { id: "t1", text: "test", x: 500, y: -10, width: 100, height: NODE_HEIGHT, children: [] },
              ],
            },
            { id: "svg", text: "SVG Renderer", x: 250, y: 200, width: 100, height: NODE_HEIGHT, children: [] },
          ],
        }],
        assets: [],
      };
      editor.loadJSON(file);
      editor.select("layout");
      editor.navigateUp();
      expect(editor.getSelectedId()).toBe("store");
    });

    test("navigateDown on only root with children falls back spatially to nearest child below", () => {
      editor.select("root");
      editor.navigateDown();
      // root center y=16, c1 center=-36, c2 center=16, c3 center=68
      // No sibling roots, so spatial fallback kicks in. c3 is the only child strictly below root center.
      expect(editor.getSelectedId()).toBe("c3");
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

    test("navigateUp from r2 goes to r1 (sibling root)", () => {
      editor.select("r2");
      editor.navigateUp();
      // Up/down navigates among siblings; roots are siblings of each other
      expect(editor.getSelectedId()).toBe("r1");
    });

    test("navigateUp on root prefers spatially close node over distant root", () => {
      // Root A far to the left, Root B at center with children above it.
      // Up from B should go to the nearby child above, not the far-away Root A.
      const file: MindMapFileFormat = {
        version: 1,
        meta: { id: "test", theme: "default" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [
          {
            id: "rootA",
            text: "Root A",
            x: -1000,
            y: -50,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
          {
            id: "rootB",
            text: "Root B",
            x: 0,
            y: 100,
            width: 100,
            height: NODE_HEIGHT,
            children: [
              {
                id: "child1",
                text: "Child 1",
                x: 250,
                y: 0,
                width: 100,
                height: NODE_HEIGHT,
                children: [],
              },
            ],
          },
        ],
        assets: [],
      };
      editor.loadJSON(file);
      editor.select("rootB");
      editor.navigateUp();
      // rootB center=(50, 116). child1 center=(300, 16) is above at xDist=250.
      // rootA center=(-950, -34) is above at xDist=1000.
      // Spatial: child1 score=100+250*10=2600, rootA score=150+1000*10=10150
      // Should pick child1, not rootA.
      expect(editor.getSelectedId()).toBe("child1");
    });

    test("navigateDown on root prefers spatially close node over distant root", () => {
      const file: MindMapFileFormat = {
        version: 1,
        meta: { id: "test", theme: "default" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [
          {
            id: "rootA",
            text: "Root A",
            x: 0,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [
              {
                id: "child1",
                text: "Child 1",
                x: 250,
                y: 100,
                width: 100,
                height: NODE_HEIGHT,
                children: [],
              },
            ],
          },
          {
            id: "rootB",
            text: "Root B",
            x: -1000,
            y: 50,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
        ],
        assets: [],
      };
      editor.loadJSON(file);
      editor.select("rootA");
      editor.navigateDown();
      // rootA center=(50, 16). child1 center=(300, 116) is below at xDist=250.
      // rootB center=(-950, 66) is below at xDist=1000.
      // Spatial: child1 score=100+250*10=2600, rootB score=50+1000*10=10050
      // Should pick child1, not rootB.
      expect(editor.getSelectedId()).toBe("child1");
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

  describe("spatial fallback navigation", () => {
    /** Root with an only-child, plus a disconnected root below */
    function onlyChildWithDisconnectedRoot(): MindMapFileFormat {
      return {
        version: 1,
        meta: { id: "test", theme: "default" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [
          {
            id: "root1",
            text: "Root 1",
            x: 0,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [
              {
                id: "only",
                text: "Only Child",
                x: 250,
                y: 0,
                width: 100,
                height: NODE_HEIGHT,
                children: [],
              },
            ],
          },
          {
            id: "root2",
            text: "Root 2",
            x: 250,
            y: 200,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
        ],
        assets: [],
      };
    }

    test("up from only-child falls back to nearest node above", () => {
      const editor = new TestEditor();
      editor.loadJSON(onlyChildWithDisconnectedRoot());
      editor.select("only");
      // "only" center=(300, 16), no siblings above.
      // Spatial fallback: root1 center=(50, 16) is NOT above (same y).
      // root2 center=(300, 216) is below. So up is no-op here.
      // Let's add a node above. Use a different fixture:
      const file: MindMapFileFormat = {
        version: 1,
        meta: { id: "test", theme: "default" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [
          {
            id: "root1",
            text: "Root 1",
            x: 0,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [
              {
                id: "only",
                text: "Only Child",
                x: 250,
                y: 100,
                width: 100,
                height: NODE_HEIGHT,
                children: [],
              },
            ],
          },
          {
            id: "root2",
            text: "Root 2",
            x: 250,
            y: -100,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
        ],
        assets: [],
      };
      editor.loadJSON(file);
      editor.select("only");
      editor.navigateUp();
      // "only" center=(300, 116). root2 center=(300, -84) is above.
      // root1 center=(50, 16) is also above but far in x.
      // root2 score: yDist=200 + xDist=0*10 = 200
      // root1 score: yDist=100 + xDist=250*10 = 2600
      expect(editor.getSelectedId()).toBe("root2");
    });

    test("down from only-child falls back to nearest node below", () => {
      const editor = new TestEditor();
      editor.loadJSON(onlyChildWithDisconnectedRoot());
      editor.select("only");
      editor.navigateDown();
      // "only" center=(300, 16). No siblings. Spatial fallback:
      // root2 center=(300, 216) is below. score: yDist=200 + xDist=0*10 = 200
      // root1 center=(50, 16) is NOT below (same y center).
      expect(editor.getSelectedId()).toBe("root2");
    });

    test("fallback strongly prefers same-column nodes", () => {
      // "current" is an only-child so sibling search finds nothing -> spatial fallback.
      // Two disconnected roots above: one at same X (far in Y), one close in Y but far in X.
      const file: MindMapFileFormat = {
        version: 1,
        meta: { id: "test", theme: "default" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [
          {
            id: "parent",
            text: "Parent",
            x: 0,
            y: 300,
            width: 100,
            height: NODE_HEIGHT,
            children: [
              {
                id: "current",
                text: "Current",
                x: 200,
                y: 300,
                width: 100,
                height: NODE_HEIGHT,
                children: [],
              },
            ],
          },
          {
            id: "sameCol",
            text: "Same Column",
            x: 200,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
          {
            id: "closeY",
            text: "Close Y",
            x: 600,
            y: 250,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
        ],
        assets: [],
      };
      const editor = new TestEditor();
      editor.loadJSON(file);
      editor.select("current");
      editor.navigateUp();
      // current center=(250, 316). Only child, no siblings -> spatial fallback.
      // sameCol center=(250, 16): yDist=300, xDist=0 -> score=300
      // closeY center=(650, 266): yDist=50, xDist=400 -> score=50+4000=4050
      // parent center=(50, 316): NOT above (same y center) -> filtered out
      expect(editor.getSelectedId()).toBe("sameCol");
    });

    test("right from leaf falls back to node to the right", () => {
      const file: MindMapFileFormat = {
        version: 1,
        meta: { id: "test", theme: "default" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [
          {
            id: "root1",
            text: "Root 1",
            x: 0,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [
              {
                id: "leaf",
                text: "Leaf",
                x: 250,
                y: 0,
                width: 100,
                height: NODE_HEIGHT,
                children: [],
              },
            ],
          },
          {
            id: "root2",
            text: "Root 2",
            x: 600,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
        ],
        assets: [],
      };
      const editor = new TestEditor();
      editor.loadJSON(file);
      editor.select("leaf");
      editor.navigateRight();
      // leaf center=(300, 16). No children. Spatial fallback:
      // root2 center=(650, 16) is to the right. score: xDist=350 + yDist=0*10 = 350
      // root1 center=(50, 16) is NOT to the right.
      expect(editor.getSelectedId()).toBe("root2");
    });

    test("left from root with no left children falls back", () => {
      const file: MindMapFileFormat = {
        version: 1,
        meta: { id: "test", theme: "default" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [
          {
            id: "root1",
            text: "Root 1",
            x: 300,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [
              {
                id: "child",
                text: "Child",
                x: 550,
                y: 0,
                width: 100,
                height: NODE_HEIGHT,
                children: [],
              },
            ],
          },
          {
            id: "root2",
            text: "Root 2",
            x: 0,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
        ],
        assets: [],
      };
      const editor = new TestEditor();
      editor.loadJSON(file);
      editor.select("root1");
      editor.navigateLeft();
      // root1 center=(350, 16). No left children (child is at x=550, to the right).
      // Spatial fallback: root2 center=(50, 16) is to the left.
      // score: xDist=300 + yDist=0*10 = 300
      expect(editor.getSelectedId()).toBe("root2");
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
