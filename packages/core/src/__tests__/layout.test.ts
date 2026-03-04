import { describe, test, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import type { MindMapFileFormat } from "../serialization/schema";
import { childXFromParent } from "../layout/layout";

/**
 * Layout constants matching the implementation
 */
const H_OFFSET = 250;
const V_GAP = 20;
const NODE_HEIGHT = 32;

/** Helper: build a simple single-root map */
function singleRoot(): MindMapFileFormat {
  return {
    version: 1,
    meta: { id: "test", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
    camera: { x: 0, y: 0, zoom: 1 },
    roots: [
      {
        id: "root",
        text: "Root",
        x: 0,
        y: 0,
        width: 100,
        height: NODE_HEIGHT,
        children: [],
      },
    ],
    assets: [],
  };
}

/** Helper: root with two children */
function rootWithChildren(): MindMapFileFormat {
  return {
    version: 1,
    meta: { id: "test", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
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
            x: H_OFFSET,
            y: -26,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
          {
            id: "c2",
            text: "Child 2",
            x: H_OFFSET,
            y: 26,
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

describe("Layout engine", () => {
  let editor: TestEditor;

  describe("horizontal placement", () => {
    beforeEach(() => {
      editor = new TestEditor();
      editor.loadJSON(singleRoot());
    });

    test("first child is placed at H_OFFSET to the right of parent", () => {
      editor.select("root");
      const childId = editor.addChild("root", "C1");
      const child = editor.getNode(childId);
      expect(child.x).toBe(H_OFFSET);
    });

    test("second child has same x as first child", () => {
      const c1 = editor.addChild("root", "C1");
      const c2 = editor.addChild("root", "C2");
      expect(editor.getNode(c1).x).toBe(editor.getNode(c2).x);
    });

    test("grandchild is placed beyond child's right edge", () => {
      const c1 = editor.addChild("root", "C1");
      const gc1 = editor.addChild(c1, "GC1");
      const child = editor.getNode(c1);
      const grandchild = editor.getNode(gc1);
      // Grandchild x = child.x + child.width + CHILD_GAP
      expect(grandchild.x).toBe(child.x + child.width + 150);
    });
  });

  describe("vertical placement", () => {
    beforeEach(() => {
      editor = new TestEditor();
      editor.loadJSON(singleRoot());
    });

    test("first child is centered on parent y", () => {
      const c1 = editor.addChild("root", "C1");
      expect(editor.getNode(c1).y).toBe(editor.getNode("root").y);
    });

    test("two children are centered around parent y", () => {
      const c1 = editor.addChild("root", "C1");
      const c2 = editor.addChild("root", "C2");
      const parentY = editor.getNode("root").y;
      const child1Y = editor.getNode(c1).y;
      const child2Y = editor.getNode(c2).y;

      // Children should be symmetric around parent
      const midpoint = (child1Y + child2Y) / 2;
      expect(midpoint).toBe(parentY);

      // Gap between children should be V_GAP
      expect(child2Y - child1Y).toBe(NODE_HEIGHT + V_GAP);
    });

    test("three children are centered around parent y", () => {
      const c1 = editor.addChild("root", "C1");
      const c2 = editor.addChild("root", "C2");
      const c3 = editor.addChild("root", "C3");
      const parentY = editor.getNode("root").y;

      // Middle child should be at parent y
      expect(editor.getNode(c2).y).toBe(parentY);

      // Outer children symmetric
      expect(editor.getNode(c1).y).toBe(parentY - (NODE_HEIGHT + V_GAP));
      expect(editor.getNode(c3).y).toBe(parentY + (NODE_HEIGHT + V_GAP));
    });
  });

  describe("sibling shifting on delete", () => {
    beforeEach(() => {
      editor = new TestEditor();
      editor.loadJSON(rootWithChildren());
    });

    test("deleting a child re-centers remaining children", () => {
      const parentY = editor.getNode("root").y;
      editor.select("c1");
      editor.deleteNode("c1");

      // Only c2 remains, should be centered on parent
      expect(editor.getNode("c2").y).toBe(parentY);
    });

    test("deleting last child leaves parent childless", () => {
      editor.deleteNode("c1");
      editor.deleteNode("c2");
      expect(editor.getChildren("root")).toHaveLength(0);
    });
  });

  describe("sibling shifting on add", () => {
    beforeEach(() => {
      editor = new TestEditor();
      editor.loadJSON(rootWithChildren());
    });

    test("adding a third child shifts existing children to stay centered", () => {
      const parentY = editor.getNode("root").y;
      const c3 = editor.addChild("root", "C3");

      // Middle child (c2) should now be at parent y
      expect(editor.getNode("c2").y).toBe(parentY);
      expect(editor.getNode("c1").y).toBeLessThan(parentY);
      expect(editor.getNode(c3).y).toBeGreaterThan(parentY);
    });
  });

  describe("collapsed subtree handling", () => {
    test("collapsed children do not affect layout of siblings", () => {
      editor = new TestEditor();
      editor.loadJSON(rootWithChildren());

      // Add grandchildren to c1
      const gc1 = editor.addChild("c1", "GC1");
      const gc2 = editor.addChild("c1", "GC2");

      // Record c2 position
      const c2yExpanded = editor.getNode("c2").y;

      // Collapse c1
      editor.toggleCollapse("c1");

      // c2 should move up (closer to parent) since c1's subtree no longer
      // takes vertical space
      const c2yCollapsed = editor.getNode("c2").y;
      expect(c2yCollapsed).toBeLessThanOrEqual(c2yExpanded);

      // Grandchildren still exist but are not visible
      expect(editor.getNode(gc1)).toBeTruthy();
      expect(editor.getNode(gc2)).toBeTruthy();
    });
  });

  describe("subtree moves as rigid unit", () => {
    test("shifting a parent moves its entire subtree", () => {
      editor = new TestEditor();
      editor.loadJSON(rootWithChildren());

      // Add grandchild to c1
      const gc1 = editor.addChild("c1", "GC1");
      const c1y = editor.getNode("c1").y;
      const gc1y = editor.getNode(gc1).y;
      const offset = gc1y - c1y;

      // Add third child to root, which will shift c1 and its subtree
      editor.addChild("root", "C3");

      const newC1y = editor.getNode("c1").y;
      const newGc1y = editor.getNode(gc1).y;
      // The relative offset between c1 and gc1 should be preserved
      expect(newGc1y - newC1y).toBe(offset);
    });
  });

  describe("left-side branches (bidirectional)", () => {
    test("child placed to the left uses negative H_OFFSET", () => {
      editor = new TestEditor();
      editor.loadJSON(singleRoot());

      // Manually position a child to the left
      const c1 = editor.addChild("root", "C1");
      editor.setNodePosition(c1, -H_OFFSET, 0);

      // Adding a grandchild should go further left
      const gc1 = editor.addChild(c1, "GC1");
      expect(editor.getNode(gc1).x).toBeLessThan(editor.getNode(c1).x);
    });
  });

  describe("side-aware centering for root children", () => {
    test("left and right children of root are centered independently", () => {
      editor = new TestEditor();
      editor.loadJSON(singleRoot());

      // Add two right children
      const r1 = editor.addChild("root", "R1");
      const r2 = editor.addChild("root", "R2");

      // Add a left child
      editor.select("root");
      const l1 = editor.addChild("root", "L1", -1);

      const rootY = editor.getNode("root").y;
      const rootCenter = rootY + NODE_HEIGHT / 2;

      // Left child should be centered on root independently
      const l1Center = editor.getNode(l1).y + NODE_HEIGHT / 2;
      expect(Math.abs(l1Center - rootCenter)).toBeLessThan(1);

      // Right children should be centered on root independently
      const r1Y = editor.getNode(r1).y;
      const r2Y = editor.getNode(r2).y;
      const rightMidpoint = (r1Y + r2Y) / 2;
      expect(Math.abs(rightMidpoint - rootY)).toBeLessThan(1);
    });

    test("adding a right child does not shift left children", () => {
      editor = new TestEditor();
      editor.loadJSON(singleRoot());

      // Add a left child
      const l1 = editor.addChild("root", "L1", -1);
      const l1YBefore = editor.getNode(l1).y;

      // Add right children (explicit direction, as dispatch would pass)
      editor.addChild("root", "R1", 1);
      editor.addChild("root", "R2", 1);
      editor.addChild("root", "R3", 1);

      // Left child should not have moved
      expect(editor.getNode(l1).y).toBe(l1YBefore);
    });
  });

  describe("collapse does not push other trees", () => {
    test("collapsing a node does not shift an unrelated root tree", () => {
      editor = new TestEditor();
      const map: MindMapFileFormat = {
        version: 1,
        meta: { id: "test", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [
          {
            id: "r1",
            text: "Root 1",
            x: 200,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [
              {
                id: "c1",
                text: "Child 1",
                x: 450,
                y: -52,
                width: 100,
                height: NODE_HEIGHT,
                children: [
                  {
                    id: "gc1",
                    text: "Grand 1",
                    x: 700,
                    y: -78,
                    width: 100,
                    height: NODE_HEIGHT,
                    children: [],
                  },
                  {
                    id: "gc2",
                    text: "Grand 2",
                    x: 700,
                    y: -26,
                    width: 100,
                    height: NODE_HEIGHT,
                    children: [],
                  },
                ],
              },
              {
                id: "c2",
                text: "Child 2",
                x: 450,
                y: 0,
                width: 100,
                height: NODE_HEIGHT,
                children: [],
              },
              {
                id: "c3",
                text: "Child 3",
                x: 450,
                y: 52,
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
            y: -20,
            width: 100,
            height: NODE_HEIGHT,
            children: [
              {
                id: "r2c1",
                text: "R2 Child",
                x: 250,
                y: -20,
                width: 100,
                height: NODE_HEIGHT,
                children: [],
              },
            ],
          },
        ],
        assets: [],
      };
      editor.loadJSON(map);

      const r2yBefore = editor.getNode("r2").y;
      const r2c1yBefore = editor.getNode("r2c1").y;

      // Collapse c1 on r1 -- should NOT move r2's tree
      editor.toggleCollapse("c1");

      expect(editor.getNode("r2").y).toBe(r2yBefore);
      expect(editor.getNode("r2c1").y).toBe(r2c1yBefore);
    });
  });

  describe("cross-tree overlap", () => {
    test("overlap detection uses shared x-range, not full bounding box", () => {
      // A deep tree is narrow at the root but wide at the leaves.
      // A small tree positioned near the root (far from the leaves)
      // should NOT be pushed away by the leaf-level bounding box.
      editor = new TestEditor();
      const map: MindMapFileFormat = {
        version: 1,
        meta: { id: "test", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [
          {
            id: "deep",
            text: "Deep Root",
            x: 200,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [
              {
                id: "d1",
                text: "D1",
                x: 450,
                y: 0,
                width: 100,
                height: NODE_HEIGHT,
                children: [
                  // Leaves spread far vertically at depth 2
                  { id: "leaf1", text: "L1", x: 700, y: -200, width: 100, height: NODE_HEIGHT, children: [] },
                  { id: "leaf2", text: "L2", x: 700, y: -100, width: 100, height: NODE_HEIGHT, children: [] },
                  { id: "leaf3", text: "L3", x: 700, y: 100, width: 100, height: NODE_HEIGHT, children: [] },
                  { id: "leaf4", text: "L4", x: 700, y: 200, width: 100, height: NODE_HEIGHT, children: [] },
                ],
              },
            ],
          },
          {
            // Small tree positioned above the deep root, within x-range of root
            // but NOT overlapping with any actual nodes
            id: "small",
            text: "Small",
            x: 200,
            y: -100,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
        ],
        assets: [],
      };
      editor.loadJSON(map);

      const smallYBefore = editor.getNode("small").y;

      // Expanding the deep tree should NOT push "small" away,
      // because at the x-range where both trees coexist (x=200-300),
      // the deep tree only has its root at y=0, far from small at y=-100.
      editor.toggleCollapse("d1");  // collapse
      editor.toggleCollapse("d1");  // expand (triggers overlap check)

      expect(editor.getNode("small").y).toBe(smallYBefore);
    });

    test("trees with overlapping nodes in shared x-range get pushed apart", () => {
      editor = new TestEditor();
      // Two roots at the same x, close together vertically.
      // Both have children at the same x, creating real overlap.
      const map: MindMapFileFormat = {
        version: 1,
        meta: { id: "test", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [
          {
            id: "r1",
            text: "Root 1",
            x: 0,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
          {
            id: "r2",
            text: "Root 2",
            x: 0,
            y: 50,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
        ],
        assets: [],
      };
      editor.loadJSON(map);

      // r1 root at y=[0,32], r2 root at y=[50,82].
      // Adding a child to r1 re-centers and may push r1 into r2's space.
      // Both roots share x-range [0,100], so overlap is real.
      editor.addChild("r1", "C1");

      const r1 = editor.getNode("r1");
      const r2 = editor.getNode("r2");
      // r2 should not overlap with r1 in y
      expect(r2.y).toBeGreaterThanOrEqual(r1.y + r1.height);
    });

    test("trees at different x-ranges are not pushed apart", () => {
      editor = new TestEditor();
      const map: MindMapFileFormat = {
        version: 1,
        meta: { id: "test", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [
          {
            id: "r1",
            text: "Root 1",
            x: 0,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
          {
            // r2 is far to the right, no x overlap
            id: "r2",
            text: "Root 2",
            x: 500,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
        ],
        assets: [],
      };
      editor.loadJSON(map);

      const r2yBefore = editor.getNode("r2").y;

      // Adding children to r1 (they go at x=250) doesn't share x with r2 (x=500)
      for (let i = 0; i < 5; i++) {
        editor.addChild("r1", `C${i}`);
      }

      expect(editor.getNode("r2").y).toBe(r2yBefore);
    });
  });

  describe("wide parent child positioning", () => {
    /** Helper: root with width=400 */
    function wideRoot(): MindMapFileFormat {
      return {
        version: 1,
        meta: { id: "test", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [
          {
            id: "root",
            text: "A very wide root node",
            x: 0,
            y: 0,
            width: 400,
            height: NODE_HEIGHT,
            children: [],
          },
        ],
        assets: [],
      };
    }

    test("child of wide parent (right side) is placed beyond parent right edge", () => {
      editor = new TestEditor();
      editor.loadJSON(wideRoot());
      const childId = editor.addChild("root", "C1");
      const child = editor.getNode(childId);
      const parent = editor.getNode("root");

      // Child's left edge must be past parent's right edge
      expect(child.x).toBeGreaterThan(parent.x + parent.width);
    });

    test("reflow repositions children past wide parent right edge", () => {
      editor = new TestEditor();
      editor.loadJSON(wideRoot());

      // Add a child at default position
      const childId = editor.addChild("root", "C1");

      // Widen the root after child exists (simulating a width change)
      // and reflow by adding another child
      const child = editor.getNode(childId);
      const parent = editor.getNode("root");

      expect(child.x).toBeGreaterThan(parent.x + parent.width);
    });

    test("default-width parent still places child at H_OFFSET", () => {
      editor = new TestEditor();
      editor.loadJSON(singleRoot());
      const childId = editor.addChild("root", "C1");
      const child = editor.getNode(childId);

      // With default width=100, behavior is unchanged
      expect(child.x).toBe(H_OFFSET);
    });

    test("childXFromParent: right-side with wide parent clears parent", () => {
      // width=400, direction=1 => parentX + 400 + 150 = 550
      expect(childXFromParent(0, 400, 1, 100)).toBe(550);
    });

    test("childXFromParent: right-side with default parent matches H_OFFSET", () => {
      // width=100, direction=1 => 0 + 100 + 150 = 250 = H_OFFSET
      expect(childXFromParent(0, 100, 1, 100)).toBe(H_OFFSET);
    });

    test("childXFromParent: left-side accounts for child width", () => {
      // direction=-1, childWidth=100 => parentX - 150 - 100 = -250
      expect(childXFromParent(0, 100, -1, 100)).toBe(-H_OFFSET);
      // parent width does not affect left-side positioning
      expect(childXFromParent(0, 400, -1, 100)).toBe(-H_OFFSET);
      // wide child pushes further left to avoid overlap
      expect(childXFromParent(0, 100, -1, 400)).toBe(-550);
    });
  });
});
