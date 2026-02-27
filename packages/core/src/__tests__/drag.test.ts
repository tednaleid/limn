// ABOUTME: Tests for drag-to-reposition and drag-to-reparent node interactions.
// ABOUTME: Verifies pointer simulation, subtree movement, undo, and reparent proximity.

import { describe, it, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { resetIdCounter } from "../store/MindMapStore";

describe("drag to reposition", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  function createSimpleTree(): TestEditor {
    const editor = new TestEditor();
    // Root at (0, 0), child at (250, 0), grandchild at (500, 0)
    editor.addRoot("root", 0, 0);
    editor.select("n0");
    editor.exitEditMode();
    editor.addChild("n0", "child");
    editor.exitEditMode();
    editor.addChild("n1", "grandchild");
    editor.exitEditMode();
    return editor;
  }

  it("should start and end a drag on a node", () => {
    const editor = createSimpleTree();
    editor.pointerDown("n1", 260, 10);
    expect(editor.isDragging()).toBe(true);
    editor.pointerUp();
    expect(editor.isDragging()).toBe(false);
  });

  it("should move a node to a new position during drag", () => {
    const editor = createSimpleTree();
    const originalX = editor.getNode("n1").x;
    const originalY = editor.getNode("n1").y;

    editor.pointerDown("n1", originalX + 10, originalY + 10);
    editor.pointerMove(originalX + 60, originalY + 110);
    editor.pointerUp();

    // Node should have moved by (50, 100)
    expect(editor.getNode("n1").x).toBeCloseTo(originalX + 50, 0);
    expect(editor.getNode("n1").y).toBeCloseTo(originalY + 100, 0);
  });

  it("should move entire subtree as a rigid unit", () => {
    const editor = createSimpleTree();
    const childX = editor.getNode("n1").x;
    const childY = editor.getNode("n1").y;
    const grandchildX = editor.getNode("n2").x;
    const grandchildY = editor.getNode("n2").y;

    // Drag child node by (50, 100)
    editor.pointerDown("n1", childX + 10, childY + 10);
    editor.pointerMove(childX + 60, childY + 110);
    editor.pointerUp();

    // Both child and grandchild should have moved by (50, 100)
    expect(editor.getNode("n1").x).toBeCloseTo(childX + 50, 0);
    expect(editor.getNode("n1").y).toBeCloseTo(childY + 100, 0);
    expect(editor.getNode("n2").x).toBeCloseTo(grandchildX + 50, 0);
    expect(editor.getNode("n2").y).toBeCloseTo(grandchildY + 100, 0);
  });

  it("should select the dragged node", () => {
    const editor = createSimpleTree();
    editor.select("n0");
    editor.exitEditMode();

    const childX = editor.getNode("n1").x;
    const childY = editor.getNode("n1").y;

    editor.pointerDown("n1", childX + 10, childY + 10);
    expect(editor.getSelectedId()).toBe("n1");
    editor.pointerUp();
  });

  it("should be undoable as a single operation", () => {
    const editor = createSimpleTree();
    const originalX = editor.getNode("n1").x;
    const originalY = editor.getNode("n1").y;

    // Drag with multiple moves
    editor.pointerDown("n1", originalX + 10, originalY + 10);
    editor.pointerMove(originalX + 30, originalY + 30);
    editor.pointerMove(originalX + 60, originalY + 110);
    editor.pointerUp();

    expect(editor.getNode("n1").x).toBeCloseTo(originalX + 50, 0);

    // Single undo should revert the entire drag
    editor.undo();
    expect(editor.getNode("n1").x).toBeCloseTo(originalX, 0);
    expect(editor.getNode("n1").y).toBeCloseTo(originalY, 0);
  });

  it("should not move anything if pointer doesn't move", () => {
    const editor = createSimpleTree();
    const originalX = editor.getNode("n1").x;
    const originalY = editor.getNode("n1").y;

    editor.pointerDown("n1", originalX + 10, originalY + 10);
    editor.pointerUp();

    expect(editor.getNode("n1").x).toBe(originalX);
    expect(editor.getNode("n1").y).toBe(originalY);
  });

  it("should exit edit mode when starting a drag", () => {
    const editor = createSimpleTree();
    editor.select("n0");
    editor.enterEditMode();
    expect(editor.isEditing()).toBe(true);

    const childX = editor.getNode("n1").x;
    const childY = editor.getNode("n1").y;
    editor.pointerDown("n1", childX + 10, childY + 10);
    expect(editor.isEditing()).toBe(false);
  });
});

