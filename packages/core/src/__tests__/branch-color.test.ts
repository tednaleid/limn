// ABOUTME: Tests for branch color assignment and inheritance.
// ABOUTME: Verifies palette auto-assignment, ancestor walk, and serialization round-trip.

import { describe, it, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
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
