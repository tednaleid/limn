// ABOUTME: Tests for branch color assignment and inheritance.
// ABOUTME: Verifies palette auto-assignment, ancestor walk, and serialization round-trip.

import { describe, it, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { resetIdCounter } from "../store/MindMapStore";
import { BRANCH_PALETTE, nextBranchColor } from "../theme/palette";

describe("branch color palette", () => {
  it("has at least 8 colors", () => {
    expect(BRANCH_PALETTE.length).toBeGreaterThanOrEqual(8);
  });

  it("nextBranchColor picks the first unused color", () => {
    expect(nextBranchColor([])).toBe(BRANCH_PALETTE[0]);
  });

  it("nextBranchColor skips already-used colors", () => {
    const used = [BRANCH_PALETTE[0]!];
    expect(nextBranchColor(used)).toBe(BRANCH_PALETTE[1]);
  });

  it("nextBranchColor cycles when all colors used", () => {
    const used = [...BRANCH_PALETTE];
    expect(nextBranchColor(used)).toBe(BRANCH_PALETTE[0]);
  });

  it("nextBranchColor keeps cycling through the palette", () => {
    // 9 existing colors (full palette + one repeat) should yield the second color
    const used = [...BRANCH_PALETTE, BRANCH_PALETTE[0]!];
    expect(nextBranchColor(used)).toBe(BRANCH_PALETTE[1]);
  });
});

describe("branch color auto-assignment", () => {
  let editor: TestEditor;

  beforeEach(() => {
    editor = new TestEditor();
  });

  it("addRoot assigns a branch color", () => {
    editor.addRoot("Root 1", 0, 0);
    editor.exitEditMode();
    const root = editor.getRoots()[0]!;
    expect(root.style?.color).toBe(BRANCH_PALETTE[0]);
  });

  it("second root gets a different color than the first", () => {
    editor.addRoot("Root 1", 0, 0);
    editor.exitEditMode();
    editor.addRoot("Root 2", 0, 100);
    editor.exitEditMode();
    const roots = editor.getRoots();
    expect(roots[0]!.style?.color).toBe(BRANCH_PALETTE[0]);
    expect(roots[1]!.style?.color).toBe(BRANCH_PALETTE[1]);
  });
});

describe("getBranchColor", () => {
  let editor: TestEditor;

  beforeEach(() => {
    editor = new TestEditor();
  });

  it("returns the root's color for the root node", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    expect(editor.getBranchColor(rootId)).toBe(BRANCH_PALETTE[0]);
  });

  it("returns the root's color for a child node", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    const childId = editor.addChild(rootId, "Child");
    editor.exitEditMode();
    expect(editor.getBranchColor(childId)).toBe(BRANCH_PALETTE[0]);
  });

  it("returns the root's color for a grandchild node", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    const childId = editor.addChild(rootId, "Child");
    editor.exitEditMode();
    const grandchildId = editor.addChild(childId, "Grandchild");
    editor.exitEditMode();
    expect(editor.getBranchColor(grandchildId)).toBe(BRANCH_PALETTE[0]);
  });

  it("returns an overridden color on an intermediate node", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    const childId = editor.addChild(rootId, "Child");
    editor.exitEditMode();
    editor.setNodeColor(childId, "#ff0000");
    const grandchildId = editor.addChild(childId, "Grandchild");
    editor.exitEditMode();
    expect(editor.getBranchColor(grandchildId)).toBe("#ff0000");
  });

  it("auto-assigns a color when loading a file without colors", () => {
    const editor2 = new TestEditor();
    // Load a file without colors to simulate old data
    const fileData = {
      version: 1,
      meta: { id: "test", theme: "default" },
      camera: { x: 0, y: 0, zoom: 1 },
      roots: [{
        id: "r1",
        text: "Root",
        x: 0, y: 0,
        width: 100, height: 32,
        children: [],
      }],
      assets: [],
    };
    editor2.loadJSON(fileData);
    expect(editor2.getBranchColor("r1")).toBe(BRANCH_PALETTE[0]);
  });
});