describe("drag to reparent", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  function createTwoChildTree(): TestEditor {
    const editor = new TestEditor();
    // Root at (0, 0)
    editor.addRoot("root", 0, 0);
    editor.select("n0");
    editor.exitEditMode();
    // child1 at (250, ~y1)
    editor.addChild("n0", "child1");
    editor.exitEditMode();
    // child2 at (250, ~y2)
    editor.addChild("n0", "child2");
    editor.exitEditMode();
    return editor;
  }

  it("should detect reparent target when dragged onto another node", () => {
    const editor = createTwoChildTree();
    const child1 = editor.getNode("n1");
    const child2 = editor.getNode("n2");

    // Drag child1 onto child2 (center on center)
    editor.pointerDown("n1", child1.x + 10, child1.y + 10);
    editor.pointerMove(child2.x + 10, child2.y + 10);

    expect(editor.getReparentTarget()).toBe("n2");
    editor.pointerUp();
  });

  it("should reparent node when dropped on another node and position as child", () => {
    const editor = createTwoChildTree();
    const child1 = editor.getNode("n1");
    const child2 = editor.getNode("n2");

    // Drag child1 onto child2
    editor.pointerDown("n1", child1.x + 10, child1.y + 10);
    editor.pointerMove(child2.x + 10, child2.y + 10);
    editor.pointerUp();

    // child1 should now be a child of child2
    expect(editor.getNode("n1").parentId).toBe("n2");
    editor.expectChildren("n0", ["n2"]);
    editor.expectChildren("n2", ["n1"]);

    // child1 should be positioned as a proper child (to the right of child2)
    const reparented = editor.getNode("n1");
    expect(reparented.x).toBeGreaterThan(child2.x);
  });

  it("should move children along with reparented node", () => {
    const editor = createTwoChildTree();
    // Add a grandchild under child1
    editor.addChild("n1", "grandchild");
    editor.exitEditMode();

    const child1 = editor.getNode("n1");
    const grandchild = editor.getNode("n3");
    const child2 = editor.getNode("n2");

    // Record horizontal offset between child1 and grandchild
    const relX = grandchild.x - child1.x;

    // Drag child1 (with its grandchild) onto child2
    editor.pointerDown("n1", child1.x + 10, child1.y + 10);
    editor.pointerMove(child2.x + 10, child2.y + 10);
    editor.pointerUp();

    // Grandchild should have moved with child1, preserving relative offset
    const movedChild1 = editor.getNode("n1");
    const movedGrandchild = editor.getNode("n3");
    expect(movedGrandchild.x - movedChild1.x).toBeCloseTo(relX, 0);
    expect(movedChild1.parentId).toBe("n2");
    expect(movedGrandchild.parentId).toBe("n1");
  });

  it("should not reparent when dropped in open space", () => {
    const editor = createTwoChildTree();
    const child1 = editor.getNode("n1");

    // Drag child1 to open space far from any node
    editor.pointerDown("n1", child1.x + 10, child1.y + 10);
    editor.pointerMove(1000, 1000);
    editor.pointerUp();

    // child1 should still be a child of root
    expect(editor.getNode("n1").parentId).toBe("n0");
  });

  it("should reflow children when node is dragged to other side of root", () => {
    const editor = new TestEditor();
    // Root at (0, 0), child at (250, 0), grandchild at (500, 0)
    editor.addRoot("root", 0, 0);
    editor.select("n0");
    editor.exitEditMode();
    editor.addChild("n0", "child");
    editor.exitEditMode();
    editor.addChild("n1", "grandchild");
    editor.exitEditMode();

    // child (n1) is to the right of root, grandchild (n2) is further right
    expect(editor.getNode("n1").x).toBeGreaterThan(editor.getNode("n0").x);
    expect(editor.getNode("n2").x).toBeGreaterThan(editor.getNode("n1").x);

    // Drag child to the left side of root
    const child = editor.getNode("n1");
    editor.pointerDown("n1", child.x + 10, child.y + 10);
    editor.pointerMove(-300, child.y + 10);
    editor.pointerUp();

    // child should now be to the left of root
    expect(editor.getNode("n1").x).toBeLessThan(editor.getNode("n0").x);
    // grandchild should also be to the left of child (further from root)
    expect(editor.getNode("n2").x).toBeLessThan(editor.getNode("n1").x);
  });

  it("should not allow reparent to own descendant", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.select("n0");
    editor.exitEditMode();
    editor.addChild("n0", "parent");
    editor.exitEditMode();
    editor.addChild("n1", "child");
    editor.exitEditMode();

    const parent = editor.getNode("n1");
    const child = editor.getNode("n2");

    // Drag parent onto its own child
    editor.pointerDown("n1", parent.x + 10, parent.y + 10);
    editor.pointerMove(child.x + 10, child.y + 10);

    // Should NOT detect child as reparent target
    expect(editor.getReparentTarget()).toBeNull();
    editor.pointerUp();

    // parent should still have child as its child, not the other way around
    expect(editor.getNode("n1").parentId).toBe("n0");
  });

  it("should clear reparent target after drop", () => {
    const editor = createTwoChildTree();
    const child1 = editor.getNode("n1");
    const child2 = editor.getNode("n2");

    editor.pointerDown("n1", child1.x + 10, child1.y + 10);
    editor.pointerMove(child2.x + 10, child2.y + 10);
    expect(editor.getReparentTarget()).toBe("n2");

    editor.pointerUp();
    expect(editor.getReparentTarget()).toBeNull();
  });

  it("should be undoable as a single operation", () => {
    const editor = createTwoChildTree();
    const child1 = editor.getNode("n1");
    const child2 = editor.getNode("n2");
    const origParent = child1.parentId;

    editor.pointerDown("n1", child1.x + 10, child1.y + 10);
    editor.pointerMove(child2.x + 10, child2.y + 10);
    editor.pointerUp();

    expect(editor.getNode("n1").parentId).toBe("n2");

    editor.undo();
    expect(editor.getNode("n1").parentId).toBe(origParent);
  });
});

