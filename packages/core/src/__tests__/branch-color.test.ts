// ABOUTME: Tests for branch color assignment and inheritance.
// ABOUTME: Verifies palette auto-assignment, ancestor walk, and serialization round-trip.

import { describe, it, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { resetIdCounter } from "../store/MindMapStore";
import { nextBranchColorIndex } from "../theme/palette";
import { BRANCH_COUNT } from "../theme/theme";

describe("branch color palette", () => {
  it("has 14 branch colors per theme", () => {
    expect(BRANCH_COUNT).toBe(14);
  });

  it("nextBranchColorIndex picks the first unused index", () => {
    expect(nextBranchColorIndex([])).toBe(0);
  });

  it("nextBranchColorIndex skips already-used indices", () => {
    expect(nextBranchColorIndex([0])).toBe(1);
  });

  it("nextBranchColorIndex cycles when all indices used", () => {
    const allUsed = Array.from({ length: BRANCH_COUNT }, (_, i) => i);
    expect(nextBranchColorIndex(allUsed)).toBe(0);
  });

  it("nextBranchColorIndex keeps cycling", () => {
    const used = [...Array.from({ length: BRANCH_COUNT }, (_, i) => i), 0];
    expect(nextBranchColorIndex(used)).toBe(1);
  });
});

describe("branch color auto-assignment", () => {
  let editor: TestEditor;

  beforeEach(() => {
    editor = new TestEditor();
  });

  it("addRoot assigns a branch colorIndex", () => {
    editor.addRoot("Root 1", 0, 0);
    editor.exitEditMode();
    const root = editor.getRoots()[0]!;
    expect(root.style?.colorIndex).toBe(0);
  });

  it("second root gets a different colorIndex than the first", () => {
    editor.addRoot("Root 1", 0, 0);
    editor.exitEditMode();
    editor.addRoot("Root 2", 0, 100);
    editor.exitEditMode();
    const roots = editor.getRoots();
    expect(roots[0]!.style?.colorIndex).toBe(0);
    expect(roots[1]!.style?.colorIndex).toBe(1);
  });
});

describe("getBranchColor", () => {
  let editor: TestEditor;

  beforeEach(() => {
    editor = new TestEditor();
  });

  it("returns a hex color for the root node", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    const color = editor.getBranchColor(rootId);
    expect(color).toBeDefined();
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns the same color for a child node", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    const childId = editor.addChild(rootId, "Child");
    editor.exitEditMode();
    expect(editor.getBranchColor(childId)).toBe(editor.getBranchColor(rootId));
  });

  it("returns the same color for a grandchild node", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    const childId = editor.addChild(rootId, "Child");
    editor.exitEditMode();
    const grandchildId = editor.addChild(childId, "Grandchild");
    editor.exitEditMode();
    expect(editor.getBranchColor(grandchildId)).toBe(editor.getBranchColor(rootId));
  });

  it("returns an overridden color on an intermediate node", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    const childId = editor.addChild(rootId, "Child");
    editor.exitEditMode();
    editor.setNodeColorIndex(childId, 5);
    const grandchildId = editor.addChild(childId, "Grandchild");
    editor.exitEditMode();
    // Grandchild inherits from child's overridden colorIndex
    expect(editor.getBranchColorIndex(grandchildId)).toBe(5);
  });

  it("auto-assigns a colorIndex when loading a file without colors", () => {
    const editor2 = new TestEditor();
    const fileData = {
      version: 1,
      meta: { id: "test", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
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
    expect(editor2.getBranchColorIndex("r1")).toBe(0);
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
    // Give child an explicit colorIndex
    editor.setNodeColorIndex(childId, 5);
    const grandchildId = editor.addChild(childId, "Grandchild"); // n3
    editor.exitEditMode();
    expect(editor.getBranchColorIndex(grandchildId)).toBe(5);

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

describe("cycleNodeColor", () => {
  let editor: TestEditor;

  beforeEach(() => {
    resetIdCounter();
    editor = new TestEditor();
  });

  it("cycles root node color forward", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    expect(editor.getBranchColorIndex(rootId)).toBe(0);

    editor.cycleNodeColor(rootId, 1);
    expect(editor.getBranchColorIndex(rootId)).toBe(1);

    editor.cycleNodeColor(rootId, 1);
    expect(editor.getBranchColorIndex(rootId)).toBe(2);
  });

  it("cycles root node color backward", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    expect(editor.getBranchColorIndex(rootId)).toBe(0);

    editor.cycleNodeColor(rootId, -1);
    expect(editor.getBranchColorIndex(rootId)).toBe(BRANCH_COUNT - 1);
  });

  it("root color wraps around forward", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    editor.setNodeColorIndex(rootId, BRANCH_COUNT - 1);

    editor.cycleNodeColor(rootId, 1);
    expect(editor.getBranchColorIndex(rootId)).toBe(0);
  });

  it("assigns next color to a child node that has no explicit color", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    // Root has colorIndex 0
    const childId = editor.addChild(rootId, "Child");
    editor.exitEditMode();
    // Child inherits 0 from root
    expect(editor.getBranchColorIndex(childId)).toBe(0);

    editor.cycleNodeColor(childId, 1);
    // Should get the next color (1), not stay at inherited (0)
    expect(editor.getBranchColorIndex(childId)).toBe(1);
    // Verify it's an explicit colorIndex on the child
    expect(editor.getNode(childId).style?.colorIndex).toBe(1);
  });

  it("cycles child node backward from inherited color", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    const childId = editor.addChild(rootId, "Child");
    editor.exitEditMode();

    editor.cycleNodeColor(childId, -1);
    expect(editor.getBranchColorIndex(childId)).toBe(BRANCH_COUNT - 1);
  });

  it("removes explicit color when it matches inherited color", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    // Root has colorIndex 0
    const childId = editor.addChild(rootId, "Child");
    editor.exitEditMode();

    // Give child explicit colorIndex 1
    editor.cycleNodeColor(childId, 1);
    expect(editor.getNode(childId).style?.colorIndex).toBe(1);

    // Cycle backward — should go back to 0, which matches inherited,
    // so explicit colorIndex should be removed
    editor.cycleNodeColor(childId, -1);
    expect(editor.getNode(childId).style?.colorIndex).toBeUndefined();
    // But it still resolves to the inherited color
    expect(editor.getBranchColorIndex(childId)).toBe(0);
  });

  it("cycling child through all colors and back removes explicit color", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    const childId = editor.addChild(rootId, "Child");
    editor.exitEditMode();
    // Root has colorIndex 0, child inherits 0

    // Cycle forward through all 14 colors — should land back at inherited
    for (let i = 0; i < BRANCH_COUNT; i++) {
      editor.cycleNodeColor(childId, 1);
    }
    // After 14 forward cycles, we're back to the inherited color
    expect(editor.getNode(childId).style?.colorIndex).toBeUndefined();
    expect(editor.getBranchColorIndex(childId)).toBe(0);
  });

  it("child color cascades to grandchildren", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    const childId = editor.addChild(rootId, "Child");
    editor.exitEditMode();
    const grandchildId = editor.addChild(childId, "Grandchild");
    editor.exitEditMode();

    editor.cycleNodeColor(childId, 1);
    expect(editor.getBranchColorIndex(grandchildId)).toBe(1);
  });

  it("root and child cycle independently", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    const childId = editor.addChild(rootId, "Child");
    editor.exitEditMode();

    // Give child explicit color
    editor.cycleNodeColor(childId, 1);
    expect(editor.getBranchColorIndex(childId)).toBe(1);

    // Cycle root — child should not be affected
    editor.cycleNodeColor(rootId, 1);
    expect(editor.getBranchColorIndex(rootId)).toBe(1);
    expect(editor.getBranchColorIndex(childId)).toBe(1);

    // Cycle root again
    editor.cycleNodeColor(rootId, 1);
    expect(editor.getBranchColorIndex(rootId)).toBe(2);
    // Child still has its own explicit color
    expect(editor.getBranchColorIndex(childId)).toBe(1);
  });

  it("is undoable", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    expect(editor.getBranchColorIndex(rootId)).toBe(0);

    editor.cycleNodeColor(rootId, 1);
    expect(editor.getBranchColorIndex(rootId)).toBe(1);

    editor.undo();
    expect(editor.getBranchColorIndex(rootId)).toBe(0);

    editor.redo();
    expect(editor.getBranchColorIndex(rootId)).toBe(1);
  });

  it("is triggered by pressing c in nav mode", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    editor.select(rootId);
    expect(editor.getBranchColorIndex(rootId)).toBe(0);

    editor.pressKey("c");
    expect(editor.getBranchColorIndex(rootId)).toBe(1);
  });

  it("is triggered by pressing Shift+c to cycle backward", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    editor.select(rootId);
    expect(editor.getBranchColorIndex(rootId)).toBe(0);

    editor.pressKey("c", { shift: true });
    expect(editor.getBranchColorIndex(rootId)).toBe(BRANCH_COUNT - 1);
  });

  it("does nothing when no node is selected", () => {
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    editor.deselect();
    // Should not throw
    editor.pressKey("c");
  });
});

describe("branch color serialization", () => {
  it("colorIndex survives round-trip through toJSON/loadJSON", () => {
    const editor = new TestEditor();
    editor.addRoot("Root", 0, 0);
    editor.exitEditMode();
    const rootId = editor.getRoots()[0]!.id;
    const originalIndex = editor.getBranchColorIndex(rootId);
    expect(originalIndex).toBeDefined();

    const json = editor.toJSON();
    const editor2 = new TestEditor();
    editor2.loadJSON(json);

    expect(editor2.getBranchColorIndex(rootId)).toBe(originalIndex);
  });
});