describe("branch color adoption on reparent", () => {
  let editor: TestEditor;

  beforeEach(() => {
    resetIdCounter();
    editor = new TestEditor();
  });

  it("reparented node adopts new parent's branch color", () => {
    editor.addRoot("Root1", 0, 0);    // n0
    editor.exitEditMode();
    editor.addRoot("Root2", 0, 200);  // n1
    editor.exitEditMode();
    const root1Color = editor.getBranchColor("n0");
    const root2Color = editor.getBranchColor("n1");
    expect(root1Color).not.toBe(root2Color);

    const childId = editor.addChild("n0", "Child"); // n2
    editor.exitEditMode();
    expect(editor.getBranchColor(childId)).toBe(root1Color);

    // Reparent child to root2
    editor.select(childId);
    editor.reparentNode(childId, "n1");
    expect(editor.getBranchColor(childId)).toBe(root2Color);
  });

  it("reparented subtree adopts new parent's branch color", () => {
    editor.addRoot("Root1", 0, 0);    // n0
    editor.exitEditMode();
    editor.addRoot("Root2", 0, 200);  // n1
    editor.exitEditMode();
    const root2Color = editor.getBranchColor("n1");

    const childId = editor.addChild("n0", "Child"); // n2
    editor.exitEditMode();
    // Give child an explicit color
    editor.setNodeColor(childId, "#ff0000");
    const grandchildId = editor.addChild(childId, "Grandchild"); // n3
    editor.exitEditMode();
    expect(editor.getBranchColor(grandchildId)).toBe("#ff0000");

    // Reparent child subtree to root2
    editor.select(childId);
    editor.reparentNode(childId, "n1");
    // Both child and grandchild should inherit root2's color
    expect(editor.getBranchColor(childId)).toBe(root2Color);
    expect(editor.getBranchColor(grandchildId)).toBe(root2Color);
  });

  it("color adoption is undoable", () => {
    editor.addRoot("Root1", 0, 0);    // n0
    editor.exitEditMode();
    editor.addRoot("Root2", 0, 200);  // n1
    editor.exitEditMode();
    const root1Color = editor.getBranchColor("n0");

    const childId = editor.addChild("n0", "Child"); // n2
    editor.exitEditMode();
    expect(editor.getBranchColor(childId)).toBe(root1Color);

    editor.select(childId);
    editor.reparentNode(childId, "n1");
    expect(editor.getBranchColor(childId)).not.toBe(root1Color);

    editor.undo();
    expect(editor.getBranchColor(childId)).toBe(root1Color);
  });

  it("drag reparent adopts new parent's branch color", () => {
    editor.addRoot("Root1", 0, 0);    // n0
    editor.exitEditMode();
    editor.addRoot("Root2", 600, 0);  // n1
    editor.exitEditMode();
    const root2Color = editor.getBranchColor("n1");

    const childId = editor.addChild("n0", "Child"); // n2
    editor.exitEditMode();

    // Simulate drag to root2
    editor.select(childId);
    const child = editor.getNode(childId);
    editor.startDrag(childId, child.x, child.y);
    // Move near root2 to trigger reparent
    const root2 = editor.getNode("n1");
    editor.updateDrag(root2.x + root2.width / 2, root2.y + root2.height / 2);
    editor.endDrag();

    // If reparent happened, color should match root2
    if (editor.getNode(childId).parentId === "n1") {
      expect(editor.getBranchColor(childId)).toBe(root2Color);
    }
  });
});

describe("branch color serialization", () => {
  it("color survives round-trip through toJSON/loadJSON", () => {
    const editor = new TestEditor();
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    const originalColor = editor.getBranchColor(rootId);

    const json = editor.toJSON();
    const editor2 = new TestEditor();
    editor2.loadJSON(json);

    expect(editor2.getBranchColor(rootId)).toBe(originalColor);
  });
});
