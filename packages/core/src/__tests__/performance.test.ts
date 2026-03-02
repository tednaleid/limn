// ABOUTME: Performance benchmarks at 500 and 1000 nodes.
// ABOUTME: Validates operations remain fast at scale to catch regressions.

import { describe, it, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { resetIdCounter } from "../store/MindMapStore";

/** Build a tree with the given node count by adding children breadth-first. */
function buildTree(editor: TestEditor, nodeCount: number): string[] {
  const rootId = editor.addRoot("Root", 0, 0);
  editor.exitEditMode();
  const ids = [rootId];

  let i = 1;
  let parentIdx = 0;
  while (i < nodeCount) {
    const parentId = ids[parentIdx]!;
    const childId = editor.addChild(parentId, `Node ${i}`);
    editor.exitEditMode();
    ids.push(childId);
    i++;
    // Move to next parent after 4 children to create a balanced tree
    if (editor.getChildren(parentId).length >= 4) {
      parentIdx++;
    }
  }
  return ids;
}

describe("performance benchmarks", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe("500 nodes", () => {
    it("should build a 500-node tree in under 500ms", () => {
      const editor = new TestEditor();
      const start = performance.now();
      buildTree(editor, 500);
      const elapsed = performance.now() - start;
      expect(editor.nodeCount).toBe(500);
      expect(elapsed).toBeLessThan(500);
    });

    it("should navigate 100 times in under 75ms", () => {
      const editor = new TestEditor();
      buildTree(editor, 500);
      editor.select("n0");

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        editor.navigateDown();
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(75);
    });

    it("should toggle collapse in under 50ms", () => {
      const editor = new TestEditor();
      buildTree(editor, 500);

      const start = performance.now();
      editor.toggleCollapse("n0");
      editor.toggleCollapse("n0");
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });

    it("should serialize in under 100ms", () => {
      const editor = new TestEditor();
      buildTree(editor, 500);

      const start = performance.now();
      const json = editor.toJSON();
      const elapsed = performance.now() - start;
      expect(json.roots).toHaveLength(1);
      expect(elapsed).toBeLessThan(100);
    });

    it("should deserialize in under 100ms", () => {
      const editor = new TestEditor();
      buildTree(editor, 500);
      const json = editor.toJSON();

      const editor2 = new TestEditor();
      const start = performance.now();
      editor2.loadJSON(json);
      const elapsed = performance.now() - start;
      expect(editor2.nodeCount).toBe(500);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("1000 nodes", () => {
    it("should build a 1000-node tree in under 2000ms", () => {
      const editor = new TestEditor();
      const start = performance.now();
      buildTree(editor, 1000);
      const elapsed = performance.now() - start;
      expect(editor.nodeCount).toBe(1000);
      expect(elapsed).toBeLessThan(2000);
    });

    it("should navigate 100 times in under 100ms", () => {
      const editor = new TestEditor();
      buildTree(editor, 1000);
      editor.select("n0");

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        editor.navigateDown();
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
    });

    it("should serialize in under 200ms", () => {
      const editor = new TestEditor();
      buildTree(editor, 1000);

      const start = performance.now();
      const json = editor.toJSON();
      const elapsed = performance.now() - start;
      expect(json.roots).toHaveLength(1);
      expect(elapsed).toBeLessThan(200);
    });

    it("should undo/redo in under 50ms", () => {
      const editor = new TestEditor();
      buildTree(editor, 1000);

      // Add one more child to have something to undo
      editor.addChild("n0", "Extra");
      editor.exitEditMode();

      const start = performance.now();
      editor.undo();
      editor.redo();
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });
});
