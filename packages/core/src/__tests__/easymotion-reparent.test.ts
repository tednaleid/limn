// ABOUTME: Tests for Alt+; EasyMotion reparent feature.
// ABOUTME: Verifies keyboard-driven reparent via EasyMotion label picking.

import { describe, test, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { resetIdCounter } from "../store/MindMapStore";

describe("EasyMotion reparent (Alt+;)", () => {
  let editor: TestEditor;

  beforeEach(() => {
    resetIdCounter();
  });

  // Helper: root with 3 children
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

  // Helper: two separate root trees
  function createTwoRoots(): TestEditor {
    editor = new TestEditor();
    editor.addRoot("root1", 0, 0);
    editor.select("n0");
    editor.exitEditMode();
    editor.addChild("n0", "child1");
    editor.exitEditMode();
    editor.addRoot("root2", 0, 200);
    editor.exitEditMode();
    return editor;
  }

  test("Alt+; with nothing selected is no-op", () => {
    editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();
    editor.deselect();
    editor.pressKey(";", { alt: true });
    expect(editor.isEasyMotionActive()).toBe(false);
  });

  test("Alt+; enters EasyMotion reparent mode", () => {
    createThreeChildTree();
    editor.select("n1");
    editor.pressKey(";", { alt: true });
    expect(editor.isEasyMotionActive()).toBe(true);
    expect(editor.getEasyMotionMode()).toBe("reparent");
  });

  test("labels exclude selected node", () => {
    createThreeChildTree();
    editor.select("n1");
    editor.pressKey(";", { alt: true });
    expect(editor.getEasyMotionLabel("n1")).toBeUndefined();
  });

  test("labels exclude current parent", () => {
    createThreeChildTree();
    editor.select("n1");
    editor.pressKey(";", { alt: true });
    // n0 is parent of n1, should not have a label
    expect(editor.getEasyMotionLabel("n0")).toBeUndefined();
  });

  test("labels exclude descendants", () => {
    createThreeChildTree();
    // Add a grandchild to n1
    editor.addChild("n1", "grandchild");
    editor.exitEditMode();
    // Select n1 (which has grandchild n4)
    editor.select("n1");
    editor.pressKey(";", { alt: true });
    expect(editor.getEasyMotionLabel("n4")).toBeUndefined();
  });

  test("labels include valid targets (siblings)", () => {
    createThreeChildTree();
    editor.select("n1");
    editor.pressKey(";", { alt: true });
    // n2 and n3 are siblings, valid reparent targets
    expect(editor.getEasyMotionLabel("n2")).toBeDefined();
    expect(editor.getEasyMotionLabel("n3")).toBeDefined();
  });

  test("typing a label reparents the selected node", () => {
    createThreeChildTree();
    editor.select("n1"); // child1
    editor.pressKey(";", { alt: true });

    // Find the label for n2
    const label = editor.getEasyMotionLabel("n2");
    expect(label).toBeDefined();

    // Type the label
    for (const ch of label!) {
      editor.pressKey(ch);
    }

    // n1 should now be a child of n2
    expect(editor.getNode("n1").parentId).toBe("n2");
    expect(editor.isEasyMotionActive()).toBe(false);
  });

  test("reparented node stays selected", () => {
    createThreeChildTree();
    editor.select("n1");
    editor.pressKey(";", { alt: true });

    const label = editor.getEasyMotionLabel("n2");
    for (const ch of label!) {
      editor.pressKey(ch);
    }

    editor.expectSelected("n1");
  });

  test("reparenting a root node works", () => {
    createTwoRoots();
    // n2 is root2, reparent it to be child of n0 (root1)
    editor.select("n2");
    expect(editor.getNode("n2").parentId).toBeNull();

    editor.pressKey(";", { alt: true });

    const label = editor.getEasyMotionLabel("n0");
    expect(label).toBeDefined();
    for (const ch of label!) {
      editor.pressKey(ch);
    }

    expect(editor.getNode("n2").parentId).toBe("n0");
  });

  test("reparenting is undoable", () => {
    createThreeChildTree();
    editor.select("n1");
    editor.pressKey(";", { alt: true });

    const label = editor.getEasyMotionLabel("n2");
    for (const ch of label!) {
      editor.pressKey(ch);
    }

    expect(editor.getNode("n1").parentId).toBe("n2");

    editor.undo();

    expect(editor.getNode("n1").parentId).toBe("n0");
    editor.expectChildren("n0", ["n1", "n2", "n3"]);
  });

  test("collapsed target is uncollapsed after reparent", () => {
    createThreeChildTree();
    // Collapse n2
    editor.select("n2");
    editor.pressKey(" "); // toggle collapse
    editor.expectCollapsed("n2");

    editor.select("n3");
    editor.pressKey(";", { alt: true });

    const label = editor.getEasyMotionLabel("n2");
    for (const ch of label!) {
      editor.pressKey(ch);
    }

    // n3 reparented to n2, and n2 should be uncollapsed
    expect(editor.getNode("n3").parentId).toBe("n2");
    editor.expectExpanded("n2");
  });

  test("Escape cancels reparent mode", () => {
    createThreeChildTree();
    editor.select("n1");
    editor.pressKey(";", { alt: true });
    expect(editor.isEasyMotionActive()).toBe(true);

    editor.pressKey("Escape");
    expect(editor.isEasyMotionActive()).toBe(false);
    // Node should not have moved
    expect(editor.getNode("n1").parentId).toBe("n0");
  });

  test("reparent to far-off parent pans camera to show both node and new parent", () => {
    editor = new TestEditor();
    editor.setViewportSize(800, 600);
    editor.addRoot("root1", 0, 0);
    editor.select("n0");
    editor.exitEditMode();
    editor.addChild("n0", "child1");
    editor.exitEditMode();

    // Create a second root far away
    editor.addRoot("root2", 0, 2000);
    editor.select("n2");
    editor.exitEditMode();

    // Select child1 and reparent to root2 via EasyMotion
    editor.select("n1");
    const cameraBefore = editor.getCamera();
    editor.pressKey(";", { alt: true });

    const label = editor.getEasyMotionLabel("n2");
    expect(label).toBeDefined();
    for (const ch of label!) {
      editor.pressKey(ch);
    }

    expect(editor.getNode("n1").parentId).toBe("n2");
    // Camera should have panned to keep both n1 and n2 visible
    const cameraAfter = editor.getCamera();
    expect(cameraAfter.y).not.toBe(cameraBefore.y);
  });

  test("invalid label cancels reparent mode", () => {
    createThreeChildTree();
    editor.select("n1");
    editor.pressKey(";", { alt: true });
    expect(editor.isEasyMotionActive()).toBe(true);

    // Type a key that doesn't match any label
    editor.pressKey("9");
    expect(editor.isEasyMotionActive()).toBe(false);
    // Node should not have moved
    expect(editor.getNode("n1").parentId).toBe("n0");
  });

  test("reparented node's children are reflowed to new position", () => {
    createThreeChildTree();
    // Add grandchildren to n1
    editor.addChild("n1", "gc1");
    editor.exitEditMode();
    editor.addChild("n1", "gc2");
    editor.exitEditMode();

    // Reparent n1 (with its two children) under n2
    editor.select("n1");
    editor.pressKey(";", { alt: true });

    const label = editor.getEasyMotionLabel("n2");
    expect(label).toBeDefined();
    for (const ch of label!) {
      editor.pressKey(ch);
    }

    expect(editor.getNode("n1").parentId).toBe("n2");

    const n1 = editor.getNode("n1");
    const gc1 = editor.getNode("n4");
    const gc2 = editor.getNode("n5");

    // Children should be centered around the reparented node's y
    const childMidY = (gc1.y + gc2.y) / 2;
    expect(Math.abs(childMidY - n1.y)).toBeLessThan(1);

    // Children x should be offset from their parent (n1), not at old position
    expect(gc1.x).toBeGreaterThan(n1.x);
    expect(gc2.x).toBeGreaterThan(n1.x);
    expect(gc1.x).toBe(gc2.x);
  });
});
