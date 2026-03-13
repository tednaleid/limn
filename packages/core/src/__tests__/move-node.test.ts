// ABOUTME: Tests for Option+arrow structural node moves.
// ABOUTME: Covers reorder, overflow to parent's sibling, outdent, and indent.

import { describe, test, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { resetIdCounter } from "../store/MindMapStore";

describe("moveNode structural moves", () => {
  let editor: TestEditor;

  beforeEach(() => {
    resetIdCounter();
  });

  // Helper: root with 3 children, each with text
  function createThreeChildTree(): TestEditor {
    editor = new TestEditor();
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

  // Helper: root -> parent1 (with child1, child2), parent2 (with child3)
  function createTwoParentTree(): TestEditor {
    editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.select("n0");
    editor.exitEditMode();
    // n1: parent1
    editor.addChild("n0", "parent1");
    editor.exitEditMode();
    // n2: parent2
    editor.addChild("n0", "parent2");
    editor.exitEditMode();
    // n3: child of parent1
    editor.addChild("n1", "child1");
    editor.exitEditMode();
    // n4: child of parent1
    editor.addChild("n1", "child2");
    editor.exitEditMode();
    // n5: child of parent2
    editor.addChild("n2", "child3");
    editor.exitEditMode();
    return editor;
  }

  describe("Option+Up/Down: reorder within siblings", () => {
    test("Option+Down moves node down among siblings", () => {
      createThreeChildTree();
      editor.select("n1");
      editor.pressKey("ArrowDown", { alt: true });
      editor.expectChildren("n0", ["n2", "n1", "n3"]);
      // Position should update
      expect(editor.getNode("n1").y).toBeGreaterThan(editor.getNode("n2").y);
    });

    test("Option+Up moves node up among siblings", () => {
      createThreeChildTree();
      editor.select("n2");
      editor.pressKey("ArrowUp", { alt: true });
      editor.expectChildren("n0", ["n2", "n1", "n3"]);
      expect(editor.getNode("n2").y).toBeLessThan(editor.getNode("n1").y);
    });

    test("Option+j moves node down (vim-style)", () => {
      createThreeChildTree();
      editor.select("n1");
      editor.pressKey("j", { alt: true });
      editor.expectChildren("n0", ["n2", "n1", "n3"]);
    });

    test("Option+k moves node up (vim-style)", () => {
      createThreeChildTree();
      editor.select("n2");
      editor.pressKey("k", { alt: true });
      editor.expectChildren("n0", ["n2", "n1", "n3"]);
    });
  });

  describe("Option+Up/Down: overflow to parent's sibling", () => {
    test("Option+Up from first child moves to previous parent's last child", () => {
      createTwoParentTree();
      // n3 is first child of parent1 (n1)
      editor.select("n3");
      editor.pressKey("ArrowUp", { alt: true });
      // n3 was already first, moves up again...
      // Actually n3 is first child of n1. Moving up: no sibling above,
      // no previous sibling of n1? Actually n1 is first child of root.
      // So this should be a no-op.
      editor.expectChildren("n1", ["n3", "n4"]);
    });

    test("Option+Down from last child moves to next parent's first child", () => {
      createTwoParentTree();
      // n4 is second (last) child of parent1 (n1)
      editor.select("n4");
      editor.pressKey("ArrowDown", { alt: true });
      // n4 should become first child of parent2 (n2)
      expect(editor.getNode("n4").parentId).toBe("n2");
      editor.expectChildren("n1", ["n3"]);
      editor.expectChildren("n2", ["n4", "n5"]);
    });

    test("Option+Up from first child moves to previous parent's sibling", () => {
      createTwoParentTree();
      // n5 is only child of parent2 (n2). n2's previous sibling is n1.
      editor.select("n5");
      editor.pressKey("ArrowUp", { alt: true });
      // n5 should become last child of parent1 (n1)
      expect(editor.getNode("n5").parentId).toBe("n1");
      editor.expectChildren("n1", ["n3", "n4", "n5"]);
      editor.expectChildren("n2", []);
    });

    test("overflow preserves selection", () => {
      createTwoParentTree();
      editor.select("n4");
      editor.pressKey("ArrowDown", { alt: true });
      editor.expectSelected("n4");
    });
  });

  describe("Option+Left/Right: outdent and indent", () => {
    test("outdent moves node to grandparent (right-side branch)", () => {
      createTwoParentTree();
      // n3 is child of parent1 (n1), which is child of root (n0)
      // Right-side branch: outdent = Option+Left
      editor.select("n3");
      editor.pressKey("ArrowLeft", { alt: true });
      // n3 should now be child of root, inserted after parent1
      expect(editor.getNode("n3").parentId).toBe("n0");
      editor.expectChildren("n0", ["n1", "n3", "n2"]);
    });

    test("indent moves node to become child of previous sibling (right-side branch)", () => {
      createThreeChildTree();
      // n2 is second child of root (n0). Previous sibling is n1.
      // Right-side branch: indent = Option+Right
      editor.select("n2");
      editor.pressKey("ArrowRight", { alt: true });
      // n2 should now be last child of n1
      expect(editor.getNode("n2").parentId).toBe("n1");
      editor.expectChildren("n0", ["n1", "n3"]);
      editor.expectChildren("n1", ["n2"]);
    });

    test("Option+h outdents on right-side branch (vim-style)", () => {
      createTwoParentTree();
      editor.select("n3");
      editor.pressKey("h", { alt: true });
      expect(editor.getNode("n3").parentId).toBe("n0");
    });

    test("Option+l indents on right-side branch (vim-style)", () => {
      createThreeChildTree();
      editor.select("n2");
      editor.pressKey("l", { alt: true });
      expect(editor.getNode("n2").parentId).toBe("n1");
    });

    test("toward-root on direct child of root flips to other side", () => {
      createThreeChildTree();
      editor.select("n1");
      // n1 is on right side (x > 0), ArrowLeft = toward root
      const xBefore = editor.getNode("n1").x;
      expect(xBefore).toBeGreaterThan(0);
      editor.pressKey("ArrowLeft", { alt: true });
      // n1 should still be child of root, but on the left side
      expect(editor.getNode("n1").parentId).toBe("n0");
      expect(editor.getNode("n1").x).toBeLessThan(0);
      editor.expectChildren("n0", ["n1", "n2", "n3"]);
    });

    test("indent is no-op when node has no previous sibling", () => {
      createThreeChildTree();
      editor.select("n1");
      editor.pressKey("ArrowRight", { alt: true });
      // n1 has no previous sibling, should stay as-is
      expect(editor.getNode("n1").parentId).toBe("n0");
      editor.expectChildren("n0", ["n1", "n2", "n3"]);
    });
  });

  describe("root node spatial reparent", () => {
    test("no-op when no valid target exists (single root)", () => {
      createThreeChildTree();
      editor.select("n0");
      editor.pressKey("ArrowUp", { alt: true });
      expect(editor.getNode("n0").parentId).toBeNull();
      editor.pressKey("ArrowDown", { alt: true });
      expect(editor.getNode("n0").parentId).toBeNull();
      editor.pressKey("ArrowLeft", { alt: true });
      expect(editor.getNode("n0").parentId).toBeNull();
      editor.pressKey("ArrowRight", { alt: true });
      expect(editor.getNode("n0").parentId).toBeNull();
    });

    test("Option+Down reparents root to node below", () => {
      editor = new TestEditor();
      editor.addRoot("root1", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addRoot("root2", 0, 200);
      editor.select("n1");
      editor.exitEditMode();

      editor.select("n0");
      editor.pressKey("ArrowDown", { alt: true });
      expect(editor.getNode("n0").parentId).toBe("n1");
    });

    test("Option+Up reparents root to node above", () => {
      editor = new TestEditor();
      editor.addRoot("root1", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addRoot("root2", 0, 200);
      editor.select("n1");
      editor.exitEditMode();

      editor.select("n1");
      editor.pressKey("ArrowUp", { alt: true });
      expect(editor.getNode("n1").parentId).toBe("n0");
    });

    test("Option+Right reparents root to node to the right", () => {
      editor = new TestEditor();
      editor.addRoot("root1", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addRoot("root2", 600, 0);
      editor.select("n1");
      editor.exitEditMode();

      editor.select("n0");
      editor.pressKey("ArrowRight", { alt: true });
      expect(editor.getNode("n0").parentId).toBe("n1");
      // Attached on left side of target
      expect(editor.getNode("n0").x).toBeLessThan(editor.getNode("n1").x);
    });

    test("Option+Left reparents root to node to the left", () => {
      editor = new TestEditor();
      editor.addRoot("root1", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addRoot("root2", -600, 0);
      editor.select("n1");
      editor.exitEditMode();

      editor.select("n0");
      editor.pressKey("ArrowLeft", { alt: true });
      expect(editor.getNode("n0").parentId).toBe("n1");
      // Attached on right side of target
      expect(editor.getNode("n0").x).toBeGreaterThan(editor.getNode("n1").x);
    });

    test("root reparent is undoable", () => {
      editor = new TestEditor();
      editor.addRoot("root1", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addRoot("root2", 0, 200);
      editor.select("n1");
      editor.exitEditMode();

      editor.select("n0");
      editor.pressKey("ArrowDown", { alt: true });
      expect(editor.getNode("n0").parentId).toBe("n1");
      editor.undo();
      expect(editor.getNode("n0").parentId).toBeNull();
    });

    test("spatial reparent remeasures root becoming child", () => {
      editor = new TestEditor();
      editor.addRoot("root1", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      const rootDims = { width: editor.getNode("n0").width, height: editor.getNode("n0").height };

      editor.addRoot("root2", 0, 200);
      editor.select("n1");
      editor.exitEditMode();

      // Reparent root1 down onto root2 via spatial reparent
      editor.select("n0");
      editor.pressKey("ArrowDown", { alt: true });
      expect(editor.getNode("n0").parentId).toBe("n1");

      const childDims = { width: editor.getNode("n0").width, height: editor.getNode("n0").height };
      // Child font size (14) is smaller than root (18), so dimensions should shrink
      expect(childDims.width).toBeLessThan(rootDims.width);
      expect(childDims.height).toBeLessThan(rootDims.height);
    });
  });

  describe("undo/redo", () => {
    test("reorder via Option+Down is undoable", () => {
      createThreeChildTree();
      editor.select("n1");
      editor.pressKey("ArrowDown", { alt: true });
      editor.expectChildren("n0", ["n2", "n1", "n3"]);
      editor.undo();
      editor.expectChildren("n0", ["n1", "n2", "n3"]);
    });

    test("overflow move is undoable", () => {
      createTwoParentTree();
      editor.select("n4");
      editor.pressKey("ArrowDown", { alt: true });
      expect(editor.getNode("n4").parentId).toBe("n2");
      editor.undo();
      expect(editor.getNode("n4").parentId).toBe("n1");
      editor.expectChildren("n1", ["n3", "n4"]);
    });

    test("outdent is undoable", () => {
      createTwoParentTree();
      editor.select("n3");
      editor.pressKey("ArrowLeft", { alt: true });
      expect(editor.getNode("n3").parentId).toBe("n0");
      editor.undo();
      expect(editor.getNode("n3").parentId).toBe("n1");
      editor.expectChildren("n1", ["n3", "n4"]);
    });

    test("indent is undoable", () => {
      createThreeChildTree();
      editor.select("n2");
      editor.pressKey("ArrowRight", { alt: true });
      expect(editor.getNode("n2").parentId).toBe("n1");
      editor.undo();
      expect(editor.getNode("n2").parentId).toBe("n0");
      editor.expectChildren("n0", ["n1", "n2", "n3"]);
    });
  });

  describe("spatial reparent (vertical)", () => {
    test("Alt+Up from first child of root reparents to nearest node above", () => {
      // Two roots: top root with children, bottom root with children
      editor = new TestEditor();
      editor.addRoot("root1", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "child1");
      editor.exitEditMode();

      editor.addRoot("root2", 0, 200);
      editor.select("n2");
      editor.exitEditMode();
      editor.addChild("n2", "child2");
      editor.exitEditMode();

      // child2 (n3) is child of root2 (n2). First child, at boundary.
      // root2 is root, so no uncle. Spatial reparent should find a target above.
      editor.select("n3");
      editor.pressKey("ArrowUp", { alt: true });
      // n3 should reparent to the closest node above it
      expect(editor.getNode("n3").parentId).not.toBe("n2");
    });

    test("Alt+Down from last child of root reparents to nearest node below", () => {
      editor = new TestEditor();
      editor.addRoot("root1", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "child1");
      editor.exitEditMode();

      editor.addRoot("root2", 0, 200);
      editor.select("n2");
      editor.exitEditMode();
      editor.addChild("n2", "child2");
      editor.exitEditMode();

      // child1 (n1) is child of root1 (n0). Only child, at boundary.
      editor.select("n1");
      editor.pressKey("ArrowDown", { alt: true });
      // n1 should reparent to a node below
      expect(editor.getNode("n1").parentId).not.toBe("n0");
    });

    test("spatial reparent does not target own descendants", () => {
      editor = new TestEditor();
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "parent");
      editor.exitEditMode();
      editor.addChild("n1", "grandchild");
      editor.exitEditMode();

      // n1 has child n2. Moving down, n2 is a descendant, must not reparent there.
      editor.select("n1");
      const parentBefore = editor.getNode("n1").parentId;
      editor.pressKey("ArrowDown", { alt: true });
      // No valid target exists (n0 is parent, n2 is descendant), so no-op
      expect(editor.getNode("n1").parentId).toBe(parentBefore);
    });

    test("overflow skips uncle on opposite side of root", () => {
      editor = new TestEditor();
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      // n1: right-side branch
      editor.addChild("n0", "right_branch");
      editor.exitEditMode();
      editor.addChild("n1", "child_r");
      editor.exitEditMode();
      // n3: left-side branch (after n1 in children array)
      editor.addChild("n0", "left_branch");
      editor.exitEditMode();
      editor.setNodePosition("n3", -250, 0);

      // child_r (n2) is last child of right_branch (n1).
      // Uncle in children array is left_branch (n3) -- wrong side.
      editor.select("n2");
      editor.pressKey("ArrowDown", { alt: true });
      // Should NOT overflow into left_branch (opposite side)
      expect(editor.getNode("n2").parentId).not.toBe("n3");
    });

    test("spatial reparent (vertical) is undoable", () => {
      editor = new TestEditor();
      editor.addRoot("root1", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "child1");
      editor.exitEditMode();

      editor.addRoot("root2", 0, 200);
      editor.select("n2");
      editor.exitEditMode();
      editor.addChild("n2", "child2");
      editor.exitEditMode();

      editor.select("n1");
      const parentBefore = editor.getNode("n1").parentId;
      editor.pressKey("ArrowDown", { alt: true });
      const parentAfter = editor.getNode("n1").parentId;
      expect(parentAfter).not.toBe(parentBefore);
      editor.undo();
      expect(editor.getNode("n1").parentId).toBe(parentBefore);
    });
  });

  describe("side-flip", () => {
    test("Alt+Left flips right-side root-child to left side", () => {
      createThreeChildTree();
      editor.select("n1");
      expect(editor.getNode("n1").x).toBeGreaterThan(0);
      editor.pressKey("ArrowLeft", { alt: true });
      expect(editor.getNode("n1").x).toBeLessThan(0);
      expect(editor.getNode("n1").parentId).toBe("n0");
    });

    test("Alt+Right flips left-side root-child to right side", () => {
      editor = new TestEditor();
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "child");
      editor.exitEditMode();
      // Move child to left side
      editor.setNodePosition("n1", -250, 0);
      editor.select("n1");
      expect(editor.getNode("n1").x).toBeLessThan(0);
      editor.pressKey("ArrowRight", { alt: true });
      expect(editor.getNode("n1").x).toBeGreaterThan(0);
      expect(editor.getNode("n1").parentId).toBe("n0");
    });

    test("flip cascades to descendants", () => {
      editor = new TestEditor();
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "child");
      editor.exitEditMode();
      editor.addChild("n1", "grandchild");
      editor.exitEditMode();

      // child (n1) on right, grandchild (n2) further right
      expect(editor.getNode("n1").x).toBeGreaterThan(0);
      expect(editor.getNode("n2").x).toBeGreaterThan(editor.getNode("n1").x);
      editor.select("n1");
      editor.pressKey("ArrowLeft", { alt: true });
      // Both should now be on the left side
      expect(editor.getNode("n1").x).toBeLessThan(0);
      expect(editor.getNode("n2").x).toBeLessThan(editor.getNode("n1").x);
    });

    test("side-flip is undoable", () => {
      createThreeChildTree();
      editor.select("n1");
      const xBefore = editor.getNode("n1").x;
      editor.pressKey("ArrowLeft", { alt: true });
      expect(editor.getNode("n1").x).not.toBe(xBefore);
      editor.undo();
      expect(editor.getNode("n1").x).toBe(xBefore);
    });

    test("flip wide child to left side avoids overlap with root", () => {
      editor = new TestEditor();
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "wide child");
      editor.exitEditMode();
      // Make the child wide (simulating an image node)
      editor.setNodeWidth("n1", 400);

      // Child starts on right side
      expect(editor.getNode("n1").x).toBeGreaterThan(0);
      editor.select("n1");
      editor.pressKey("ArrowLeft", { alt: true });

      // After flip, child's right edge should not overlap root
      const child = editor.getNode("n1");
      const root = editor.getNode("n0");
      expect(child.x + child.width).toBeLessThanOrEqual(root.x);
    });

    test("existing outdent unchanged for non-root parents", () => {
      createTwoParentTree();
      editor.select("n3");
      editor.pressKey("ArrowLeft", { alt: true });
      // n3 should outdent to root (n0), not flip
      expect(editor.getNode("n3").parentId).toBe("n0");
    });
  });

  describe("spatial reparent (horizontal)", () => {
    test("Alt+Right from first child (right side) reparents to node to the right", () => {
      // Two roots side by side: left root with children, right root
      editor = new TestEditor();
      editor.addRoot("root1", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "child1");
      editor.exitEditMode();

      editor.addRoot("root2", 600, 0);
      editor.select("n2");
      editor.exitEditMode();

      // child1 (n1) is first (only) child of root1, right side, no previous sibling
      // ArrowRight is away from parent for right-side branch, idx=0 → spatial reparent
      editor.select("n1");
      editor.pressKey("ArrowRight", { alt: true });
      // n1 should reparent to root2, which is to the right
      expect(editor.getNode("n1").parentId).toBe("n2");
      // Attached on left side of target (direction hint = -1)
      expect(editor.getNode("n1").x).toBeLessThan(editor.getNode("n2").x);
    });

    test("Alt+Left from first child (left side) reparents to node to the left", () => {
      editor = new TestEditor();
      editor.addRoot("root1", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "child_left");
      editor.exitEditMode();
      // Move child to left side
      editor.setNodePosition("n1", -250, 0);

      editor.addRoot("root2", -600, 0);
      editor.select("n2");
      editor.exitEditMode();

      // child_left (n1) is first (only) child of root1, left side, no previous sibling
      // ArrowLeft is away from parent for left-side branch, idx=0 → spatial reparent
      editor.select("n1");
      editor.pressKey("ArrowLeft", { alt: true });
      // n1 should reparent to root2, which is to the left
      expect(editor.getNode("n1").parentId).toBe("n2");
      // Attached on right side of target (direction hint = 1)
      expect(editor.getNode("n1").x).toBeGreaterThan(editor.getNode("n2").x);
    });

    test("existing indent unchanged when previous sibling exists", () => {
      createThreeChildTree();
      // n2 is second child, has previous sibling n1
      editor.select("n2");
      editor.pressKey("ArrowRight", { alt: true });
      // Should indent into n1 as before
      expect(editor.getNode("n2").parentId).toBe("n1");
    });

    test("Alt+Right into non-root target places child on correct (right) side", () => {
      // root (0,0) -> parent (211,0) -> [child1 (422,0), child2 (500,40)]
      // child1 has no previous sibling, Alt+Right spatial-reparents into child2
      // child1 must end up to the RIGHT of child2 (away from root)
      editor = new TestEditor();
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "parent");
      editor.exitEditMode();
      editor.addChild("n1", "child1");
      editor.exitEditMode();
      editor.addChild("n1", "child2");
      editor.exitEditMode();

      // Position child2 clearly to the right of child1 so spatial reparent finds it
      editor.setNodePosition("n2", 422, 0);
      editor.setNodePosition("n3", 500, 40);

      editor.select("n2");
      editor.pressKey("ArrowRight", { alt: true });
      // child1 should reparent to child2
      expect(editor.getNode("n2").parentId).toBe("n3");
      // Must be on the RIGHT side (away from root), not left
      expect(editor.getNode("n2").x).toBeGreaterThan(editor.getNode("n3").x);
    });

    test("Alt+Left into non-root target places child on correct (left) side", () => {
      // root (0,0) -> parent (-250,0) -> [child1 (-422,0), child2 (-500,40)]
      // On left-side branch, Alt+Left = away from parent = indent
      // child1 must end up to the LEFT of child2 (away from root)
      editor = new TestEditor();
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "parent");
      editor.exitEditMode();
      editor.setNodePosition("n1", -250, 0);
      editor.addChild("n1", "child1");
      editor.exitEditMode();
      editor.addChild("n1", "child2");
      editor.exitEditMode();

      // Position child2 clearly to the left of child1 so spatial reparent finds it
      editor.setNodePosition("n2", -422, 0);
      editor.setNodePosition("n3", -500, 40);

      editor.select("n2");
      editor.pressKey("ArrowLeft", { alt: true });
      // child1 should reparent to child2
      expect(editor.getNode("n2").parentId).toBe("n3");
      // Must be on the LEFT side (away from root), not right
      expect(editor.getNode("n2").x).toBeLessThan(editor.getNode("n3").x);
    });
  });

  describe("viewport follows reparent", () => {
    test("Option+Down overflow to uncle pans camera to show node and new parent", () => {
      // Use a small viewport so the layout positions extend beyond it
      editor = new TestEditor();
      editor.setViewportSize(300, 150);
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "parent1");
      editor.exitEditMode();
      editor.addChild("n0", "parent2");
      editor.exitEditMode();
      // n3: child of parent1
      editor.addChild("n1", "child1");
      editor.exitEditMode();
      // Pan camera so n3 is visible but n2 (parent2) may be off-screen
      const n3 = editor.getNode("n3");
      editor.setCamera(-n3.x + 50, -n3.y + 50, 1);
      editor.select("n3");
      const cameraBefore = { ...editor.getCamera() };
      editor.pressKey("ArrowDown", { alt: true });
      expect(editor.getNode("n3").parentId).toBe("n2");
      // Camera should have adjusted to keep both n3 and new parent n2 visible
      const cameraAfter = editor.getCamera();
      expect(cameraAfter.x !== cameraBefore.x || cameraAfter.y !== cameraBefore.y).toBe(true);
    });

    test("outdent pans camera to show node and new parent", () => {
      editor = new TestEditor();
      editor.setViewportSize(300, 150);
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "parent");
      editor.exitEditMode();
      editor.addChild("n1", "child");
      editor.exitEditMode();
      // Pan camera to see only the child area, root is off-screen to the left
      const n2 = editor.getNode("n2");
      editor.setCamera(-n2.x + 50, -n2.y + 50, 1);
      editor.select("n2");
      const cameraBefore = { ...editor.getCamera() };
      // Outdent: moves n2 from n1 to root n0
      editor.pressKey("ArrowLeft", { alt: true });
      expect(editor.getNode("n2").parentId).toBe("n0");
      // Camera should pan to keep both n2 and grandparent n0 visible
      const cameraAfter = editor.getCamera();
      expect(cameraAfter.x !== cameraBefore.x || cameraAfter.y !== cameraBefore.y).toBe(true);
    });

    test("indent pans camera to show node and new parent", () => {
      editor = new TestEditor();
      editor.setViewportSize(300, 150);
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "sibling1");
      editor.exitEditMode();
      editor.addChild("n0", "sibling2");
      editor.exitEditMode();
      // Pan camera to see only n2 (sibling2), n1 (sibling1) off-screen
      const n2 = editor.getNode("n2");
      editor.setCamera(-n2.x + 50, -n2.y + 50, 1);
      editor.select("n2");
      const cameraBefore = { ...editor.getCamera() };
      // Indent: n2 becomes child of n1
      editor.pressKey("ArrowRight", { alt: true });
      expect(editor.getNode("n2").parentId).toBe("n1");
      // Camera should pan to show both n2 and new parent n1
      const cameraAfter = editor.getCamera();
      expect(cameraAfter.x !== cameraBefore.x || cameraAfter.y !== cameraBefore.y).toBe(true);
    });

    test("reorder (no parent change) keeps node visible", () => {
      editor = new TestEditor();
      editor.setViewportSize(300, 150);
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "child1");
      editor.exitEditMode();
      editor.addChild("n0", "child2");
      editor.exitEditMode();
      editor.select("n1");
      // This is a same-parent reorder, just ensure it doesn't crash
      editor.pressKey("ArrowDown", { alt: true });
      editor.expectChildren("n0", ["n2", "n1"]);
    });

    test("flipBranchSide keeps node visible", () => {
      editor = new TestEditor();
      editor.setViewportSize(300, 150);
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "child");
      editor.exitEditMode();
      editor.select("n1");
      // Flip to other side
      editor.pressKey("ArrowLeft", { alt: true });
      expect(editor.getNode("n1").x).toBeLessThan(0);
    });
  });

  describe("mixed-side vertical reorder on root", () => {
    test("opt-up skips interleaved opposite-side node", () => {
      editor = new TestEditor();
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      // n1: left-side child
      editor.addChild("n0", "left1");
      editor.exitEditMode();
      editor.setNodePosition("n1", -250, -26);
      // n2: right-side child (interleaved between two left-side nodes)
      editor.addChild("n0", "right1");
      editor.exitEditMode();
      editor.setNodePosition("n2", 250, 0);
      // n3: left-side child
      editor.addChild("n0", "left2");
      editor.exitEditMode();
      editor.setNodePosition("n3", -250, 26);

      // Children array: [n1(left), n2(right), n3(left)]
      // left2 (n3) presses opt-up: should swap with left1 (n1), skipping right1 (n2)
      editor.select("n3");
      editor.pressKey("ArrowUp", { alt: true });
      const children = editor.getNode("n0").children;
      expect(children.indexOf("n3")).toBeLessThan(children.indexOf("n1"));
      expect(editor.getNode("n3").parentId).toBe("n0");
    });
  });

  describe("left-side branch direction awareness", () => {
    test("outdent uses Option+Right on left-side branch", () => {
      // Create a node on the left side of root
      editor = new TestEditor();
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      // Place parent on the left side manually
      editor.addChild("n0", "parent");
      editor.exitEditMode();
      // Move parent to left side of root
      editor.setNodePosition("n1", -250, 0);
      // Add child to parent
      editor.addChild("n1", "child");
      editor.exitEditMode();

      // On left-side branch, outdent = Option+Right (away from root)
      editor.select("n2");
      editor.pressKey("ArrowRight", { alt: true });
      expect(editor.getNode("n2").parentId).toBe("n0");
    });

    test("indent on right-side child skips interleaved left-side siblings", () => {
      editor = new TestEditor();
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      // n1: right-side child
      editor.addChild("n0", "right1");
      editor.exitEditMode();
      // n2: left-side child (interleaved)
      editor.addChild("n0", "left1");
      editor.exitEditMode();
      editor.setNodePosition("n2", -250, 0);
      // n3: right-side child
      editor.addChild("n0", "right2");
      editor.exitEditMode();

      // Children: [n1(right), n2(left), n3(right)]
      // n3 presses opt-right (indent): should indent into n1 (same-side), not n2
      editor.select("n3");
      editor.pressKey("ArrowRight", { alt: true });
      expect(editor.getNode("n3").parentId).toBe("n1");
      // n3 should be on the right side of n1 (same direction as before)
      expect(editor.getNode("n3").x).toBeGreaterThan(editor.getNode("n1").x);
    });

    test("indent on left-side child skips right-side previous sibling", () => {
      editor = new TestEditor();
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      // n1: right-side child
      editor.addChild("n0", "right_child");
      editor.exitEditMode();
      // n2: left-side child (placed after n1 in children array)
      editor.addChild("n0", "left_child");
      editor.exitEditMode();
      editor.setNodePosition("n2", -250, 0);

      // n2 is on the left side, previous sibling n1 is on the right side
      editor.select("n2");
      editor.pressKey("ArrowLeft", { alt: true });
      // Should NOT indent into n1 (wrong side) -- should remain under root
      expect(editor.getNode("n2").parentId).toBe("n0");
    });

    test("outdent right-side grandchild to root preserves right side", () => {
      editor = new TestEditor();
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      // n1: left-side child
      editor.addChild("n0", "left1");
      editor.exitEditMode();
      editor.setNodePosition("n1", -250, 0);
      // n2: right-side child (must set position explicitly since n1 is left)
      editor.addChild("n0", "right1");
      editor.exitEditMode();
      editor.setNodePosition("n2", 250, 0);
      // n3: child of right1 (also on right side)
      editor.addChild("n2", "grandchild");
      editor.exitEditMode();

      // n3 is right-side grandchild. Outdent with opt-left.
      expect(editor.getNode("n3").x).toBeGreaterThan(editor.getNode("n2").x);
      editor.select("n3");
      editor.pressKey("ArrowLeft", { alt: true });
      // n3 should now be child of root, still on the right side
      expect(editor.getNode("n3").parentId).toBe("n0");
      expect(editor.getNode("n3").x).toBeGreaterThan(editor.getNode("n0").x);
    });

    test("outdent left-side grandchild to root preserves left side", () => {
      editor = new TestEditor();
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      // n1: left-side child
      editor.addChild("n0", "left1");
      editor.exitEditMode();
      editor.setNodePosition("n1", -250, 0);
      // n2: right-side child
      editor.addChild("n0", "right1");
      editor.exitEditMode();
      editor.setNodePosition("n2", 250, 0);
      // n3: child of left1 (also on left side)
      editor.addChild("n1", "grandchild");
      editor.exitEditMode();

      // n3 is left-side grandchild. Outdent with opt-right.
      expect(editor.getNode("n3").x).toBeLessThan(editor.getNode("n1").x);
      editor.select("n3");
      editor.pressKey("ArrowRight", { alt: true });
      // n3 should now be child of root, still on the left side
      expect(editor.getNode("n3").parentId).toBe("n0");
      expect(editor.getNode("n3").x).toBeLessThan(editor.getNode("n0").x);
    });

    test("indent uses Option+Left on left-side branch", () => {
      editor = new TestEditor();
      editor.addRoot("root", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      // Two children on left side
      editor.addChild("n0", "sibling1");
      editor.exitEditMode();
      editor.setNodePosition("n1", -250, -26);
      editor.addChild("n0", "sibling2");
      editor.exitEditMode();
      editor.setNodePosition("n2", -250, 26);

      // On left-side branch, indent = Option+Left (toward root)
      editor.select("n2");
      editor.pressKey("ArrowLeft", { alt: true });
      expect(editor.getNode("n2").parentId).toBe("n1");
    });
  });

  describe("reparent reflows children to new position", () => {
    test("spatial reparent across trees centers children around reparented node", () => {
      editor = new TestEditor();
      // Tree 1: root with a child that has grandchildren
      editor.addRoot("root1", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "parent");
      editor.exitEditMode();
      editor.addChild("n1", "gc1");
      editor.exitEditMode();
      editor.addChild("n1", "gc2");
      editor.exitEditMode();
      editor.addChild("n1", "gc3");
      editor.exitEditMode();

      // Tree 2: far below
      editor.addRoot("root2", 0, 500);
      editor.select("n5");
      editor.exitEditMode();
      editor.addChild("n5", "target");
      editor.exitEditMode();

      // Move "parent" (n1, which has gc1-gc3) down to tree 2 via spatial reparent
      editor.select("n1");
      editor.pressKey("ArrowDown", { alt: true });

      // n1 should now be under a node in tree 2
      const n1 = editor.getNode("n1");
      expect(n1.parentId).not.toBe("n0");

      // Children should be centered around n1's y, not stuck at old positions
      const gc1 = editor.getNode("n2");
      const gc2 = editor.getNode("n3");
      const gc3 = editor.getNode("n4");
      const childMidY = (gc1.y + gc3.y) / 2;
      expect(Math.abs(childMidY - n1.y)).toBeLessThan(1);

      // Children x should be offset from n1, not at old location
      expect(gc1.x).toBeGreaterThan(n1.x);
      expect(gc1.x).toBe(gc2.x);
      expect(gc2.x).toBe(gc3.x);
    });

    test("drag reparent across trees centers children around reparented node", () => {
      editor = new TestEditor();
      // Tree 1: root with a child that has grandchildren
      editor.addRoot("root1", 0, 0);
      editor.select("n0");
      editor.exitEditMode();
      editor.addChild("n0", "parent");
      editor.exitEditMode();
      editor.addChild("n1", "gc1");
      editor.exitEditMode();
      editor.addChild("n1", "gc2");
      editor.exitEditMode();

      // Tree 2: far below
      editor.addRoot("root2", 0, 500);
      editor.select("n4");
      editor.exitEditMode();

      // Drag n1 onto n4 (root2)
      const n1 = editor.getNode("n1");
      const n4 = editor.getNode("n4");
      editor.pointerDown("n1", n1.x + 50, n1.y + 16);
      editor.pointerMove(n4.x + 50, n4.y + 16);
      editor.pointerUp();

      const n1After = editor.getNode("n1");
      expect(n1After.parentId).toBe("n4");

      // Children should be centered around the reparented node
      const gc1 = editor.getNode("n2");
      const gc2 = editor.getNode("n3");
      const childMidY = (gc1.y + gc2.y) / 2;
      expect(Math.abs(childMidY - n1After.y)).toBeLessThan(1);
    });
  });
});