describe("drag to reorder siblings", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  function createThreeChildTree(): TestEditor {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.select("n0");
    editor.exitEditMode();
    editor.addChild("n0", "child1");
    editor.exitEditMode();
    editor.addChild("n0", "child2");
    editor.exitEditMode();
    editor.addChild("n0", "child3");
    editor.exitEditMode();
    return editor;
  }

  it("should reorder when dragged past adjacent sibling downward", () => {
    const editor = createThreeChildTree();
    editor.expectChildren("n0", ["n1", "n2", "n3"]);

    const child1 = editor.getNode("n1");
    const child2 = editor.getNode("n2");
    const child2CenterY = child2.y + child2.height / 2;

    // Drag child1 down past child2's center
    editor.pointerDown("n1", child1.x + 10, child1.y + 10);
    editor.pointerMove(child1.x + 10, child2CenterY + 5);
    editor.pointerUp();

    // child1 and child2 should have swapped
    editor.expectChildren("n0", ["n2", "n1", "n3"]);
  });

  it("should reorder when dragged past adjacent sibling upward", () => {
    const editor = createThreeChildTree();
    editor.expectChildren("n0", ["n1", "n2", "n3"]);

    const child2 = editor.getNode("n2");
    const child1 = editor.getNode("n1");

    // Drag child2 well above child1 (accounting for drag offset)
    editor.pointerDown("n2", child2.x + 10, child2.y + 10);
    editor.pointerMove(child2.x + 10, child1.y - 20);
    editor.pointerUp();

    // child1 and child2 should have swapped
    editor.expectChildren("n0", ["n2", "n1", "n3"]);
  });

  it("should handle fast drag past multiple siblings", () => {
    const editor = createThreeChildTree();
    editor.expectChildren("n0", ["n1", "n2", "n3"]);

    const child1 = editor.getNode("n1");
    const child3 = editor.getNode("n3");
    const child3CenterY = child3.y + child3.height / 2;

    // Drag child1 all the way past child3 in one move
    editor.pointerDown("n1", child1.x + 10, child1.y + 10);
    editor.pointerMove(child1.x + 10, child3CenterY + 5);
    editor.pointerUp();

    // child1 should now be last
    editor.expectChildren("n0", ["n2", "n3", "n1"]);
  });

  it("should snap to correct layout position on drop", () => {
    const editor = createThreeChildTree();

    const child1 = editor.getNode("n1");
    const child2 = editor.getNode("n2");
    const child2CenterY = child2.y + child2.height / 2;

    // Drag child1 past child2
    editor.pointerDown("n1", child1.x + 10, child1.y + 10);
    editor.pointerMove(child1.x + 10, child2CenterY + 5);
    editor.pointerUp();

    // After drop, all children should have proper layout positions
    const n2 = editor.getNode("n2");
    const n1 = editor.getNode("n1");
    const n3 = editor.getNode("n3");
    // Order is now n2, n1, n3 - they should be vertically ordered
    expect(n2.y).toBeLessThan(n1.y);
    expect(n1.y).toBeLessThan(n3.y);
  });

  it("should not reorder root nodes", () => {
    const editor = new TestEditor();
    editor.addRoot("root1", 0, 0);
    editor.select("n0");
    editor.exitEditMode();
    editor.addRoot("root2", 0, 100);
    editor.select("n1");
    editor.exitEditMode();

    // Drag root1 down past root2 - should just reposition, not reorder
    editor.pointerDown("n0", 10, 10);
    editor.pointerMove(10, 160);
    editor.pointerUp();

    // Root order unchanged (roots don't have siblings to reorder with)
    expect(editor.getNode("n0").parentId).toBeNull();
    expect(editor.getNode("n1").parentId).toBeNull();
  });

  it("should be undoable", () => {
    const editor = createThreeChildTree();
    editor.expectChildren("n0", ["n1", "n2", "n3"]);

    const child1 = editor.getNode("n1");
    const child2 = editor.getNode("n2");
    const child2CenterY = child2.y + child2.height / 2;

    editor.pointerDown("n1", child1.x + 10, child1.y + 10);
    editor.pointerMove(child1.x + 10, child2CenterY + 5);
    editor.pointerUp();

    editor.expectChildren("n0", ["n2", "n1", "n3"]);

    editor.undo();
    editor.expectChildren("n0", ["n1", "n2", "n3"]);
  });

  it("should slide non-dragged siblings during drag", () => {
    const editor = createThreeChildTree();

    const child1 = editor.getNode("n1");
    const child2yBefore = editor.getNode("n2").y;
    const child2 = editor.getNode("n2");

    // Drag child1 well past child2 (accounting for drag offset) but don't release
    editor.pointerDown("n1", child1.x + 10, child1.y + 10);
    editor.pointerMove(child1.x + 10, child2.y + child2.height + 20);

    // During drag, child2 should have slid upward to fill the gap
    expect(editor.getNode("n2").y).toBeLessThan(child2yBefore);

    editor.pointerUp();
  });
});
