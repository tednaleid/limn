import { describe, test, expect } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import type { MindMapFileFormat } from "../serialization/schema";

const H_OFFSET = 250;
const NODE_HEIGHT = 32;

/** Helper: root with two children, pre-laid-out at correct positions. */
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

/** Helper: root with children and grandchildren. */
function rootWithGrandchildren(): MindMapFileFormat {
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
            children: [
              {
                id: "gc1",
                text: "Grand 1",
                x: H_OFFSET * 2,
                y: -52,
                width: 100,
                height: NODE_HEIGHT,
                children: [],
              },
              {
                id: "gc2",
                text: "Grand 2",
                x: H_OFFSET * 2,
                y: 0,
                width: 100,
                height: NODE_HEIGHT,
                children: [],
              },
            ],
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

describe("reflowChildren (r key)", () => {
  test("r with nothing selected is a no-op", () => {
    const editor = new TestEditor();
    editor.loadJSON(rootWithChildren());
    const c1yBefore = editor.getNode("c1").y;
    editor.pressKey("r");
    expect(editor.getNode("c1").y).toBe(c1yBefore);
  });

  test("r on a leaf node (no children) is a no-op", () => {
    const editor = new TestEditor();
    editor.loadJSON(rootWithChildren());
    editor.select("c1");
    const c1yBefore = editor.getNode("c1").y;
    editor.pressKey("r");
    expect(editor.getNode("c1").y).toBe(c1yBefore);
    // Should not push an undo entry for a no-op
    expect(editor.canUndo()).toBe(false);
  });

  test("r resets manually-positioned children to computed layout", () => {
    const editor = new TestEditor();
    editor.loadJSON(rootWithChildren());

    // Record correct layout positions
    const c1yCorrect = editor.getNode("c1").y;
    const c2yCorrect = editor.getNode("c2").y;

    // Manually displace children
    editor.setNodePosition("c1", H_OFFSET, 200);
    editor.setNodePosition("c2", H_OFFSET, 300);

    // Verify they moved
    expect(editor.getNode("c1").y).toBe(200);
    expect(editor.getNode("c2").y).toBe(300);

    // Reflow
    editor.select("root");
    editor.pressKey("r");

    // Children should be back at computed positions
    expect(editor.getNode("c1").y).toBeCloseTo(c1yCorrect, 0);
    expect(editor.getNode("c2").y).toBeCloseTo(c2yCorrect, 0);
  });

  test("r fixes x-positions of children dragged to wrong side", () => {
    const editor = new TestEditor();
    editor.loadJSON(rootWithChildren());

    // Drag c1 to the wrong x position
    editor.setNodePosition("c1", H_OFFSET + 100, editor.getNode("c1").y);

    editor.select("root");
    editor.pressKey("r");

    // x should be corrected back to H_OFFSET
    expect(editor.getNode("c1").x).toBe(H_OFFSET);
  });

  test("r recursively reflows grandchildren", () => {
    const editor = new TestEditor();
    editor.loadJSON(rootWithGrandchildren());

    // Record correct grandchild positions
    const gc1xCorrect = editor.getNode("gc1").x;

    // Displace grandchildren
    editor.setNodePosition("gc1", H_OFFSET * 2 + 100, 500);
    editor.setNodePosition("gc2", H_OFFSET * 2 + 100, 600);

    // Reflow from root
    editor.select("root");
    editor.pressKey("r");

    // Grandchild x should be fixed
    expect(editor.getNode("gc1").x).toBe(gc1xCorrect);
    expect(editor.getNode("gc2").x).toBe(gc1xCorrect);

    // Grandchildren should be re-centered around c1
    const c1 = editor.getNode("c1");
    const gc1 = editor.getNode("gc1");
    const gc2 = editor.getNode("gc2");
    const midpoint = (gc1.y + gc2.y) / 2;
    expect(midpoint).toBeCloseTo(c1.y, 0);
  });

  test("r is undoable", () => {
    const editor = new TestEditor();
    editor.loadJSON(rootWithChildren());

    // Displace children
    editor.setNodePosition("c1", H_OFFSET, 200);
    editor.setNodePosition("c2", H_OFFSET, 300);

    const c1yDisplaced = editor.getNode("c1").y;
    const c2yDisplaced = editor.getNode("c2").y;

    // Reflow
    editor.select("root");
    editor.pressKey("r");

    // Positions changed
    expect(editor.getNode("c1").y).not.toBe(c1yDisplaced);

    // Undo
    editor.undo();

    // Positions restored to displaced state
    expect(editor.getNode("c1").y).toBe(c1yDisplaced);
    expect(editor.getNode("c2").y).toBe(c2yDisplaced);
  });

  test("r on a node with collapsed children leaves collapsed subtrees collapsed", () => {
    const editor = new TestEditor();
    editor.loadJSON(rootWithGrandchildren());

    // Collapse c1 (hides gc1, gc2)
    editor.toggleCollapse("c1");
    expect(editor.isCollapsed("c1")).toBe(true);

    // Displace c2
    editor.setNodePosition("c2", H_OFFSET, 300);

    // Reflow from root
    editor.select("root");
    editor.pressKey("r");

    // c1 should still be collapsed
    expect(editor.isCollapsed("c1")).toBe(true);

    // c2 should be re-centered (both children visible: c1 collapsed + c2 leaf)
    const root = editor.getNode("root");
    const c1 = editor.getNode("c1");
    const c2 = editor.getNode("c2");
    const midpoint = (c1.y + c2.y) / 2;
    expect(midpoint).toBeCloseTo(root.y, 0);
  });

  test("r on root preserves left-side children on the left", () => {
    const editor = new TestEditor();
    const map: MindMapFileFormat = {
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
              id: "left1",
              text: "Left 1",
              x: -H_OFFSET,
              y: -26,
              width: 100,
              height: NODE_HEIGHT,
              children: [],
            },
            {
              id: "right1",
              text: "Right 1",
              x: H_OFFSET,
              y: -26,
              width: 100,
              height: NODE_HEIGHT,
              children: [],
            },
            {
              id: "right2",
              text: "Right 2",
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
    editor.loadJSON(map);

    // Displace left child further left (wrong x, but still on left side)
    editor.setNodePosition("left1", -H_OFFSET - 50, 200);

    editor.select("root");
    editor.pressKey("r");

    // Left child should stay on the left side
    expect(editor.getNode("left1").x).toBe(-H_OFFSET);
    // Right children should stay on the right side
    expect(editor.getNode("right1").x).toBe(H_OFFSET);
    expect(editor.getNode("right2").x).toBe(H_OFFSET);
  });

  test("reflow pushes other root trees out of the way", () => {
    const editor = new TestEditor();
    // Two roots: one with children, one nearby that could overlap
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
        {
          id: "r2",
          text: "Root 2",
          x: 0,
          y: 60,
          width: 100,
          height: NODE_HEIGHT,
          children: [],
        },
      ],
      assets: [],
    };
    editor.loadJSON(map);

    // Displace children far below root, into r2's space
    editor.setNodePosition("c1", H_OFFSET, 50);
    editor.setNodePosition("c2", H_OFFSET, 102);

    // Reflow r1's children -- should push r2 out of the way
    editor.select("r1");
    editor.pressKey("r");

    // r2 should not overlap with r1's bounding box
    const r1 = editor.getNode("r1");
    const c2 = editor.getNode("c2");
    const r2 = editor.getNode("r2");
    const r1Bottom = Math.max(r1.y + r1.height, c2.y + c2.height);
    expect(r2.y).toBeGreaterThanOrEqual(r1Bottom);
  });
});
